// The bench's tutor when --brain is set (Oct 2026): the LiveKit voice path's
// brain (lib/brain: Claude Haiku 5.5, one streamed call per student line, the
// app's private note on the line) in place of a Gemini Live session. It keeps
// the LiveTutor surface runCase uses, so the same students, the same
// TutorRuntime and the same real board run against it: the text-only half of
// the bake-off. What the student reads is what the voice would say (the
// speech layer's output, sentence by sentence).
//
// Latency here is the brain's alone: first token, and when the first whole
// sentence was ready (what a TTS can start on). The spoken path adds STT, the
// turn detector and the voice; scripts/livekit-voice-test.mjs measures that.
import type { ToolCallResult } from "../lib/live-types";
import { anthropicTools, brainCost, brainMessages, streamBrain, type BrainImage, type BrainTurn, type BrainUsage } from "../lib/brain/haiku";
import { runBrainTurn, type BoardCall } from "../lib/brain/turn";
import { brainToolDeclarations, brainToolNames } from "../lib/brain/tools";
import { SentenceStream, displayText, speakMath, stripPraise } from "../lib/brain/speech";
import { describeMove } from "../lib/brain/note";
import type { ToolRecord } from "./bench-metrics";

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };

export type BrainLiveTurn = {
  heard: string;
  said: string;
  raw: string;
  firstAudioMs: number | null;
  audioChunks: number;
  interrupted: boolean;
  nudged: boolean;
  timedOut: boolean;
  promptTokens: number | null;
  usage: null;
  tools: ToolRecord[];
  durationMs: number;
  audio: string[];
  mutedMs: number;
  muted: string;
  brain: { firstTokenMs: number | null; firstSentenceMs: number | null; ms: number; usage: BrainUsage; costUsd: number; model: string; attempt: number; dropped: string[]; steps?: number };
};

export class BrainTutor {
  closed: string | null = null;
  setupMs = 0;
  lastLine = "";
  onHeard: (() => void) | null = null;
  speech: { clean(text: string): string } | null = null;
  gate: unknown = null;
  givesTask: (t: string) => boolean = () => false;
  checkAfterReplyNote = "";
  finishReplyNote: unknown = null;
  readonly isBrain = true;
  private readonly tools = anthropicTools(brainToolDeclarations());
  private readonly allowed = brainToolNames();
  private history: BrainTurn[] = [];
  private turnStart = 0;
  private current: BrainLiveTurn | null = null;
  private appTools: ToolRecord[] = [];

  constructor(
    private readonly system: string,
    private readonly onTool: (name: string, args: Record<string, unknown>, id: string) => Promise<ToolCallResult>,
    /** The private note for the line about to go to the brain (built by runCase from the runtime and the board). */
    private readonly noteFor: (line: string) => Promise<{ note: string; forceCheck: boolean }>,
    private readonly opts: { model?: string; hedgeMs?: number; keep?: number } = {},
  ) {}

  get heardNow(): string { return ""; }
  get spokeNow(): boolean { return Boolean(this.current?.said); }
  get active(): boolean { return this.current !== null; }

  /** Warm the connection and write the prompt cache, as the agent does when a session starts. */
  async open(): Promise<void> {
    const t0 = Date.now();
    try {
      for await (const ev of streamBrain({ system: this.system, tools: this.tools, messages: [{ role: "user", content: [{ type: "text", text: "(warm-up: reply with one word)" }] }], maxTokens: 5, model: this.opts.model })) void ev;
    } catch (err) {
      console.log(`  (brain warm-up failed: ${(err as Error).message.slice(0, 160)})`);
    }
    this.setupMs = Date.now() - t0;
  }

  sendFrame(): void {
    // The brain reads the board as text in its note, never as a picture each turn.
  }

  sendNote(): void {
    // The typed path's note goes in through noteFor (the full note: verdict, state, board, reminders).
  }

  noteAppTools(recs: ToolRecord[]): void {
    const at = Date.now() - this.turnStart;
    if (this.current) for (const r of recs) this.current.tools.push({ ...r, atMs: at, beforeSpeech: false });
    else this.appTools.push(...recs);
  }

