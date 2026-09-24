import { joinTranscript } from "./live-events";

// One line per tutor turn in the recording (Sept 23 2026, round 0): when the
// student's input ended, when the first board call and the first word came,
// how many calls came before speech, how much audio, how many words and
// questions, whether a sentence was said twice, and what the turn cost.
// Every number in the "Chalk Tutor Overhaul" plan came from typed sessions on
// 3.1; these summaries are how the next sessions get measured instead.

export type TurnTrigger = "voice" | "text" | "event" | "files" | "opening" | "resume" | "unknown";

export type TurnUsage = {
  prompt: number;
  response: number;
  cached: number;
  toolUse: number;
  thoughts: number;
  total: number;
  promptByModality: Record<string, number>;
  responseByModality: Record<string, number>;
};

export type TurnSummary = {
  n: number;
  model: string;
  trigger: TurnTrigger;
  /** Epoch ms of the student input this turn answers (typed send, last spoken fragment, event). */
  inputAt: number | null;
  /** Epoch ms the turn ended. */
  endAt: number;
  firstToolMs: number | null;
  firstAudioMs: number | null;
  toolsBeforeAudio: number;
  tools: string[];
  /** Audio received, in ms of the original audio. */
  audioMs: number;
  words: number;
  questions: number;
  text: string;
  /** Gaps over 300 ms between audio chunks arriving, after the first chunk. */
  arrivalGaps: number;
  maxArrivalGapMs: number;
  /** A sentence of five or more words said twice in this turn, or also in the one before. */
  repeat: boolean;
  silent: boolean;
  interrupted: boolean;
  endedBy: "turn_complete" | "interrupted";
  usage: TurnUsage | null;
  /** How many usage messages the turn carried (to learn whether they overlap). */
  usageMessages: number;
  costUsd: number | null;
};

// Paid-tier list prices per million tokens for gemini-3.8-live (the pricing
// page lists 3.1 Flash Live on the same row), Sept 2026. Thinking tokens are
// billed as output text. Cached tokens are counted at full price here: the
// page names no discount for Live.
export const LIVE_PRICE_PER_M = {
  input: { TEXT: 0.75, AUDIO: 3, IMAGE: 1, VIDEO: 1, DOCUMENT: 0.75 } as Record<string, number>,
  output: { TEXT: 4.5, AUDIO: 12 } as Record<string, number>,
};

type ModalityCount = { modality?: string; tokenCount?: number };

function byModality(list: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(list)) return out;
  for (const item of list as ModalityCount[]) {
    const key = typeof item?.modality === "string" ? item.modality.toUpperCase() : "";
    const n = typeof item?.tokenCount === "number" ? item.tokenCount : 0;
    if (key && n > 0) out[key] = (out[key] ?? 0) + n;
  }
  return out;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** A Live usageMetadata message, in the shape the summary keeps. */
export function readUsage(raw: unknown): TurnUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const usage: TurnUsage = {
    prompt: num(u.promptTokenCount),
    response: num(u.responseTokenCount ?? u.candidatesTokenCount),
    cached: num(u.cachedContentTokenCount),
    toolUse: num(u.toolUsePromptTokenCount),
    thoughts: num(u.thoughtsTokenCount),
    total: num(u.totalTokenCount),
    promptByModality: byModality(u.promptTokensDetails),
    responseByModality: byModality(u.responseTokensDetails ?? u.candidatesTokensDetails),
  };
  return usage.prompt || usage.response || usage.total || usage.toolUse ? usage : null;
}

