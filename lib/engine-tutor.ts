// The session client for the tutoring engine (Oct 31 2026, Plan B B6/B7).
// The server owns the lesson: every committed student line goes to
// /api/sessions/[id]/turns, which answers with approved speech segments and
// compiled board ops. This client only executes: it applies the ops through
// the page's own tool handler (the same board code every other path uses),
// reports what actually happened as receipts, and has the voice say each
// segment once the board things it talks about are up. A segment whose board
// thing failed says its fallback, or nothing.
//
// Spoken input goes through the same engine: a listening Live socket
// (lib/engine-ear) turns each finished utterance into a committed line.

import { EngineVoice, faithfulness, tokenUrl } from "./engine-voice";
import { EngineEar } from "./engine-ear";
import { AudioCapture, AudioPlayer, quietFrame } from "./audio";
import { revealByFraction } from "./gemini-tutor";
import { DEFAULT_LIVE_MODEL } from "./gemini-live";
import type { LiveTutorCallbacks, LiveTutorStartOptions } from "./live-tutor";
import type { UploadedFile } from "./file-processor";
import { clearActiveIntake, getActiveIntake, intakeOpeningMessage } from "./session-intake";
import { DEFAULT_TUTOR_SPEED, tutorSpeedRate } from "./voice-settings";
import type { BoardOp, BoardReceipt, SpeechSegment } from "./lesson/types";

type TurnResponse = {
  turnId: string;
  speech: SpeechSegment[];
  ops: BoardOp[];
  items: Record<string, string>;
  close: boolean;
  revision: number;
  log?: Record<string, unknown>;
};

type ToolResult = { success: true; message?: string } | { success: false; error: string };

/** The tool call an op becomes on the page's board. */
export function opToCall(op: BoardOp, items: Map<string, string>): { name: string; args: Record<string, unknown> } | { skip: string } {
  if (op.type === "heading") return { name: "start_new_problem", args: { title: op.title } };
  if (op.type === "tool") return { name: op.name, args: op.args };
  if (op.type === "illustrate") return { skip: "drawn by the illustrator" };
  if (op.type === "draw") return { name: "draw_picture", args: { kind: op.kind, spec: op.spec, rendered: op.rendered, label: op.label, ...(op.reserveH ? { reserveH: op.reserveH } : {}) } };
  if (op.type === "edit") {
    const item = items.get(op.sid);
    if (!item) return { name: "draw_picture", args: { kind: op.kind, spec: op.spec, rendered: op.rendered, label: op.label } };
    return { name: "edit_picture", args: { target: item, spec: op.spec, rendered: op.rendered, label: op.label } };
  }
  // A mark: "work:P1.L2" is part L2 of the item the working became.
  const dot = op.ref.indexOf(".");
  const sid = dot < 0 ? op.ref : op.ref.slice(0, dot);
  const part = dot < 0 ? "" : op.ref.slice(dot + 1);
  const item = items.get(sid);
  if (!item) return { skip: `${sid} is not on the board` };
  const target = part ? `${item}.${part}` : item;
  switch (op.how) {
    case "check":
      return { name: "mark_correct", args: { target } };
    case "ring":
      return { name: "circle_item", args: { target, keep: true } };
    // highlight names the part in `text` ("b2" + "L1"); the other marks take "b2.L1".
    case "swipe":
      return { name: "highlight", args: { target: item, ...(part ? { text: part } : {}) } };
    case "underline":
      return { name: "highlight", args: { target: item, ...(part ? { text: part } : {}), how: "underline" } };
    // A pointer shows only while the pen is there; a laser ring is seen with the sentence.
    case "point":
      return { name: "circle_item", args: { target, keep: false } };
    case "cross":
      // No strike on a picture's part yet: a kept ring says "this one" instead.
      return { name: "circle_item", args: { target, keep: true } };
  }
}

const itemIn = (message: string | undefined) => /\(item (b\d+)\)/.exec(message ?? "")?.[1];

