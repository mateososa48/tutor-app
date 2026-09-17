// Pure, browser-free pieces of the GPT-Live client so they can be unit-tested
// with node:test:
//   - TranscriptAssembler: turns transcript delta fragments into utterances.
//   - BackendTurnTracker: runs the Responses tool loop over `response.event`s.

import type { ToolCallResult, TutorActivity } from "./live-types";

type Role = "tutor" | "student";

/** Whether a transcript fragment carries its own spacing (" okay,", "that "). */
export function hasBoundarySpace(text: string): boolean {
  return /^\s|\s$/.test(text);
}

/**
 * Joins two transcript fragments. In a spaced stream (the model sends each
 * piece with its own spaces, so "tri"+"cky" is one word) pieces are simply
 * concatenated. Trimmed pieces (older recordings, assembled utterances) get a
 * space unless the next piece is punctuation.
 */
export function joinTranscript(a: string, b: string, spaced = false): string {
  if (!a) return b.trimStart();
  if (!b) return a;
  if (/\s$/.test(a)) return a + b.trimStart();
  if (spaced || /^\s/.test(b)) return a + b;
  if (/^[.,!?;:%)\]}'’”…]/.test(b) || /[-–—([{'‘“/]$/.test(a)) return a + b;
  return `${a} ${b}`;
}

// ── Transcript assembly ────────────────────────────────────────────────────
// GPT-Live streams `session.input_transcript.delta` / `session.output_transcript.delta`
// as small fragments with no turn boundaries. We buffer per speaker and flush
// an utterance when the speaker pauses (gapMs), the buffer gets long, or the
// other speaker starts a new utterance.

export type TranscriptAssemblerOptions = {
  gapMs?: number;
  maxChars?: number;
  now?: () => number;
  onFlush: (role: Role, text: string, at: number) => void;
  onPartial?: (role: Role, text: string) => void;
};

type Buffer = {
  text: string;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
};

export class TranscriptAssembler {
  private readonly gapMs: number;
  private readonly maxChars: number;
  private readonly now: () => number;
  private readonly onFlush: TranscriptAssemblerOptions["onFlush"];
  private readonly onPartial?: TranscriptAssemblerOptions["onPartial"];
  private buffers: Record<Role, Buffer> = {
    tutor: { text: "", startedAt: 0, timer: null },
    student: { text: "", startedAt: 0, timer: null },
  };

  constructor(opts: TranscriptAssemblerOptions) {
    this.gapMs = opts.gapMs ?? 900;
    this.maxChars = opts.maxChars ?? 420;
    this.now = opts.now ?? (() => Date.now());
    this.onFlush = opts.onFlush;
    this.onPartial = opts.onPartial;
  }

  push(role: Role, delta: string): void {
    if (!delta) return;
    const other: Role = role === "tutor" ? "student" : "tutor";
    // A new speaker starting an utterance closes the other speaker's buffer so
    // entries stay in a sensible order even though both can talk at once.
    if (this.buffers[role].text === "" && this.buffers[other].text !== "") {
      this.flush(other);
    }
    const buf = this.buffers[role];
    if (buf.text === "") buf.startedAt = this.now();
    buf.text += delta;
    this.onPartial?.(role, buf.text.trim());
    if (buf.timer) clearTimeout(buf.timer);
    if (buf.text.length >= this.maxChars && /[.!?]\s*$/.test(buf.text)) {
      this.flush(role);
      return;
    }
    buf.timer = setTimeout(() => {
      buf.timer = null;
      this.flush(role);
    }, this.gapMs);
  }

  flush(role: Role): void {
    const buf = this.buffers[role];
    if (buf.timer) {
      clearTimeout(buf.timer);
      buf.timer = null;
    }
    const text = buf.text.trim();
    const at = buf.startedAt || this.now();
    buf.text = "";
    buf.startedAt = 0;
    if (text) this.onFlush(role, text, at);
  }

  flushAll(): void {
    this.flush("student");
    this.flush("tutor");
  }

  partial(role: Role): string {
    return this.buffers[role].text.trim();
  }
}

// ── Backend (Responses) tool loop ──────────────────────────────────────────
// With Responses delegation the Live session streams the backend's Responses
// events wrapped as `{type:"response.event", event:{…}}`. Function calls arrive
// as `response.output_item.done` items; we execute them on the whiteboard,
// return `function_call_output` items, and once the backend response has
// completed we send `response.create` so the backend can continue with the
// results. Text output is what the voice model will speak.