export function addUsage(a: TurnUsage | null, b: TurnUsage): TurnUsage {
  if (!a) return { ...b, promptByModality: { ...b.promptByModality }, responseByModality: { ...b.responseByModality } };
  const merge = (x: Record<string, number>, y: Record<string, number>) => {
    const out = { ...x };
    for (const [k, v] of Object.entries(y)) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  return {
    prompt: a.prompt + b.prompt,
    response: a.response + b.response,
    cached: a.cached + b.cached,
    toolUse: a.toolUse + b.toolUse,
    thoughts: a.thoughts + b.thoughts,
    total: a.total + b.total,
    promptByModality: merge(a.promptByModality, b.promptByModality),
    responseByModality: merge(a.responseByModality, b.responseByModality),
  };
}

/** Estimated dollars for one turn's usage at the paid list prices. */
export function estimateCostUsd(usage: TurnUsage | null): number | null {
  if (!usage) return null;
  let usd = 0;
  // Prompt tokens by modality; whatever the breakdown leaves out counts as text.
  const promptKnown = Object.values(usage.promptByModality).reduce((s, v) => s + v, 0);
  for (const [m, n] of Object.entries(usage.promptByModality)) usd += n * (LIVE_PRICE_PER_M.input[m] ?? LIVE_PRICE_PER_M.input.TEXT);
  usd += Math.max(0, usage.prompt - promptKnown) * LIVE_PRICE_PER_M.input.TEXT;
  // Tool results fed back to the model are input text.
  usd += usage.toolUse * LIVE_PRICE_PER_M.input.TEXT;
  // Response tokens by modality; a Live reply is audio unless it says otherwise.
  const responseKnown = Object.values(usage.responseByModality).reduce((s, v) => s + v, 0);
  for (const [m, n] of Object.entries(usage.responseByModality)) usd += n * (LIVE_PRICE_PER_M.output[m] ?? LIVE_PRICE_PER_M.output.AUDIO);
  usd += Math.max(0, usage.response - responseKnown) * LIVE_PRICE_PER_M.output.AUDIO;
  usd += usage.thoughts * LIVE_PRICE_PER_M.output.TEXT;
  return usd / 1_000_000;
}

/** Milliseconds of 16-bit mono PCM at `rate` in a base64 string. */
export function pcmBase64Ms(base64: string, rate = 24000): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.max(0, (base64.length * 3) / 4 - padding);
  return (bytes / 2 / rate) * 1000;
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim())
    .filter((s) => s.split(" ").length >= 5);
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

type Current = {
  inputAt: number | null;
  trigger: TurnTrigger;
  startedAt: number;
  firstToolAt: number | null;
  firstAudioAt: number | null;
  toolsBeforeAudio: number;
  tools: string[];
  audioMs: number;
  lastAudioAt: number | null;
  arrivalGaps: number;
  maxArrivalGapMs: number;
  text: string;
  spaced: boolean;
  usage: TurnUsage | null;
  usageMessages: number;
};

/**
 * Times tutor turns. A finished turn is held until `flush()` (the client calls
 * it shortly after, or the next turn starts), because Live can send the turn's
 * usage after turnComplete; usage that arrives between turns waits for the
 * next one instead of opening a turn of its own.
 */
export class TurnTracker {
  private n = 0;
  private pending: { at: number; trigger: TurnTrigger } | null = null;
  private lastVoiceAt = 0;
  private voiceUsedAt = 0;
  private cur: Current | null = null;
  private held: TurnSummary | null = null;
  private orphanUsage: TurnUsage | null = null;
  private orphanMessages = 0;
  private previousSentences = new Set<string>();

  constructor(private readonly model: string, private readonly emit: (summary: TurnSummary) => void) {}

  /** The student sent something that is not speech (typed text, an event, files, the opening). */
  noteInput(trigger: Exclude<TurnTrigger, "voice" | "unknown">, at: number) {
    this.pending = { at, trigger };
  }

  /** A fragment of the student's speech arrived. */
  noteStudentVoice(at: number) {
    this.lastVoiceAt = at;
  }

