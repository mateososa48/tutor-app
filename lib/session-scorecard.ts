// A fixed scorecard for every recorded session (Sept 23 2026): the same
// numbers for every session, so two sessions (or two prompt versions) can be
// compared. Pure, shared by the admin replay and the exports.
//
// Live clients from Sept 23 2026 record one `turn_summary` per tutor turn,
// plus `audio_underrun`, `voice_activity` and the quiet events. Older
// recordings have none of these, so each metric says where its number came
// from:
//   measured      counted from events recorded for it (turn summaries, the
//                 tool log, the transcript, and in Gemini recordings from
//                 Sept 16 on, turn_complete: replies and think time)
//   approximate   estimated from older signals that only stand in for it
//                 (first audio from tutor.speaking), or summed in a way not
//                 yet known to be right (tokens from several usage messages)
//   not recorded  this recording has nothing to measure it from (never 0)
//
// Turn summaries are written by lib/live-turn-metrics.ts (TurnTracker).

import {
  breakIntervals,
  compareEvents,
  mergeUtterances,
  speakingIntervals,
  studentInputs,
  toolRecords,
  touchesBreak,
  voiceReplyTimes,
  type TimelineEvent,
} from "./session-recording";

// ── What the live client records ──────────────────────────────────────────────
// The trigger and usage shapes are the live client's own (lib/live-turn-metrics);
// the turn itself is read defensively below, since older builds wrote less.
import type { TurnTrigger, TurnUsage } from "./live-turn-metrics";
export type { TurnTrigger, TurnUsage };

/** One `live.debug` { kind: "turn", message: "turn_summary" } payload, read defensively. */
export type RecordedTurn = {
  n: number;
  model: string;
  trigger: TurnTrigger;
  /** Epoch ms of the student input this turn answers. */
  inputAt: number | null;
  /** Epoch ms the turn ended. */
  endAt: number;
  firstToolMs: number | null;
  firstAudioMs: number | null;
  toolsBeforeAudio: number;
  tools: string[];
  audioMs: number;
  words: number;
  questions: number;
  text: string;
  arrivalGaps: number;
  maxArrivalGapMs: number;
  repeat: boolean;
  silent: boolean;
  interrupted: boolean;
  endedBy: "turn_complete" | "interrupted" | null;
  usage: TurnUsage | null;
  /** How many usage messages the client summed into `usage`; null when the summary does not say. */
  usageMessages: number | null;
  costUsd: number | null;
  /** Where the summary sits in the recording (written up to 1.5 s after the turn ended). */
  offsetMs: number;
};

const TRIGGERS: readonly TurnTrigger[] = ["voice", "text", "event", "files", "opening", "resume", "unknown"];

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const count = (v: unknown) => (finite(v) && v > 0 ? v : 0);
const orNull = (v: unknown) => (finite(v) ? v : null);

function modalities(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [key, n] of Object.entries(v as Record<string, unknown>)) if (count(n) > 0) out[key.toUpperCase()] = count(n);
  return out;
}

function readUsage(v: unknown): TurnUsage | null {
  if (!v || typeof v !== "object") return null;
  const u = v as Record<string, unknown>;
  return {
    prompt: count(u.prompt),
    response: count(u.response),
    cached: count(u.cached),
    toolUse: count(u.toolUse),
    thoughts: count(u.thoughts),
    total: count(u.total),
    promptByModality: modalities(u.promptByModality),
    responseByModality: modalities(u.responseByModality),
  };
}

function inner(e: TimelineEvent): Record<string, unknown> {
  const p = e.payload.payload;
  return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
}

const isDebug = (e: TimelineEvent, message: string) => e.kind === "live.debug" && e.payload.message === message;

/** A turn summary event, or null when it is not one (or has no end time). */
export function readTurn(e: TimelineEvent): RecordedTurn | null {
  if (!isDebug(e, "turn_summary")) return null;
  const p = inner(e);
  if (!finite(p.endAt)) return null;
  const trigger = TRIGGERS.includes(p.trigger as TurnTrigger) ? (p.trigger as TurnTrigger) : "unknown";
  const audioMs = count(p.audioMs);
  const endedBy = p.endedBy === "interrupted" || p.endedBy === "turn_complete" ? p.endedBy : null;
  return {
    n: finite(p.n) ? p.n : 0,
    model: typeof p.model === "string" ? p.model : "",
    trigger,
    inputAt: orNull(p.inputAt),
    endAt: p.endAt,
    firstToolMs: orNull(p.firstToolMs),
    firstAudioMs: orNull(p.firstAudioMs),
    toolsBeforeAudio: count(p.toolsBeforeAudio),
    tools: Array.isArray(p.tools) ? p.tools.map(String) : [],
    audioMs,
    words: count(p.words),
    questions: count(p.questions),
    text: typeof p.text === "string" ? p.text : "",
    arrivalGaps: count(p.arrivalGaps),
    maxArrivalGapMs: count(p.maxArrivalGapMs),
    repeat: p.repeat === true,
    silent: typeof p.silent === "boolean" ? p.silent : audioMs === 0,
    interrupted: p.interrupted === true || endedBy === "interrupted",
    endedBy,
    usage: readUsage(p.usage),
    usageMessages: finite(p.usageMessages) && p.usageMessages >= 0 ? p.usageMessages : null,
    costUsd: orNull(p.costUsd),
    offsetMs: e.offsetMs,
  };
}