/** Pictures the engine can read on the server: images, and a PDF's page pictures. */
function sourceFiles(files: UploadedFile[]) {
  return files.flatMap((f) => {
    if (/^image\/(png|jpe?g|webp|gif)$/.test(f.mimeType)) return [{ label: f.label, name: f.name, mimeType: f.mimeType, base64: f.base64 }];
    return (f.pages ?? []).slice(0, 3).map((p, i) => ({ label: `${f.label} page ${i + 1}`, name: f.name, mimeType: p.mimeType, base64: p.base64 }));
  });
}

export class EngineTutorSession {
  readonly boardFrames = "on-demand" as const;
  private voice: EngineVoice | null = null;
  private ear: EngineEar | null = null;
  private capture: AudioCapture | null = null;
  private muted = false;
  private player: AudioPlayer | null = null;
  private meter: ReturnType<typeof setInterval> | null = null;
  private speechRate = tutorSpeedRate(DEFAULT_TUTOR_SPEED);
  private items = new Map<string, string>();
  private ended = false;
  private speaking = false;
  private lastAudioAt = 0;
  // The segments on the audio timeline, for the caption: audio arrives faster
  // than it plays, so the caption follows what is playing, not what arrived.
  private timeline: Array<{ text: string; start: number; audioMs: number; done: boolean }> = [];
  private enqueuedMs = 0;
  private shownCaption = "";
  // Each committed line gets a generation; a newer line stops the older one's speech.
  private generation = 0;
  private busy: Promise<void> = Promise.resolve();
  private waiting: string[] = [];
  // The last lines both ways, for the illustrator (it labels only numbers they have had).
  private recent: Array<{ who: "student" | "tutor"; text: string }> = [];
  private recentTutor: string[] = [];
  private lineN = 0;

  /** Every turn as it ran, for the runner and the dev console. */
  readonly turns: Array<{ turnId: string; line: string; ms: number; earlyMs?: number; speech: string[]; said: string[]; ops: string[]; receipts: BoardReceipt[]; log?: Record<string, unknown> }> = [];
  private running = 0;

  constructor(private readonly callbacks: LiveTutorCallbacks, private readonly options: { sessionId: string; model?: string; planner?: string }) {
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") (window as unknown as { __chalkEngine?: EngineTutorSession }).__chalkEngine = this;
  }

  /** A turn is being planned, drawn or said, or its audio is still playing. */
  isBusy(): boolean {
    return this.running > 0 || this.waiting.length > 0 || Boolean(this.player?.isPlaying());
  }

  get model(): string {
    return this.options.model?.trim() || DEFAULT_LIVE_MODEL;
  }

  private debug(kind: string, message: string, payload?: Record<string, unknown>) {
    this.callbacks.onDebugEvent?.({ kind, message, payload });
  }

  private setSpeaking(next: boolean) {
    if (this.speaking === next) return;
    this.speaking = next;
    this.callbacks.onSpeakingChange(next);
    if (next) this.callbacks.onActivity("idle");
  }

  private showCaption(text: string) {
    if (text === this.shownCaption) return;
    this.shownCaption = text;
    this.callbacks.onCaption(text);
  }