  private ensure(at: number): Current {
    if (this.cur) return this.cur;
    this.flush();
    const voice = this.lastVoiceAt > this.voiceUsedAt ? this.lastVoiceAt : 0;
    const typed = this.pending?.at ?? 0;
    let inputAt: number | null = null;
    let trigger: TurnTrigger = "unknown";
    if (typed || voice) {
      if (typed >= voice && this.pending) {
        inputAt = typed;
        trigger = this.pending.trigger;
      } else {
        inputAt = voice;
        trigger = "voice";
      }
    }
    this.pending = null;
    if (voice) this.voiceUsedAt = voice;
    this.cur = {
      inputAt,
      trigger,
      startedAt: at,
      firstToolAt: null,
      firstAudioAt: null,
      toolsBeforeAudio: 0,
      tools: [],
      audioMs: 0,
      lastAudioAt: null,
      arrivalGaps: 0,
      maxArrivalGapMs: 0,
      text: "",
      spaced: false,
      usage: this.orphanUsage,
      usageMessages: this.orphanMessages,
    };
    this.orphanUsage = null;
    this.orphanMessages = 0;
    return this.cur;
  }

  noteToolCall(name: string, at: number) {
    const c = this.ensure(at);
    c.firstToolAt ??= at;
    c.tools.push(name);
    if (c.firstAudioAt === null) c.toolsBeforeAudio += 1;
  }

  noteAudio(ms: number, at: number) {
    const c = this.ensure(at);
    c.firstAudioAt ??= at;
    if (c.lastAudioAt !== null) {
      const gap = at - c.lastAudioAt;
      if (gap > 300) c.arrivalGaps += 1;
      c.maxArrivalGapMs = Math.max(c.maxArrivalGapMs, gap);
    }
    c.lastAudioAt = at;
    c.audioMs += ms;
  }

  noteTutorText(fragment: string, spaced: boolean, at: number) {
    const c = this.ensure(at);
    if (spaced) c.spaced = true;
    c.text = joinTranscript(c.text, fragment, c.spaced);
  }

  /** Usage belongs to the turn in progress, else the turn just finished, else the next one. */
  noteUsage(raw: unknown): TurnUsage | null {
    const usage = readUsage(raw);
    if (!usage) return null;
    if (this.cur) {
      this.cur.usage = addUsage(this.cur.usage, usage);
      this.cur.usageMessages += 1;
    } else if (this.held) {
      this.held.usage = addUsage(this.held.usage, usage);
      this.held.usageMessages += 1;
      this.held.costUsd = estimateCostUsd(this.held.usage);
    } else {
      this.orphanUsage = addUsage(this.orphanUsage, usage);
      this.orphanMessages += 1;
    }
    return usage;
  }

  /** Whether a turn is in progress (something arrived since the last finish). */
  get active(): boolean {
    return this.cur !== null;
  }

  /** Ends the turn in progress and holds its summary until flush(). */
  finish(endedBy: TurnSummary["endedBy"], at: number): boolean {
    const c = this.cur;
    if (!c) return false;
    this.cur = null;
    this.flush();
    this.n += 1;
    const text = c.text.trim();
    const sentences = sentencesOf(text);
    const seen = new Set<string>();
    let repeat = false;
    for (const s of sentences) {
      if (seen.has(s) || this.previousSentences.has(s)) repeat = true;
      seen.add(s);
    }
    this.previousSentences = seen;
    const since = (t: number | null) => (t !== null && c.inputAt !== null ? Math.max(0, t - c.inputAt) : null);
    this.held = {
      n: this.n,
      model: this.model,
      trigger: c.trigger,
      inputAt: c.inputAt,
      endAt: at,
      firstToolMs: since(c.firstToolAt),
      firstAudioMs: since(c.firstAudioAt),
      toolsBeforeAudio: c.toolsBeforeAudio,
      tools: c.tools,
      audioMs: Math.round(c.audioMs),
      words: countWords(text),
      questions: (text.match(/\?/g) ?? []).length,
      text: text.slice(0, 600),
      arrivalGaps: c.arrivalGaps,
      maxArrivalGapMs: Math.round(c.maxArrivalGapMs),
      repeat,
      silent: c.audioMs === 0,
      interrupted: endedBy === "interrupted",
      endedBy,
      usage: c.usage,
      usageMessages: c.usageMessages,
      costUsd: estimateCostUsd(c.usage),
    };
    return true;
  }

  /** Records the held summary, if any. */
  flush() {
    const held = this.held;
    if (!held) return;
    this.held = null;
    this.emit(held);
  }
}