/** Turns in the order they ended. A summary stored twice (a batch the recorder retried) counts once. */
export function recordedTurns(events: readonly TimelineEvent[]): RecordedTurn[] {
  const out: RecordedTurn[] = [];
  const seen = new Set<string>();
  for (const e of [...events].sort(compareEvents)) {
    const turn = readTurn(e);
    if (!turn) continue;
    const key = `${turn.model}|${turn.n}|${turn.endAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(turn);
  }
  return out.sort((a, b) => a.endAt - b.endAt || a.n - b.n);
}

/** Turns that answered the student themselves (not an event, a nudge or a reconnect). */
export const answersStudent = (t: Pick<RecordedTurn, "trigger">) => t.trigger === "voice" || t.trigger === "text";

const SLOW_FIRST_AUDIO_MS = 6000;

/** What went wrong in a turn, in words, for the log and the issue flags. */
export function turnProblems(t: RecordedTurn): string[] {
  const out: string[] = [];
  // A turn the student cut off before any audio arrived is ordinary barge-in, not a missing reply.
  if (t.silent && answersStudent(t) && !t.interrupted) out.push(`no audio after the student ${t.trigger === "voice" ? "spoke" : "typed"}`);
  if (t.repeat) out.push("said a sentence twice");
  if (t.firstAudioMs !== null && t.firstAudioMs >= SLOW_FIRST_AUDIO_MS) out.push(`first audio after ${seconds(t.firstAudioMs)}`);
  return out;
}

// ── Clocks and turns ──────────────────────────────────────────────────────────
/** How long the live client holds a finished turn's summary for its usage (scheduleTurnFlush). */
const FLUSH_MS = 1500;

/** The recorder's clock at an offset: offsetMs = epoch - base. */
export type ClockReading = { base: number; exact: boolean };

function mode(values: readonly number[]): number {
  const counts = new Map<number, number>();
  let best = values[0];
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > (counts.get(best) ?? 0)) best = v;
  }
  return best;
}

/**
 * Maps a turn summary's epoch times onto the recording's offsets. The base is
 * the page's own session start, not the database's startedAt: a new session
 * resets it when the student starts (ynjgyc's is 2.9 s after startedAt), a
 * reload sets it to the stored start. Transcript entries carry their epoch
 * time (`at`), so at - offsetMs is the base exactly; a page load or a new
 * connection starts a new stretch in case it moved. Without a transcript the
 * turn summaries bound it: a summary is written 0 to 1.5 s after its turn
 * ended, so the base is within 0.75 s of the middle of that range.
 */
export function recordingClock(events: readonly TimelineEvent[], turns: readonly RecordedTurn[]): (offsetMs: number) => ClockReading {
  const sorted = [...events].sort(compareEvents);
  const cuts = sorted.filter((e) => e.kind === "session.started" || e.kind === "session.resumed").map((e) => e.offsetMs);
  const stretch = (offsetMs: number) => cuts.filter((c) => c <= offsetMs).length;
  const exact = new Map<number, number[]>();
  const loose = new Map<number, number[]>();
  const add = (map: Map<number, number[]>, key: number, v: number) => map.set(key, [...(map.get(key) ?? []), v]);
  for (const e of sorted) {
    const at = e.payload.at;
    if (e.kind === "transcript.entry" && finite(at) && e.offsetMs > 0) add(exact, stretch(e.offsetMs), Math.round(at - e.offsetMs));
  }
  // A summary is written 0 to 1.5 s after its turn ended: the base is at least endAt - offsetMs, and at most 1.5 s more.
  for (const t of turns) add(loose, stretch(t.offsetMs), t.endAt - t.offsetMs);
  const middle = (lows: number[]) => Math.max(...lows) + FLUSH_MS / 2;
  const allExact = [...exact.values()].flat();
  const allLoose = [...loose.values()].flat();
  return (offsetMs) => {
    const s = stretch(offsetMs);
    const e = exact.get(s);
    if (e?.length) return { base: mode(e), exact: true };
    const l = loose.get(s);
    if (l?.length) return { base: middle(l), exact: false };
    if (allExact.length) return { base: mode(allExact), exact: false };
    return { base: allLoose.length ? middle(allLoose) : 0, exact: false };
  };
}

/** A tutor turn for think time: when it ended, the input it answered, all in one clock. */
type Beat = { endMs: number; inputMs: number | null; answers: boolean; checkin: boolean };

/**
 * Think time: from the end of a tutor turn to the student's next input. A
 * quiet check-in does not end the student's silence, so their time runs from
 * the turn before it. An input that came before the previous turn ended (a
 * late transcript fragment, or the student cutting in) is counted as mid-turn,
 * not as a zero, and a gap that touches a pause or a reload is left out.
 */
function thinkGaps(beats: readonly Beat[], breaks: ReadonlyArray<{ startMs: number; endMs: number }>, margin: number): { gaps: number[]; midTurn: number } {
  const gaps: number[] = [];
  let midTurn = 0;
  let prev: Beat | null = null;
  for (const b of beats) {
    if (prev && b.answers && b.inputMs !== null) {
      const gap = b.inputMs - prev.endMs;
      if (gap < 0) midTurn += 1;
      else if (!touchesBreak(breaks, prev.endMs, b.inputMs, margin)) gaps.push(gap);
    }
    if (!b.checkin) prev = b;
  }
  return { gaps, midTurn };
}

/** A tutor turn rebuilt from an older recording (offsets, not epoch times). */
export type LegacyTurn = { startMs: number; endMs: number; inputMs: number | null; trigger: TurnTrigger; interrupted: boolean; checkin: boolean };

/**
 * Tutor turns in a recording from before turn summaries, rebuilt the way the
 * live client now times them: a turn starts with the tutor's first voice,
 * words or tool after the last turn ended, answers the newest input it has not
 * answered yet (a typed message or event wins over speech that came before
 * it), and ends at turn_complete or an interruption. Empty when the recording
 * has no turn_complete events (GPT-Live, or recordings before Sept 16 2026).
 */
export function legacyTurns(events: readonly TimelineEvent[]): LegacyTurn[] {
  const sorted = [...events].sort(compareEvents);
  if (!sorted.some((e) => isDebug(e, "turn_complete"))) return [];
  type Item = { at: number; rank: number; input?: ReturnType<typeof studentInputs>[number]; end?: "turn_complete" | "interrupted" };
  const items: Item[] = [
    ...studentInputs(sorted).map((input) => ({ at: input.atMs, rank: 0, input })),
    ...speakingIntervals(sorted).map((s) => ({ at: s.startMs, rank: 1 })),
    ...sorted.filter((e) => e.kind === "transcript.entry" && (e.payload.role ?? e.actor) === "tutor").map((e) => ({ at: e.offsetMs, rank: 1 })),
    ...toolRecords(sorted).map((t) => ({ at: t.offsetMs, rank: 1 })),
    ...sorted.filter((e) => isDebug(e, "turn_complete") || isDebug(e, "interrupted")).map((e) => ({ at: e.offsetMs, rank: 2, end: e.payload.message as "turn_complete" | "interrupted" })),
  ].sort((a, b) => a.at - b.at || a.rank - b.rank);

  const out: LegacyTurn[] = [];
  let pending: { at: number; trigger: TurnTrigger; checkin: boolean } | null = null;
  let lastVoice: number | null = null;
  let voiceUsed = -Infinity;
  let cur: Omit<LegacyTurn, "endMs" | "interrupted"> | null = null;
  for (const item of items) {
    if (item.input) {
      if (item.input.trigger === "voice") lastVoice = item.at;
      else pending = { at: item.at, trigger: item.input.trigger, checkin: item.input.checkin === true };
    } else if (item.end) {
      // An end with nothing since the last one (an interruption, then turn_complete) belongs to the same turn.
      if (cur) out.push({ ...cur, endMs: item.at, interrupted: item.end === "interrupted" });
      cur = null;
    } else if (!cur) {
      const voice = lastVoice !== null && lastVoice > voiceUsed ? lastVoice : null;
      let inputMs: number | null = null;
      let trigger: TurnTrigger = "unknown";
      let checkin = false;
      if (pending && (voice === null || pending.at >= voice)) {
        inputMs = pending.at;
        trigger = pending.trigger;
        checkin = pending.checkin;
      } else if (voice !== null) {
        inputMs = voice;
        trigger = "voice";
      }
      pending = null;
      if (voice !== null) voiceUsed = voice;
      cur = { startMs: item.at, inputMs, trigger, checkin };
    }
  }
  return out;
}

// ── The scorecard ─────────────────────────────────────────────────────────────
export type MetricSource = "measured" | "approximate" | "not recorded";

/** A number and where it came from. `note` says how it is counted. */
export type Metric<T> =
  | { source: "measured" | "approximate"; value: T; note: string }
  | { source: "not recorded"; value: null; note: string };

export type Spread = { p50: number; p90: number; n: number };
export type Verdict = "correct" | "partial" | "incorrect" | "cannot_check";

export type Scorecard = {
  version: 1;
  /** Whether the recording has per-turn summaries (live clients from Sept 23 2026 on). */
  perTurn: boolean;
  turnSummaries: number;
  /** Turns rebuilt from turn_complete events, for a recording without summaries (0 otherwise). */
  rebuiltTurns: number;
  durationMs: number;
  replies: Metric<{ count: number; byTrigger: Partial<Record<TurnTrigger, number>> }>;
  firstAudioMs: Metric<Spread>;
  toolsBeforeSpeech: Metric<{ mean: number; max: number; n: number }>;
  /** `midTurn`: inputs that came before the previous turn ended, left out of the spread. */
  thinkTimeMs: Metric<Spread & { over20s: number; midTurn: number }>;
  wordsPerTurn: Metric<Spread>;
  questionsPerTurn: Metric<{ mean: number; twoOrMore: number; n: number }>;
  talkRatio: Metric<{ ratio: number | null; tutorWords: number; studentWords: number }>;
  answerChecks: Metric<{ count: number; cannotCheck: number; cannotCheckShare: number | null; failed: number; verdicts: Record<Verdict, number> }>;
  /** `afterStudent` leaves out turns the student cut off before any audio (`cutOff`). */
  silentTurns: Metric<{ count: number; afterStudent: number; cutOff: number }>;
  repeatedTurns: Metric<number>;
  interruptedTurns: Metric<number>;
  audioGaps: Metric<{ count: number; maxMs: number }>;
  underruns: Metric<{ count: number; totalMs: number; maxMs: number }>;
  /** `checkins` were sent to the tutor; `unsent` could not be (the connection was not ready). */
  quiet: Metric<{ hints: number; checkins: number; unsent: number; skipped: number }>;
  tokens: Metric<TurnUsage & { turnsWithUsage: number; multiMessageTurns: number }>;
  cost: Metric<{ usd: number; perMinuteUsd: number | null; turnsPriced: number; turns: number }>;
};

const measured = <T>(value: T, note: string): Metric<T> => ({ source: "measured", value, note });
const approximate = <T>(value: T, note: string): Metric<T> => ({ source: "approximate", value, note });
const missing = <T>(note: string): Metric<T> => ({ source: "not recorded", value: null, note });

/** Linear-interpolated quantile (q in 0..1) of a list, or null when it is empty. */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function spread(values: readonly number[], round: (v: number) => number = Math.round): Spread | null {
  const p50 = quantile(values, 0.5);
  const p90 = quantile(values, 0.9);
  return p50 === null || p90 === null ? null : { p50: round(p50), p90: round(p90), n: values.length };
}

/** Words in a line of speech: runs of non-space that hold a letter or a digit. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

const questionMarks = (text: string) => (text.match(/[?？]/g) ?? []).length;

const VERDICT = /^\s*Verdict:\s*(correct|partial|incorrect|cannot_check)\b/;

const NO_TURNS = "needs per-turn summaries, which this recording does not have";
const LONG_THINK_MS = 20_000;
const THINK_NOTE = "pauses and reloads left out; a quiet check-in does not end it; an input that came before the turn ended is counted as mid-turn instead";

export function sessionScorecard(events: readonly TimelineEvent[], durationMs = 0): Scorecard {
  const sorted = [...events].sort(compareEvents);
  const turns = recordedTurns(sorted);
  const perTurn = turns.length > 0;
  const lastOffset = sorted.length ? sorted[sorted.length - 1].offsetMs : 0;
  const length = Math.max(durationMs, lastOffset);
  const debugRecorded = sorted.some((e) => e.kind === "live.debug");
  const underrunEvents = sorted.filter((e) => isDebug(e, "audio_underrun"));
  const quietEvents = sorted.filter((e) => e.kind === "live.debug" && e.payload.kind === "silence");
  const breaks = breakIntervals(sorted);
  const legacy = perTurn ? [] : legacyTurns(sorted);

  // The transcript, without the intake line (the app wrote it from the intake answers, the student did not say it).
  const said = mergeUtterances(sorted.filter((e) => !(e.kind === "transcript.entry" && String(e.payload.id ?? "").startsWith("intake_"))));
  const tutorLines = said.filter((u) => u.role === "tutor");
  const studentLines = said.filter((u) => u.role === "student");
  // A tutor reply, for older recordings: everything the tutor said between two student lines.
  const groups: Array<{ text: string; endMs: number }> = [];
  let open: { text: string; endMs: number } | null = null;
  for (const u of said) {
    if (u.role === "student") {
      open = null;
    } else if (open) {
      open.text = `${open.text} ${u.text}`;
      open.endMs = u.endMs;
    } else {
      open = { text: u.text, endMs: u.endMs };
      groups.push(open);
    }
  }
  const spoken = turns.filter((t) => !t.silent);

  // Replies.
  const byTrigger: Partial<Record<TurnTrigger, number>> = {};
  for (const t of perTurn ? turns : legacy) byTrigger[t.trigger] = (byTrigger[t.trigger] ?? 0) + 1;
  const replies: Scorecard["replies"] = perTurn
    ? measured({ count: turns.length, byTrigger }, "tutor turns, one summary each")
    : legacy.length
      ? measured({ count: legacy.length, byTrigger }, "tutor turns, from the turn-complete and interruption events (this recording has no turn summaries); what each answered is inferred the way the live client now does it")
      : groups.length
        ? approximate({ count: groups.length, byTrigger: {} }, "what the tutor said between two student lines, counted from the transcript")
        : missing("no tutor turns or tutor words in this recording");

  // First audio.
  let firstAudioMs: Scorecard["firstAudioMs"];
  if (perTurn) {
    const s = spread(turns.map((t) => t.firstAudioMs).filter(finite));
    firstAudioMs = s
      ? measured(s, "from the input a turn answers (the typed message, the student's last transcribed words, or what the app sent) to the tutor's first audio arriving")
      : missing("no turn had audio after an input");
  } else {
    const times = voiceReplyTimes(sorted);
    const s = spread(times.map((r) => r.waitMs));
    const to = times[0]?.via === "words" ? "the tutor's first transcribed words (this recording has no voice events)" : "the tutor's voice starting (tutor.speaking, set when audio arrives)";
    firstAudioMs = s
      ? approximate(s, `from the student's input (the typed message, or their last transcribed words; the opening request for the first reply) to ${to}; tool calls before it do not count as the reply, and input made while the tutor was speaking is left out`)
      : missing("no student input with the tutor's voice after it");
  }

  // Tools before speech.
  let toolsBeforeSpeech: Scorecard["toolsBeforeSpeech"] = missing(NO_TURNS);
  if (perTurn) {
    const counts = spoken.map((t) => t.toolsBeforeAudio);
    toolsBeforeSpeech = counts.length
      ? measured({ mean: Math.round((counts.reduce((s, v) => s + v, 0) / counts.length) * 100) / 100, max: Math.max(...counts), n: counts.length }, "board and tutor tool calls made before the first audio, over turns that spoke")
      : missing("no turn had audio");
  }

  // Think time: from the end of a tutor turn to the student's next input.
  const checkinsSent = quietEvents.filter((e) => e.payload.message === "quiet_checkin" && inner(e).sent !== false);
  let thinkTimeMs: Scorecard["thinkTimeMs"];
  const thinkMetric = (result: { gaps: number[]; midTurn: number }, make: typeof measured, note: string, none: string): Scorecard["thinkTimeMs"] => {
    const s = spread(result.gaps);
    return s ? make({ ...s, over20s: result.gaps.filter((g) => g > LONG_THINK_MS).length, midTurn: result.midTurn }, note) : missing(none);
  };
  if (perTurn) {
    // Summaries carry epoch times; breaks and check-ins are offsets, moved onto the same clock.
    const clock = recordingClock(sorted, turns);
    const exact = turns.every((t) => clock(t.offsetMs).exact);
    const margin = exact ? 500 : 2000;
    const epoch = (offsetMs: number) => (offsetMs === Infinity ? Infinity : offsetMs + clock(offsetMs).base);
    const epochBreaks = breaks.map((b) => ({ startMs: epoch(b.startMs), endMs: epoch(b.endMs) }));
    const checkins = checkinsSent.map((e) => epoch(e.offsetMs));
    const beats: Beat[] = turns.map((t) => ({
      endMs: t.endAt,
      inputMs: t.inputAt,
      answers: answersStudent(t),
      checkin: t.trigger === "event" && t.inputAt !== null && checkins.some((c) => Math.abs(c - (t.inputAt as number)) <= margin),
    }));
    thinkTimeMs = thinkMetric(thinkGaps(beats, epochBreaks, margin), measured, `from the end of a tutor turn to the student's next input (the typed message, or their last transcribed words); ${THINK_NOTE}`, "no student input after a tutor turn");
  } else if (legacy.length) {
    const beats: Beat[] = legacy.map((t) => ({ endMs: t.endMs, inputMs: t.inputMs, answers: answersStudent(t), checkin: t.checkin }));
    thinkTimeMs = thinkMetric(
      thinkGaps(beats, breaks, 500),
      measured,
      `from turn_complete to the student's next input (the typed message, or their last transcribed words), as the live client now times it; ${THINK_NOTE}`,
      "no student input after a tutor turn",
    );
  } else {
    // No turn ends recorded: the end of the tutor's voice or words, to the student's next line.
    const speaking = speakingIntervals(sorted);
    const tutorOut = [...tutorLines.map((u) => ({ startMs: u.startMs, endMs: u.endMs })), ...speaking];
    const beats: Beat[] = [];
    let prevStudentEnd = -Infinity;
    for (const s of studentLines) {
      const before = tutorOut.filter((o) => o.startMs > prevStudentEnd && o.startMs < s.endMs);
      prevStudentEnd = s.endMs;
      if (before.length === 0) continue;
      beats.push({ endMs: Math.max(...before.map((o) => o.endMs)), inputMs: null, answers: false, checkin: false }, { endMs: s.endMs, inputMs: s.endMs, answers: true, checkin: false });
    }
    thinkTimeMs = thinkMetric(thinkGaps(beats, breaks, 500), approximate, `from the end of the tutor's voice or words to the student's next line, from the transcript; ${THINK_NOTE}`, "no student line after the tutor spoke");
  }

  // Words and questions per turn.
  let wordsPerTurn: Scorecard["wordsPerTurn"];
  let questionsPerTurn: Scorecard["questionsPerTurn"];
  const questionStats = (qs: number[]) => ({ mean: Math.round((qs.reduce((s, v) => s + v, 0) / qs.length) * 100) / 100, twoOrMore: qs.filter((q) => q >= 2).length, n: qs.length });
  if (perTurn) {
    const s = spread(spoken.map((t) => t.words));
    wordsPerTurn = s ? measured(s, "words the tutor said in each turn that spoke") : missing("no turn had audio");
    questionsPerTurn = spoken.length ? measured(questionStats(spoken.map((t) => t.questions)), "question marks in each turn that spoke") : missing("no turn had audio");
  } else if (groups.length) {
    wordsPerTurn = approximate(spread(groups.map((g) => countWords(g.text)))!, "tutor words between two student lines, from the transcript");
    questionsPerTurn = approximate(questionStats(groups.map((g) => questionMarks(g.text))), "question marks between two student lines, from the transcript");
  } else {
    wordsPerTurn = missing("no tutor words in the transcript");
    questionsPerTurn = missing("no tutor words in the transcript");
  }

  // Talk ratio.
  const tutorWords = tutorLines.reduce((s, u) => s + countWords(u.text), 0);
  const studentWords = studentLines.reduce((s, u) => s + countWords(u.text), 0);
  const talkRatio: Scorecard["talkRatio"] =
    tutorWords + studentWords > 0
      ? measured({ ratio: studentWords > 0 ? round1(tutorWords / studentWords) : null, tutorWords, studentWords }, "tutor words for each student word, from the transcript (the intake line left out)")
      : missing("no transcript");

  // Answer checks.
  const responses = sorted.filter((e) => isDebug(e, "tool_response_sent"));
  let answerChecks: Scorecard["answerChecks"];
  const toolCallsOnly = responses.length === 0 && sorted.some((e) => e.kind === "tool.call");
  if (responses.length > 0 || (debugRecorded && !toolCallsOnly)) {
    const verdicts: Record<Verdict, number> = { correct: 0, partial: 0, incorrect: 0, cannot_check: 0 };
    let checks = 0;
    let failed = 0;
    for (const e of responses) {
      const p = inner(e);
      if (p.name !== "check_answer") continue;
      checks += 1;
      if (p.success === false) {
        failed += 1;
        continue;
      }
      const message = typeof p.message === "string" ? p.message : "";
      const verdict = VERDICT.exec(message)?.[1] as Verdict | undefined;
      if (verdict) verdicts[verdict] += 1;
      else if (/\bcannot_check\b/.test(message)) verdicts.cannot_check += 1;
    }
    answerChecks = measured(
      { count: checks, cannotCheck: verdicts.cannot_check, cannotCheckShare: checks ? Math.round((verdicts.cannot_check / checks) * 1000) / 1000 : null, failed, verdicts },
      "check_answer calls; could not check means the verdict was cannot_check, failed means the call was refused",
    );
  } else {
    answerChecks = missing(toolCallsOnly ? "this recording logged board tools only, not the tutor's own tools" : "no tool log in this recording");
  }

  // Silent, repeated and interrupted turns.
  const silent = turns.filter((t) => t.silent);
  const silentTurns: Scorecard["silentTurns"] = perTurn
    ? measured(
        { count: silent.length, afterStudent: silent.filter((t) => answersStudent(t) && !t.interrupted).length, cutOff: silent.filter((t) => t.interrupted).length },
        "turns with no audio; after the student means the turn answered something they said or typed and was not cut off, cut off means the student interrupted before any audio",
      )
    : missing(NO_TURNS);
  const repeatedTurns: Scorecard["repeatedTurns"] = perTurn
    ? measured(turns.filter((t) => t.repeat).length, "turns that said a sentence of five or more words twice, or again from the turn before")
    : missing(NO_TURNS);
  const interruptions = sorted.filter((e) => isDebug(e, "interrupted")).length;
  const interruptedTurns: Scorecard["interruptedTurns"] = perTurn
    ? measured(turns.filter((t) => t.interrupted).length, "turns the student cut off")
    : debugRecorded
      ? approximate(interruptions, "interruption events, counted as turns")
      : missing("no live events in this recording");

  // Audio stalls. Arrival gaps come only in turn summaries; underruns come from
  // the same Gemini client (GPT-Live's audio is a WebRTC track and has neither).
  const audioGaps: Scorecard["audioGaps"] = perTurn
    ? measured({ count: turns.reduce((s, t) => s + t.arrivalGaps, 0), maxMs: turns.reduce((m, t) => Math.max(m, t.maxArrivalGapMs), 0) }, "audio chunks arriving more than 300 ms apart after a turn's first chunk")
    : missing(NO_TURNS);
  const underrunGaps = underrunEvents.map((e) => count(inner(e).gapMs));
  const underruns: Scorecard["underruns"] =
    perTurn || underrunGaps.length
      ? measured(
          { count: underrunGaps.length, totalMs: Math.round(underrunGaps.reduce((s, v) => s + v, 0)), maxMs: Math.round(underrunGaps.reduce((m, v) => Math.max(m, v), 0)) },
          "times the speaker ran dry mid-turn and the student heard a stall",
        )
      : missing("recorded by the Gemini client from Sept 23 2026 on, alongside turn summaries");

  // Quiet hints and check-ins (the session page, from Sept 23 2026 on, for either voice provider).
  const quietCount = (message: string) => quietEvents.filter((e) => e.payload.message === message).length;
  const quiet: Scorecard["quiet"] =
    perTurn || quietEvents.length
      ? measured(
          { hints: quietCount("quiet_hint"), checkins: checkinsSent.length, unsent: quietCount("quiet_checkin") - checkinsSent.length, skipped: quietCount("quiet_checkin_skipped") },
          "hints are the pet's “Take your time” after 20 s of the student's silence; check-ins are one low-pressure line the tutor is asked for after 45 s",
        )
      : missing("recorded by the session page from Sept 23 2026 on");

  // Tokens and cost. The client sums every usage message in a turn; until it
  // is known whether Live's usage messages overlap, a turn that summed several
  // may count some tokens twice, so those make the totals approximate.
  const withUsage = turns.filter((t) => t.usage);
  const multi = withUsage.filter((t) => (t.usageMessages ?? 0) > 1).length;
  const unknown = withUsage.filter((t) => t.usageMessages === null).length;
  const caveat = multi
    ? `${multi} of ${withUsage.length} turns summed more than one usage message, and whether those overlap is not known yet, so this may count some tokens twice`
    : unknown
      ? "the summaries do not say how many usage messages each turn summed, and summed messages may overlap"
      : "";
  const usageSource = caveat ? approximate : measured;
  let tokens: Scorecard["tokens"] = missing(perTurn ? "the model reported no usage" : NO_TURNS);
  if (withUsage.length) {
    const sum: TurnUsage = { prompt: 0, response: 0, cached: 0, toolUse: 0, thoughts: 0, total: 0, promptByModality: {}, responseByModality: {} };
    for (const t of withUsage) {
      const u = t.usage!;
      sum.prompt += u.prompt;
      sum.response += u.response;
      sum.cached += u.cached;
      sum.toolUse += u.toolUse;
      sum.thoughts += u.thoughts;
      sum.total += u.total;
      for (const [k, v] of Object.entries(u.promptByModality)) sum.promptByModality[k] = (sum.promptByModality[k] ?? 0) + v;
      for (const [k, v] of Object.entries(u.responseByModality)) sum.responseByModality[k] = (sum.responseByModality[k] ?? 0) + v;
    }
    tokens = usageSource({ ...sum, turnsWithUsage: withUsage.length, multiMessageTurns: multi }, caveat ? `as the model reported them, summed over turns; ${caveat}` : "as the model reported them, one usage message a turn");
  }
  let cost: Scorecard["cost"] = missing(perTurn ? "no turn carried a cost estimate" : NO_TURNS);
  const priced = turns.filter((t) => t.costUsd !== null);
  if (priced.length) {
    const usd = priced.reduce((s, t) => s + (t.costUsd ?? 0), 0);
    cost = usageSource(
      { usd: Math.round(usd * 1e6) / 1e6, perMinuteUsd: length > 0 ? Math.round((usd / (length / 60_000)) * 1e6) / 1e6 : null, turnsPriced: priced.length, turns: turns.length },
      `estimated by the live client at paid list prices; a minute is a minute of the whole session${caveat ? `; ${caveat}` : ""}`,
    );
  }

  return {
    version: 1,
    perTurn,
    turnSummaries: turns.length,
    rebuiltTurns: legacy.length,
    durationMs: length,
    replies,
    firstAudioMs,
    toolsBeforeSpeech,
    thinkTimeMs,
    wordsPerTurn,
    questionsPerTurn,
    talkRatio,
    answerChecks,
    silentTurns,
    repeatedTurns,
    interruptedTurns,
    audioGaps,
    underruns,
    quiet,
    tokens,
    cost,
  };
}

