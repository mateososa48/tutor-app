// How Gemini Live runs each tool (Sept 23 2026).
//
// gemini-3.8-live makes a tool NON_BLOCKING unless its declaration says
// otherwise, and answers every result WHEN_IDLE: once the tutor has finished
// talking, each board result starts it talking again. Twelve probe turns on
// Sept 23 (scripts/live-model-probe.ts, BEHAVIOR=none|blocking) measured:
// - the model's own defaults: after a wrong answer, 2 of 2 runs added extra
//   turns ("…") after the reply;
// - every tool BLOCKING: 5 of 5 spoke once, first words at 1.4–4.0 s;
// - async with SILENT successes (below): no faster, and 1 of 5 checked,
//   drew, ringed and ended the turn without a word.
// So on 3.8 every tool blocks, the way 3.1 always behaved, and the async
// design stays opt-in (`?tools=async`) until a real session shows it helps:
// the tools whose result decides the words block (check_answer's verdict,
// look_at_board / look_at_worksheet's picture); everything else runs while it
// talks, a result that worked is filed SILENT, and a refusal or a
// "Careful:" warning comes back WHEN_IDLE so it can fix the board.
// 3.1 and older have no async tools, and the extended-thinking model is
// NON_BLOCKING only and rejects `scheduling`, so both are sent exactly what
// they always were.

export type LiveToolMode = "legacy" | "async-only" | "scheduled";

export function liveToolMode(model: string): LiveToolMode {
  if (/thinking/.test(model)) return "async-only";
  if (/gemini-(?:[12]\.|3\.[0-7](?:\D|$))/.test(model)) return "legacy";
  return "scheduled";
}

/** Tools whose result the tutor must hear before it speaks, even with async tools on. */
export const BLOCKING_TOOLS: ReadonlySet<string> = new Set(["check_answer", "look_at_board", "look_at_worksheet"]);

export function withToolBehavior<T extends { name?: string }>(declarations: T[], model: string, asyncTools = false): Array<T & { behavior?: "BLOCKING" | "NON_BLOCKING" }> {
  if (liveToolMode(model) !== "scheduled") return declarations;
  return declarations.map((d) => ({ ...d, behavior: !asyncTools || BLOCKING_TOOLS.has(d.name ?? "") ? "BLOCKING" : "NON_BLOCKING" }));
}

export type ToolScheduling = "SILENT" | "WHEN_IDLE";

/**
 * How the model is told about an async result. `spoken` is whether it has
 * said anything yet this turn: filed SILENT, a result reaches a model that
 * has not started talking as nothing at all, and 3.8 then ends its turn
 * without a word (Sept 25 2026: on the benchmark the first sound came at
 * 7.8–8.6 s, after the nudge, on every turn that opened with a tool call).
 * So a result the model has not talked past comes back WHEN_IDLE, which
 * re-triggers it the moment it is idle; once it is talking, a result that
 * worked is filed silently.
 */
export function toolScheduling(model: string, name: string, result: { success: boolean; message?: string }, asyncTools = false, spoken = true): ToolScheduling | undefined {
  if (!asyncTools || liveToolMode(model) !== "scheduled" || BLOCKING_TOOLS.has(name)) return undefined;
  if (!spoken) return "WHEN_IDLE";
  if (!result.success) return "WHEN_IDLE";
  if (/\bCareful:/.test(result.message ?? "")) return "WHEN_IDLE";
  // Once it has spoken, a changed [Tutor state] is filed too: it is read on
  // the next turn. WHEN_IDLE made it speak a second time after its reply
  // (Sept 26 2026: "…sheet or the idea? Where do you usually get stuck…?",
  // heard as two questions in the saved audio).
  return "SILENT";
}

/**
 * TRIED AND REJECTED as the app's behaviour (Sept 26 2026; kept for the
 * bench's --hold): holding early results until the first sound. 3.8 often
 * waits for a non-blocking result before it speaks, so a held result left it
 * silent until the nudge: 9 of 39 benchmark turns took over 8 s to the first
 * sound (the baseline: 1 of 84). ReplyGate below replaced it.
 *
 * One spoken reply per student line (Sept 26 2026). A non-blocking result
 * that comes back before the tutor has made a sound is held, not sent: sent
 * WHEN_IDLE it made 3.8 answer the line and then talk again once idle, and
 * sent SILENT to a tutor that then ends its turn quietly it is never acted
 * on. So it waits for the first sound (then it goes SILENT, read next turn)
 * or for a turnComplete with no sound after a short grace (then the last one
 * goes WHEN_IDLE, which makes the tutor speak). A new student line or a long
 * wait sends whatever is held SILENT.
 */
export class ResponseHold {
  private held: Array<{ id: string; name: string; result: { success: boolean; message?: string } }> = [];
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  static readonly GRACE_MS = 900;
  static readonly MAX_MS = 5_000;