  async userTurn(parts: Part[]): Promise<BrainLiveTurn> {
    this.turnStart = Date.now();
    const images: BrainImage[] = parts.filter((p) => p.inlineData).map((p) => ({ mimeType: p.inlineData!.mimeType, base64: p.inlineData!.data }));
    const texts = parts.filter((p) => typeof p.text === "string").map((p) => p.text!);
    // The opening's attachment preamble is for Live; the brain gets the student's line.
    const line = texts[texts.length - 1] ?? "";
    const turn: BrainLiveTurn = { heard: "", said: "", raw: "", firstAudioMs: null, audioChunks: 0, interrupted: false, nudged: false, timedOut: false, promptTokens: null, usage: null, tools: [...this.appTools.splice(0)], durationMs: 0, audio: [], mutedMs: 0, muted: "", brain: { firstTokenMs: null, firstSentenceMs: null, ms: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, costUsd: 0, model: "", attempt: 0, dropped: [] } };
    this.current = turn;
    const { note, forceCheck } = await this.noteFor(line);
    const sentences = new SentenceStream();
    // What the voice says (words), and the same sentences as text with digits (the transcript the student and judge read, and the lesson state).
    const spoken: string[] = [];
    const shown: string[] = [];
    const say = (s: string) => {
      const kept = stripPraise(s);
      const out = speakMath(kept);
      if (!out) return;
      shown.push(displayText(kept));
      turn.firstAudioMs ??= Date.now() - this.turnStart;
      turn.brain.firstSentenceMs ??= turn.firstAudioMs;
      spoken.push(out);
    };
    let calls: BoardCall[] = [];
    try {
      const r = await runBrainTurn(
        { system: this.system, tools: this.tools, messages: brainMessages(this.history, line, note, { keep: this.opts.keep, lineImages: images }), hedgeMs: this.opts.hedgeMs ?? 2500, model: this.opts.model },
        {
          allowed: this.allowed,
          forceCheck,
          onText: (text) => {
            turn.raw += text;
            for (const s of sentences.push(text)) say(s);
          },
          onBoard: () => undefined,
          check: async (args, id) => {
            const t0 = Date.now();
            const res = await this.onTool("check_answer", args, id);
            turn.tools.push({ name: "check_answer", args, callId: id, atMs: t0 - this.turnStart, beforeSpeech: !turn.raw.trim(), ok: res.success, result: res.success ? res.message ?? "Done" : `Error: ${res.error}`, durationMs: Date.now() - t0 });
            return res;
          },
        },
      );
      for (const s of sentences.end()) say(s);
      calls = r.calls;
      turn.brain = { firstTokenMs: r.firstTokenMs, firstSentenceMs: turn.brain.firstSentenceMs, ms: r.ms, usage: r.usage, costUsd: brainCost(r.usage), model: r.model, attempt: r.attempt, dropped: r.dropped, steps: r.steps } as BrainLiveTurn["brain"];
      turn.promptTokens = r.usage.input + r.usage.cacheRead + r.usage.cacheWrite;
    } catch (err) {
      console.log(`  (brain failed: ${(err as Error).message.slice(0, 200)})`);
      if (!spoken.length) spoken.push("Sorry, I lost my train of thought. Say that again?");
    }
    turn.said = shown.join(" ");
    (turn as BrainLiveTurn & { voiced?: string }).voiced = spoken.join(" ");
    turn.audioChunks = spoken.length;
    // The board moves, in order, after the words (the agent sends them as the words play).
    for (const c of calls) {
      const at = Date.now() - this.turnStart;
      const t0 = Date.now();
      let r: ToolCallResult;
      try {
        r = await this.onTool(c.name, c.args, c.id);
      } catch (err) {
        r = { success: false, error: (err as Error).message };
      }
      turn.tools.push({ name: c.name, args: c.args, callId: c.id, atMs: at, beforeSpeech: false, ok: r.success, result: r.success ? r.message ?? "Done" : `Error: ${r.error}`, durationMs: Date.now() - t0 });
    }
    this.history.push({
      student: line,
      tutor: turn.said,
      moves: turn.tools.filter((t) => t.ok && !t.by).map((t) => describeMove(t.name, t.args)),
      ...(images.length ? { images } : {}),
    });
    turn.durationMs = Date.now() - this.turnStart;
    this.current = null;
    return turn;
  }

  close(): void {
    this.closed = this.closed ?? null;
  }
}