  async start(opts: LiveTutorStartOptions): Promise<void> {
    this.debug("connection", "engine_start", { mode: opts.mode });
    const active = opts.mode === "resume" ? null : getActiveIntake();
    const cfg = await fetch("/api/live-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ configOnly: true }) });
    if (!cfg.ok) throw new Error(cfg.status === 401 ? "Please sign in again to start a session." : "Couldn't reach your tutor. Try again in a moment.");
    const config = (await cfg.json()) as { voice: string };
    if (this.ended) return;

    const player = new AudioPlayer({ rate: this.speechRate });
    this.player = player;
    player.resume();
    this.callbacks.onAudioAnalyser?.(player.getAnalyser());
    this.voice = new EngineVoice({
      model: this.model,
      voiceName: config.voice,
      url: async () => {
        const r = await fetch("/api/live-token", { method: "POST" });
        const { token } = (await r.json()) as { token?: string };
        if (!token) throw new Error("live-token empty");
        return tokenUrl(token);
      },
      onAudio: (b64) => {
        player.enqueue(b64);
        this.lastAudioAt = Date.now();
        const ms = (Math.floor((b64.length * 3) / 4) / 2 / 24000) * 1000;
        const last = this.timeline[this.timeline.length - 1];
        if (last && !last.done) {
          if (!last.audioMs) last.start = this.enqueuedMs;
          last.audioMs += ms;
        }
        this.enqueuedMs += ms;
        this.setSpeaking(true);
      },
      onDebug: (kind, payload) => this.debug("voice", kind, payload),
      onClosed: (code, reason) => this.debug("voice", "voice_closed", { code, reason }),
    });
    // Open the voice while the first turn is planned.
    void this.voice.connect().catch((err) => this.debug("error", "voice_connect_failed", { message: (err as Error).message }));

    this.meter = setInterval(() => {
      const playing = player.isPlaying() || Date.now() - this.lastAudioAt < 220;
      this.setSpeaking(playing);
      const played = this.enqueuedMs - player.getPendingSourceMs();
      const s = [...this.timeline].reverse().find((t) => t.audioMs > 0 && t.start <= played + 1);
      if (s) {
        const frac = Math.max(0, Math.min(s.done ? 1 : 0.97, (played - s.start) / s.audioMs));
        const next = revealByFraction(s.text, frac);
        if (next.length >= this.shownCaption.length || !this.shownCaption.startsWith(next)) this.showCaption(next);
      }
    }, 80);

    if (opts.micStream) void this.listen(opts.micStream);

    this.callbacks.onConnected({ resumed: opts.mode === "resume", expiresAt: null });
    if (active) {
      clearActiveIntake();
      const opening = intakeOpeningMessage(active.intake, opts.files.length);
      this.commit(opening, "intake", sourceFiles(opts.files));
    }
  }

  /** The microphone into the ear; each utterance it hears is a spoken line. */
  private async listen(stream: MediaStream) {
    const ear = new EngineEar({
      model: this.model,
      url: async () => {
        const r = await fetch("/api/live-token", { method: "POST" });
        const { token } = (await r.json()) as { token?: string };
        if (!token) throw new Error("live-token empty");
        return tokenUrl(token);
      },
      onSpeechStart: () => this.callbacks.onActivity("idle"),
      tutorTalking: () => this.speaking,
      // They are talking over the tutor: it stops at once (the line is planned once they finish).
      onBargeIn: () => {
        if (!this.speaking) return;
        this.generation += 1;
        this.player?.flush();
        this.timeline = [];
        this.enqueuedMs = 0;
        this.showCaption("");
        this.debug("ear", "barge_in", {});
      },
      onUtterance: (text) => this.heard(text),
      onDebug: (kind, payload) => this.debug("ear", kind, payload),
      onClosed: (code, reason) => {
        this.debug("ear", "ear_closed", { code, reason });
        // Listening again after a drop, unless the session is over.
        if (!this.ended && this.capture) void ear.connect().catch((err) => this.debug("error", "ear_reconnect_failed", { message: (err as Error).message }));
      },
    });
    this.ear = ear;
    try {
      await ear.connect();
    } catch (err) {
      this.debug("error", "ear_connect_failed", { message: (err as Error).message });
      return;
    }
    const capture = new AudioCapture((base64, rate, silent) => {
      // Muted, or a flattened quiet room: the same length of room tone, never nothing.
      ear.sendAudio(this.muted || silent ? quietFrame(Math.floor((base64.length * 3) / 8)) : base64, rate);
    }, 16000);
    this.capture = capture;
    await capture.start(stream);
  }

  /**
   * A spoken line, unless it is the tutor's own voice coming back through the
   * speakers (it matches what was just said).
   */
  private heard(text: string) {
    const lastSaid = this.recentTutor.slice(-3).join(" ");
    if (lastSaid && faithfulness(lastSaid, text) > 0.6) {
      this.debug("ear", "echo_dropped", { text: text.slice(0, 200) });
      return;
    }
    this.callbacks.onTranscript({ id: `spoken_${Date.now()}`, role: "student", text, at: Date.now() });
    this.commit(text, "spoken");
  }

  async end(): Promise<void> {
    this.ended = true;
    this.capture?.stop();
    this.capture = null;
    this.ear?.close();
    this.ear = null;
    this.generation += 1;
    if (this.meter) clearInterval(this.meter);
    this.meter = null;
    this.voice?.close();
    this.voice = null;
    this.player?.close();
    this.player = null;
    this.callbacks.onAudioAnalyser?.(null);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  setSpeechRate(rate: number) {
    this.speechRate = rate;
    this.player?.setRate(rate);
  }

  sendText(text: string): boolean {
    if (this.ended || !text.trim()) return false;
    this.commit(text.trim(), "typed");
    return true;
  }

  sendFiles(): boolean {
    return false;
  }

  /**
   * A committed line. A new one stops what the tutor is still saying about
   * the last (the student moved on); lines that arrive while a turn is being
   * planned wait and go together as one.
   */
  private commit(text: string, source: "intake" | "typed" | "spoken", files: ReturnType<typeof sourceFiles> = []) {
    this.generation += 1;
    this.player?.flush();
    this.timeline = [];
    this.enqueuedMs = 0;
    this.showCaption("");
    this.waiting.push(text);
    this.recent = [...this.recent, { who: "student" as const, text }].slice(-8);
    this.callbacks.onActivity("thinking");
    const gen = this.generation;
    this.busy = this.busy.then(async () => {
      if (!this.waiting.length || this.ended) return;
      const line = this.waiting.splice(0).join(" ");
      this.running += 1;
      try {
        await this.runTurn(line, source, files, gen);
      } finally {
        this.running -= 1;
      }
    });
  }

  private async runTurn(text: string, source: "intake" | "typed" | "spoken", files: ReturnType<typeof sourceFiles>, gen: number) {
    const t0 = performance.now();
    let res: TurnResponse | null = null;
    // The first sentence can arrive before the turn (lib/lesson/stream): it is
    // said at once, and the turn's own copy of it is skipped.
    let earlySaid: Promise<void> | null = null;
    let earlyAt = 0;
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      try {
        const r = await fetch(`/api/sessions/${this.options.sessionId}/turns`, {
          method: "POST",
          headers: { "Content-Type": "application/json", accept: "application/x-ndjson" },
          body: JSON.stringify({ text, source, inputId: `u${++this.lineN}`, ...(this.options.planner ? { model: this.options.planner } : {}), ...(files.length && attempt === 0 ? { files } : {}) }),
        });
        if (r.status === 409) continue;
        if (!r.ok || !r.body) throw new Error(`turn ${r.status}`);
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let conflict = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (value) buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const msg = JSON.parse(line) as { type: string; text?: string; status?: number; error?: string } & Partial<TurnResponse>;
            if (msg.type === "early" && msg.text && gen === this.generation && !earlySaid) {
              earlyAt = performance.now();
              this.debug("engine", "early_sentence", { ms: Math.round(earlyAt - t0), text: msg.text });
              earlySaid = this.say(msg.text, gen);
            } else if (msg.type === "turn") res = msg as TurnResponse;
            else if (msg.type === "error") {
              if (msg.status === 409) conflict = true;
              else throw new Error(`turn ${msg.status}: ${msg.error ?? ""}`);
            }
          }
          if (done) break;
        }
        if (conflict && !earlySaid) continue;
      } catch (err) {
        this.debug("error", "turn_failed", { message: (err as Error).message, attempt });
        if (attempt === 2) break;
        await new Promise((ok) => setTimeout(ok, 600));
      }
    }
    if (!res) {
      this.callbacks.onActivity("idle");
      this.callbacks.onError("Your tutor couldn't answer that. Try sending it again.");
      return;
    }
    for (const [sid, item] of Object.entries(res.items ?? {})) this.items.set(sid, item);
    const record = { turnId: res.turnId, line: text, ms: Math.round(performance.now() - t0), speech: res.speech.map((x) => x.text), said: [] as string[], ops: res.ops.map((o) => (o.type === "mark" ? `mark ${o.how} ${o.ref}` : o.type === "heading" ? `heading ${o.title}` : `${o.type} ${o.sid}`)), receipts: [] as BoardReceipt[], log: res.log, ...(earlyAt ? { earlyMs: Math.round(earlyAt - t0) } : {}) };
    this.turns.push(record);
    this.debug("engine", "turn_planned", { turnId: res.turnId, ms: Math.round(performance.now() - t0), ops: res.ops.length, segments: res.speech.length, ...res.log });