  constructor(
    private readonly send: (id: string, name: string, result: { success: boolean; message?: string }, scheduling: ToolScheduling) => void,
    private readonly schedule: (name: string, result: { success: boolean; message?: string }, spoken: boolean) => ToolScheduling | undefined,
  ) {}

  get size(): number {
    return this.held.length;
  }

  /** A result is ready. `spoken`: the tutor has made a sound this turn. Returns true when it was held. */
  offer(id: string, name: string, result: { success: boolean; message?: string }, spoken: boolean): boolean {
    const first = this.schedule(name, result, spoken);
    if (spoken || first === undefined) return false;
    this.held.push({ id, name, result });
    if (!this.maxTimer) this.maxTimer = setTimeout(() => this.release("SILENT"), ResponseHold.MAX_MS);
    return true;
  }

  /** The tutor made its first sound: everything held is filed. */
  onAudio(): void {
    if (this.held.length) this.release("SILENT");
  }

  /** The tutor ended its turn: if still quiet after a grace, the held results make it speak. */
  onTurnComplete(hadAudio: boolean): void {
    if (!this.held.length) return;
    if (hadAudio) return this.release("SILENT");
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = setTimeout(() => this.release("WHEN_IDLE"), ResponseHold.GRACE_MS);
  }

  /** A call the model took back: its result is never sent. */
  drop(id: string): void {
    this.held = this.held.filter((h) => h.id !== id);
    if (!this.held.length) this.clearTimers();
  }

  /** A new student line: what is held belongs to the last turn. */
  onNewInput(): void {
    if (this.held.length) this.release("SILENT");
  }

  dispose(): void {
    this.clearTimers();
    this.held = [];
  }

  private clearTimers(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    if (this.maxTimer) clearTimeout(this.maxTimer);
    this.graceTimer = null;
    this.maxTimer = null;
  }

  private release(mode: ToolScheduling): void {
    this.clearTimers();
    const batch = this.held;
    this.held = [];
    batch.forEach((h, i) => {
      // A refusal or a warning still asks to be heard; otherwise only the last
      // one of a quiet turn wakes the tutor, so it speaks once.
      const own = this.schedule(h.name, h.result, true);
      const scheduling: ToolScheduling = mode === "WHEN_IDLE" ? (i === batch.length - 1 || own === "WHEN_IDLE" ? "WHEN_IDLE" : "SILENT") : own === "WHEN_IDLE" ? "WHEN_IDLE" : "SILENT";
      this.send(h.id, h.name, h.result, scheduling);
    });
  }
}

/**
 * Async tools are on by default (Sept 25 2026: with every tool blocking, 3.8
 * drew everything first, one call at a time, and read the whole context per
 * call); `?tools=sync` puts a tab back to every tool blocking.
 */
export function resolveAsyncTools(search: { get(name: string): string | null } | null | undefined): boolean {
  const v = search?.get("tools")?.trim().toLowerCase();
  return !(v === "sync" || v === "blocking");
}

/** The server's voice activity detection knobs, for a spoken-session test (Phase 5 of the 3.8 plan). */
export type LiveVadConfig = {
  disabled?: boolean;
  startOfSpeechSensitivity?: "START_SENSITIVITY_LOW" | "START_SENSITIVITY_HIGH";
  endOfSpeechSensitivity?: "END_SENSITIVITY_LOW" | "END_SENSITIVITY_HIGH";
  prefixPaddingMs?: number;
  silenceDurationMs?: number;
};

/**
 * `?vad=patient` waits longer before deciding a kid has finished talking;
 * nothing is sent otherwise, so the server's defaults stand untouched.
 */
export function resolveLiveVad(search: { get(name: string): string | null } | null | undefined): LiveVadConfig | undefined {
  const v = search?.get("vad")?.trim().toLowerCase();
  if (v === "patient") return { endOfSpeechSensitivity: "END_SENSITIVITY_LOW", silenceDurationMs: 1200 };
  return undefined;
}

/**
 * One spoken reply per student line, enforced where it is heard (Sept 26
 * 2026). A result sent WHEN_IDLE before the tutor spoke makes 3.8 answer the
 * line and then, once idle, speak again ("…sheet or the idea? Where do you
 * usually get stuck…?"; "…Find the slope… The assistant gave the student a new
 * problem…", both in the saved audio). Once the tutor has finished a reply
 * that ends on a question or a task, anything more it says before the student
 * speaks again is not played and not captioned. A reply that ends without a
 * task ("Let's look at this.") leaves the gate open for the real one.
 */
export class ReplyGate {
  private closed = false;

  /** The student said something: the tutor's next reply is theirs to hear. */
  onNewInput(): void {
    this.closed = false;
  }

  /** The tutor finished a generation: `text` is what it said in this turn so far. */
  onTurnComplete(hadAudio: boolean, text: string, givesTask: (text: string) => boolean): void {
    if (hadAudio && text.trim() && givesTask(text)) this.closed = true;
  }

  /** True while more speech would be a second reply to the same line. */
  get muted(): boolean {
    return this.closed;
  }
}