export type BackendClientEvent =
  | { type: "response.item.create"; event_id?: string; item: Record<string, unknown> }
  | { type: "response.create"; event_id?: string };

export type BackendTurnHandlers = {
  execute: (name: string, args: Record<string, unknown>, callId: string) => Promise<ToolCallResult> | ToolCallResult;
  send: (event: BackendClientEvent) => boolean;
  onActivity: (activity: TutorActivity) => void;
  onBackendText?: (text: string) => void;
  debug?: (kind: string, message: string, payload?: Record<string, unknown>) => void;
};

export class BackendTurnTracker {
  private sawFunctionCall = false;
  private responseDone = false;
  private pending = 0;
  private counter = 0;
  private activity: TutorActivity = "idle";

  constructor(private readonly h: BackendTurnHandlers) {}

  get currentActivity(): TutorActivity {
    return this.activity;
  }

  private setActivity(next: TutorActivity) {
    if (this.activity === next) return;
    this.activity = next;
    this.h.onActivity(next);
  }

  handleDelegationCreated(): void {
    this.setActivity("thinking");
  }

  reset(): void {
    this.sawFunctionCall = false;
    this.responseDone = false;
    this.pending = 0;
    this.setActivity("idle");
  }

  async handleResponseEvent(nested: Record<string, unknown>): Promise<void> {
    const type = typeof nested.type === "string" ? nested.type : "";
    switch (type) {
      case "response.created": {
        this.sawFunctionCall = false;
        this.responseDone = false;
        this.pending = 0;
        this.setActivity("thinking");
        return;
      }
      case "response.output_item.done": {
        const item = nested.item as Record<string, unknown> | undefined;
        if (item?.type !== "function_call") return;
        await this.runFunctionCall(item);
        return;
      }
      case "response.output_text.done": {
        const text = typeof nested.text === "string" ? nested.text : "";
        if (text) this.h.onBackendText?.(text);
        return;
      }
      case "response.completed": {
        this.responseDone = true;
        if (!this.sawFunctionCall) {
          this.setActivity("idle");
          return;
        }
        this.maybeContinue();
        return;
      }
      case "response.failed":
      case "response.incomplete": {
        this.h.debug?.("error", "backend_response_" + type.split(".")[1], {
          response: nested.response,
        });
        this.sawFunctionCall = false;
        this.responseDone = false;
        this.pending = 0;
        this.setActivity("idle");
        return;
      }
      default:
        return;
    }
  }

  private async runFunctionCall(item: Record<string, unknown>) {
    const callId = typeof item.call_id === "string" ? item.call_id : "";
    const name = typeof item.name === "string" ? item.name : "";
    if (!callId || !name) return;
    this.sawFunctionCall = true;
    this.pending += 1;
    this.setActivity("writing");

    let args: Record<string, unknown> = {};
    let result: ToolCallResult;
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const raw = typeof item.arguments === "string" ? item.arguments : "{}";
      const parsed = raw.trim() ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
      this.h.debug?.("tool", "tool_call_received", { callId, name, args });
      result = await this.h.execute(name, args, callId);
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : "Tool call failed.",
      };
    }

    const durationMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
    );
    this.h.debug?.("tool", "tool_response_sent", {
      callId,
      name,
      args,
      success: result.success,
      message: result.success ? result.message ?? "" : undefined,
      error: result.success ? undefined : result.error,
      durationMs,
    });

    const delivered = this.h.send({
      type: "response.item.create",
      event_id: `tool_out_${++this.counter}`,
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    if (!delivered) this.h.debug?.("tool", "tool_response_undelivered", { callId, name });

    this.pending -= 1;
    if (this.pending === 0 && this.activity === "writing") this.setActivity("thinking");
    this.maybeContinue();
  }

  private maybeContinue() {
    if (!this.responseDone || !this.sawFunctionCall || this.pending > 0) return;
    this.responseDone = false;
    this.sawFunctionCall = false;
    const delivered = this.h.send({
      type: "response.create",
      event_id: `continue_${++this.counter}`,
    });
    this.h.debug?.("tool", "backend_continue_requested", { delivered });
    this.setActivity("thinking");
  }
}