    // The board and the voice run together: ops apply in order, each segment
    // is said once what it needs is up.
    const receipts: BoardReceipt[] = [];
    const done = new Map<string, "ok" | "failed">();
    const settle: Array<() => void> = [];
    const wake = () => settle.splice(0).forEach((f) => f());
    // A mark on exactly what a sentence talks about waits for that sentence, so
    // the ring or the pointer comes as the words do (it faded before the
    // sentence on Oct 31). Every other op goes at once, in order.
    const needed = new Set(res.speech.filter((x) => !x.early).flatMap((x) => x.needs));
    const deferred = new Map<string, BoardOp>();
    for (const op of res.ops) if (op.type === "mark" && needed.has(op.ref) && !deferred.has(op.ref)) deferred.set(op.ref, op);
    const markNow = async (seg: SpeechSegment) => {
      for (const n of seg.needs) {
        const op = deferred.get(n);
        if (!op) continue;
        deferred.delete(n);
        receipts.push(await this.apply(op));
      }
    };
    const applyAll = (async () => {
      // Last turn's "look here" rings come off when this turn marks the board
      // (reviewers found three rings piled on one table, none about the question).
      if (res!.ops.some((o) => o.type === "mark" && (o.how === "ring" || o.how === "swipe" || o.how === "underline" || o.how === "point"))) await this.callbacks.onToolCall("clear_rings", {}, `engine.${res!.turnId}.clear`);
      for (const op of res!.ops) {
        if (this.ended) break;
        if (op.type === "mark" && deferred.get(op.ref) === op) continue;
        const receipt = await this.apply(op);
        receipts.push(receipt);
        const key = op.type === "heading" ? `heading` : op.type === "mark" ? op.ref : op.sid;
        done.set(key, receipt.status === "applied" || receipt.status === "unchanged" || receipt.status === "partial" ? "ok" : "failed");
        wake();
      }
      wake();
    })();
    let applied = false;
    void applyAll.then(() => {
      applied = true;
      wake();
    });