// ── Reading it ────────────────────────────────────────────────────────────────
export type ScoreRow = {
  key: string;
  label: string;
  /** The headline number, or null when not recorded. */
  value: string | null;
  /** A second line of numbers. */
  detail?: string;
  source: MetricSource;
  /** How the number is counted. */
  note: string;
  tone?: "warn";
};

const GROUPING = new Intl.NumberFormat("en-US");
const whole = (n: number) => GROUPING.format(Math.round(n));

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Under a second in ms, else in seconds. */
function duration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : seconds(ms);
}

/** 23 → "23", 23.5 → "23.5". */
function plain(n: number): string {
  return Number.isInteger(n) ? whole(n) : n.toFixed(1);
}

/** 182400 → "182k", 32700 → "32.7k", 60000 → "60k". */
export function compactCount(n: number): string {
  if (n < 1000) return whole(n);
  if (n < 1_000_000) return `${n < 100_000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") : Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1).replace(/\.?0+$/, "")}M`;
}

export function money(usd: number): string {
  if (usd === 0) return "$0";
  if (usd >= 0.1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.001) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

const TRIGGER_WORD: Record<TurnTrigger, string> = { voice: "spoken", text: "typed", event: "event", files: "files", opening: "opening", resume: "resume", unknown: "other" };

function modalityLine(by: Record<string, number>): string[] {
  return Object.entries(by)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `${m.toLowerCase()} ${compactCount(n)}`);
}