    // What a need waits on: the op whose sid it names (with or without a part).
    const opFor = (need: string) => {
      const sid = need.split(".")[0];
      return res!.ops.find((o) => o.type !== "heading" && o.type !== "mark" && o.sid === sid);
    };
    const ready = (seg: SpeechSegment): "ok" | "failed" | "wait" => {
      for (const n of seg.needs) {
        const op = opFor(n);
        if (!op) {
          if (this.items.has(n.split(".")[0])) continue;
          return "failed";
        }
        const st = done.get((op as { sid: string }).sid);
        if (!st) return applied ? "failed" : "wait";
        if (st === "failed") return "failed";
      }
      return "ok";
    };

    for (const seg of res.speech) {
      if (gen !== this.generation || this.ended) break;
      // Said already, while the turn was planned.
      if (seg.early && earlySaid) {
        await earlySaid;
        record.said.push(seg.text);
        continue;
      }
      let state = ready(seg);
      while (state === "wait") {
        await new Promise<void>((ok) => settle.push(ok));
        state = ready(seg);
      }
      if (gen !== this.generation || this.ended) break;
      const text = state === "ok" ? seg.text : seg.fallback ?? "";
      if (!text) {
        this.debug("engine", "segment_skipped", { id: seg.id, needs: seg.needs });
        continue;
      }
      if (state === "ok") await markNow(seg);
      await this.say(text, gen);
      record.said.push(text);
    }
    await applyAll;
    // Marks whose sentence was never said (skipped, or cut off by a new line) still go up.
    if (!this.ended) for (const op of deferred.values()) receipts.push(await this.apply(op));
    // Receipts before the next line is sent: the lesson's board is what was drawn.
    record.receipts = receipts;
    const failed = receipts.filter((r) => r.status === "failed" || r.status === "blocked");
    if (failed.length) this.debug("engine", "board_failed", { turnId: res.turnId, failed });
    await fetch(`/api/sessions/${this.options.sessionId}/turns/receipts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnId: res.turnId, receipts }) })
      .catch((err) => this.debug("error", "receipts_failed", { message: (err as Error).message }));
    if (gen === this.generation && !this.ended) this.callbacks.onActivity("idle");
  }

  /** Real things: the illustrator writes the scene, the page draws it; the receipt names its parts. */
  private async illustrate(op: Extract<BoardOp, { type: "illustrate" }>): Promise<BoardReceipt> {
    this.callbacks.onActivity("writing");
    try {
      const r = await fetch("/api/illustrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ what: op.what, notice: op.notice ?? "", conversation: this.recent.slice(-6) }),
      });
      const j = (await r.json()) as { scene?: unknown; parts?: string[]; failures?: string[] };
      if (!j.scene) return { opId: op.opId, status: "failed", issue: `no picture (${(j.failures ?? []).join("; ").slice(0, 160)})`, at: Date.now() };
      const result = (await this.callbacks.onToolCall("draw_illustration", { scene: j.scene }, `engine.${op.opId}`)) as ToolResult;
      if (!result.success) return { opId: op.opId, status: "failed", issue: result.error.slice(0, 200), at: Date.now() };
      const item = itemIn(result.message);
      if (item) this.items.set(op.sid, item);
      return { opId: op.opId, status: "applied", ...(item ? { itemId: item } : {}), parts: j.parts ?? [], at: Date.now() };
    } catch (err) {
      return { opId: op.opId, status: "failed", issue: (err as Error).message.slice(0, 200), at: Date.now() };
    }
  }

  private async apply(op: BoardOp): Promise<BoardReceipt> {
    if (op.type === "illustrate") return this.illustrate(op);
    const call = opToCall(op, this.items);
    if ("skip" in call) return { opId: op.opId, status: "blocked", issue: call.skip, at: Date.now() };
    this.callbacks.onActivity("writing");
    let result: ToolResult;
    try {
      result = (await this.callbacks.onToolCall(call.name, call.args, `engine.${op.opId}`)) as ToolResult;
    } catch (err) {
      result = { success: false, error: (err as Error).message };
    }
    if (!result.success) return { opId: op.opId, status: "failed", issue: result.error.slice(0, 200), at: Date.now() };
    const item = itemIn(result.message) ?? (op.type === "edit" ? this.items.get(op.sid) : undefined);
    if ((op.type === "draw" || op.type === "edit" || op.type === "tool") && item) this.items.set(op.sid, item);
    if (op.type === "draw" || op.type === "edit") return { opId: op.opId, status: "applied", ...(item ? { itemId: item } : {}), parts: [...Object.keys(op.rendered.parts), ...Object.keys(op.rendered.aliases)], at: Date.now() };
    return { opId: op.opId, status: "applied", ...(item ? { itemId: item } : {}), at: Date.now() };
  }

  /** Say one approved segment; resolves when its audio has arrived, and records it as the tutor's words. */
  private async say(text: string, gen: number) {
    if (!this.voice) return;
    const seg = { text, start: this.enqueuedMs, audioMs: 0, done: false };
    this.timeline.push(seg);
    if (this.timeline.length > 8) this.timeline.shift();
    const at = Date.now();
    const r = await this.voice.say(text);
    seg.done = true;
    if (gen !== this.generation) return;
    if (!r.ok) this.debug("voice", "segment_not_said", { text: text.slice(0, 200), reason: r.reason });
    this.recent = [...this.recent, { who: "tutor" as const, text }].slice(-8);
    this.recentTutor = [...this.recentTutor, text].slice(-4);
    // The approved text is the record: what the student was meant to hear.
    this.callbacks.onTranscript({ id: `engine_${at}`, role: "tutor", text, at });
  }
}