function row<T>(key: string, label: string, metric: Metric<T>, show: (value: T) => Omit<ScoreRow, "key" | "label" | "source" | "note">): ScoreRow {
  if (metric.source === "not recorded") return { key, label, value: null, source: metric.source, note: metric.note };
  return { key, label, source: metric.source, note: metric.note, ...show(metric.value) };
}

/** Arrival gaps and underruns share a cell; each says for itself whether it was recorded. */
function audioStallsRow(sc: Scorecard): ScoreRow {
  const gaps = sc.audioGaps;
  const dry = sc.underruns;
  const base = { key: "audioStalls", label: "Audio gaps / underruns" };
  if (gaps.source === "not recorded" && dry.source === "not recorded") return { ...base, value: null, source: "not recorded", note: gaps.note };
  const notes = [gaps.source === "not recorded" ? `gaps not recorded: ${gaps.note}` : `gaps are ${gaps.note}`, dry.source === "not recorded" ? `underruns not recorded: ${dry.note}` : `underruns are ${dry.note}`];
  const g = gaps.value;
  const u = dry.value;
  return {
    ...base,
    source: gaps.source === "approximate" || dry.source === "approximate" ? "approximate" : "measured",
    note: notes.join("; "),
    value: `${g ? g.count : "–"} / ${u ? u.count : "–"}`,
    detail:
      [g ? (g.count ? `longest gap ${duration(g.maxMs)}` : "") : "gaps not recorded", u ? (u.count ? `${duration(u.totalMs)} dry` : "") : "underruns not recorded"].filter(Boolean).join(" · ") || undefined,
    tone: u && u.count > 0 ? "warn" : undefined,
  };
}

/** The scorecard as sixteen labelled numbers, in a fixed order (four rows of four). */
export function scorecardRows(sc: Scorecard): ScoreRow[] {
  return [
    row("replies", "Replies", sc.replies, (v) => {
      const parts = (Object.entries(v.byTrigger) as Array<[TurnTrigger, number]>).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${TRIGGER_WORD[t]}`);
      return { value: whole(v.count), detail: parts.length ? parts.join(" · ") : undefined };
    }),
    row("firstAudio", "First audio, p50 / p90", sc.firstAudioMs, (v) => ({ value: `${seconds(v.p50)} / ${seconds(v.p90)}`, detail: `over ${v.n} ${v.n === 1 ? "reply" : "replies"}` })),
    row("toolsBeforeSpeech", "Tools before speech, mean / max", sc.toolsBeforeSpeech, (v) => ({ value: `${v.mean.toFixed(1)} / ${v.max}`, detail: `over ${v.n} turns that spoke` })),
    row("thinkTime", "Think time, p50 / p90", sc.thinkTimeMs, (v) => ({
      value: `${seconds(v.p50)} / ${seconds(v.p90)}`,
      detail: [`${v.over20s} of ${v.n} over 20 s`, v.midTurn ? `${v.midTurn} came mid-turn` : ""].filter(Boolean).join(" · "),
    })),
    row("wordsPerTurn", "Tutor words per turn, p50 / p90", sc.wordsPerTurn, (v) => ({ value: `${plain(v.p50)} / ${plain(v.p90)}`, detail: `over ${v.n} turns` })),
    row("questionsPerTurn", "Questions per turn", sc.questionsPerTurn, (v) => ({ value: v.mean.toFixed(1), detail: `${v.twoOrMore} ${v.twoOrMore === 1 ? "turn" : "turns"} with 2 or more` })),
    row("talkRatio", "Talk ratio, tutor : student", sc.talkRatio, (v) => ({
      value: v.ratio === null ? "No student words" : `${plain(v.ratio)} : 1`,
      detail: `${whole(v.tutorWords)} and ${whole(v.studentWords)} words`,
    })),
    row("answerChecks", "Answer checks", sc.answerChecks, (v) => ({
      value: whole(v.count),
      detail: v.count ? `${v.cannotCheck} of ${v.count} could not check${v.failed ? ` · ${v.failed} failed` : ""}` : "none called",
    })),
    row("silentTurns", "Silent turns", sc.silentTurns, (v) => ({
      value: whole(v.count),
      detail: v.count ? [`${v.afterStudent} after the student`, v.cutOff ? `${v.cutOff} cut off first` : ""].filter(Boolean).join(" · ") : undefined,
      tone: v.afterStudent > 0 ? "warn" : undefined,
    })),
    row("repeatedTurns", "Repeated turns", sc.repeatedTurns, (v) => ({ value: whole(v), tone: v > 0 ? "warn" : undefined })),
    row("interruptedTurns", "Interrupted turns", sc.interruptedTurns, (v) => ({ value: whole(v), tone: v > 0 ? "warn" : undefined })),
    audioStallsRow(sc),
    row("quiet", "Quiet hints / check-ins", sc.quiet, (v) => ({
      value: `${v.hints} / ${v.checkins}`,
      detail: [v.unsent ? `${v.unsent} not sent` : "", v.skipped ? `${v.skipped} skipped` : ""].filter(Boolean).join(" · ") || undefined,
    })),
    row("tokensIn", "Tokens in", sc.tokens, (v) => {
      const parts = modalityLine(v.promptByModality);
      if (v.toolUse) parts.push(`tool results ${compactCount(v.toolUse)}`);
      if (v.cached) parts.push(`${compactCount(v.cached)} cached`);
      return { value: compactCount(v.prompt + v.toolUse), detail: parts.join(" · ") || undefined };
    }),
    row("tokensOut", "Tokens out", sc.tokens, (v) => {
      const parts = modalityLine(v.responseByModality);
      if (v.thoughts) parts.push(`thinking ${compactCount(v.thoughts)}`);
      return { value: compactCount(v.response + v.thoughts), detail: parts.join(" · ") || undefined };
    }),
    row("cost", "Estimated cost", sc.cost, (v) => ({
      value: money(v.usd),
      detail: [v.perMinuteUsd !== null ? `${money(v.perMinuteUsd)} a minute` : "", v.turnsPriced < v.turns ? `${v.turnsPriced} of ${v.turns} turns priced` : ""].filter(Boolean).join(" · ") || undefined,
    })),
  ];
}

/** One line under the scorecard's title: where its numbers came from. */
export function scorecardCaption(sc: Scorecard): string {
  if (!sc.perTurn) return "Recorded before turn summaries; ≈ marks an estimate.";
  const estimates = scorecardRows(sc).some((r) => r.source === "approximate");
  return `Measured from ${sc.turnSummaries} turn ${sc.turnSummaries === 1 ? "summary" : "summaries"}.${estimates ? " ≈ marks an estimate." : ""}`;
}

/** The "Scorecard" section of the Markdown export. */
export function scorecardMarkdown(sc: Scorecard): string[] {
  const rows = scorecardRows(sc);
  const summaries = `${sc.turnSummaries} turn ${sc.turnSummaries === 1 ? "summary" : "summaries"}`;
  const lines = [
    "## Scorecard",
    "",
    sc.perTurn
      ? `Measured from ${summaries}.${rows.some((r) => r.source === "approximate") ? " Approximate numbers say why." : ""}`
      : `This recording has no turn summaries: ${sc.rebuiltTurns ? `replies and think time are rebuilt from its turn_complete events (${sc.rebuiltTurns} turns), ` : ""}approximate numbers are estimated from older events (the transcript, the voice and tool log), and "not recorded" means there is nothing to measure them from.`,
    "",
  ];
  for (const r of rows) {
    if (r.value === null) {
      lines.push(`- ${r.label}: not recorded (${r.note})`);
      continue;
    }
    const head = `- ${r.label}: ${r.source === "approximate" ? "≈ " : ""}${r.value}${r.detail ? ` (${r.detail})` : ""}`;
    lines.push(r.source === "approximate" ? `${head}; approximate: ${r.note}` : head);
  }
  return lines;
}

/** A turn summary as a log entry's title and detail. */
export function describeTurn(t: RecordedTurn): { title: string; detail: string; problems: string[] } {
  const problems = turnProblems(t);
  const title = `Turn ${t.n || "?"}${problems.length ? `: ${problems.join(", ")}` : ""}`;
  const lines: string[] = [];
  const answering = t.inputAt === null ? "no student input" : `${TRIGGER_WORD[t.trigger]} input`;
  const first = t.firstAudioMs === null ? "no audio" : `first audio ${seconds(t.firstAudioMs)}`;
  const before = t.toolsBeforeAudio ? ` after ${t.toolsBeforeAudio} tool call${t.toolsBeforeAudio === 1 ? "" : "s"}` : "";
  lines.push(`${answering} · ${first}${before}${t.interrupted ? " · interrupted" : ""}`);
  if (t.tools.length) lines.push(`tools: ${t.tools.join(", ")}`);
  lines.push(`${t.words} words, ${t.questions} question${t.questions === 1 ? "" : "s"}, ${seconds(t.audioMs)} of audio${t.arrivalGaps ? ` · ${t.arrivalGaps} arrival gap${t.arrivalGaps === 1 ? "" : "s"}, longest ${duration(t.maxArrivalGapMs)}` : ""}`);
  if (t.usage) {
    const reports = t.usageMessages !== null && t.usageMessages > 1 ? ` · summed from ${t.usageMessages} usage messages` : "";
    lines.push(`tokens ${whole(t.usage.prompt + t.usage.toolUse)} in, ${whole(t.usage.response + t.usage.thoughts)} out${t.costUsd !== null ? ` · ${money(t.costUsd)}` : ""}${reports}`);
  }
  if (t.text) lines.push(`"${t.text}"`);
  return { title, detail: lines.join("\n"), problems };
}
