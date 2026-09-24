import { test } from "node:test";
import assert from "node:assert/strict";
import type { TimelineEvent } from "./session-recording";
import {
  compactCount,
  countWords,
  describeTurn,
  legacyTurns,
  money,
  quantile,
  readTurn,
  recordedTurns,
  recordingClock,
  scorecardCaption,
  scorecardMarkdown,
  scorecardRows,
  sessionScorecard,
  type Metric,
} from "./session-scorecard";

let seq = 0;
const ev = (offsetMs: number, kind: string, actor: string, payload: Record<string, unknown> = {}): TimelineEvent => ({ seq: ++seq, offsetMs, kind, actor, payload });
const said = (offsetMs: number, role: "student" | "tutor", text: string, extra: Record<string, unknown> = {}) => ev(offsetMs, "transcript.entry", role, { role, text, ...extra });
const debug = (offsetMs: number, kind: string, message: string, payload: Record<string, unknown> = {}) => ev(offsetMs, "live.debug", "system", { kind, message, payload });

// The recording's clock starts at this epoch time, so offsetMs = epoch - T0.
const T0 = 1_790_300_000_000;
type TurnInput = { n: number; trigger?: string; inputOffset: number | null; endOffset: number } & Record<string, unknown>;
function turn({ n, trigger = "voice", inputOffset, endOffset, ...rest }: TurnInput): TimelineEvent {
  return debug(endOffset, "turn", "turn_summary", {
    n,
    model: "gemini-3.8-live",
    trigger,
    inputAt: inputOffset === null ? null : T0 + inputOffset,
    endAt: T0 + endOffset,
    firstToolMs: null,
    firstAudioMs: 1000,
    toolsBeforeAudio: 0,
    tools: [],
    audioMs: 3000,
    words: 20,
    questions: 1,
    text: "Some words.",
    arrivalGaps: 0,
    maxArrivalGapMs: 0,
    repeat: false,
    silent: false,
    interrupted: false,
    endedBy: "turn_complete",
    usage: null,
    usageMessages: 1,
    costUsd: null,
    ...rest,
  });
}
const check = (offsetMs: number, message: string, success = true) =>
  debug(offsetMs, "tool", "tool_response_sent", success ? { name: "check_answer", success, message } : { name: "check_answer", success, error: "check_answer needs problem and student_answer, both as strings." });

const valueOf = <T>(m: Metric<T>): T => {
  assert.notEqual(m.source, "not recorded", m.note);
  return m.value as T;
};

test("quantiles interpolate, and words are runs with a letter or digit", () => {
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([5], 0.9), 5);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([10, 0, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.9), 90);
  assert.equal(countWords("  Okay — so 3/4 is, like, bigger?  "), 6);
  assert.equal(countWords(""), 0);
});

test("a turn summary is read defensively", () => {
  assert.equal(readTurn(debug(0, "turn", "turn_complete")), null);
  assert.equal(readTurn(debug(0, "turn", "turn_summary", { n: 1 })), null, "no end time");
  const t = readTurn(debug(10, "turn", "turn_summary", { n: "2", endAt: T0, trigger: "shout", audioMs: 0, words: -3, tools: ["point_at", 3], usage: { prompt: 10, promptByModality: { text: 7, audio: "x" } } }));
  assert.ok(t);
  assert.equal(t.n, 0);
  assert.equal(t.trigger, "unknown");
  assert.equal(t.silent, true, "no audio and no silent flag reads as silent");
  assert.equal(t.words, 0);
  assert.deepEqual(t.tools, ["point_at", "3"]);
  assert.deepEqual(t.usage?.promptByModality, { TEXT: 7 });
  assert.equal(t.inputAt, null);
});

test("a recording with turn summaries is measured throughout", () => {
  const usage = (prompt: number, response: number) => ({ prompt, response, cached: 100, toolUse: 50, thoughts: 0, total: prompt + response + 50, promptByModality: { TEXT: prompt - 200, AUDIO: 200 }, responseByModality: { AUDIO: response } });
  const events: TimelineEvent[] = [
    said(0, "student", "I need help with: fractions Please teach me in English.", { id: "intake_1" }),
    turn({ n: 1, trigger: "opening", inputOffset: 0, endOffset: 5000, firstAudioMs: 1200, firstToolMs: 400, toolsBeforeAudio: 1, tools: ["start_problem"], words: 30, questions: 1, usage: usage(4000, 300), costUsd: 0.004 }),
    said(1500, "tutor", "Fractions. What do you already know about them? Tell me."),
    said(9000, "student", "a little about halves"),
    turn({ n: 2, inputOffset: 9000, endOffset: 14_000, firstAudioMs: 800, words: 40, questions: 2, arrivalGaps: 2, maxArrivalGapMs: 640, repeat: true, usage: usage(6000, 500), costUsd: 0.006 }),
    said(10_000, "tutor", "Halves are a great start. What is half of eight? And half of ten?"),
    debug(12_000, "audio", "audio_underrun", { gapMs: 420, turn: 2 }),
    debug(13_000, "audio", "audio_underrun", { gapMs: 180.4, turn: 2 }),
    // 30 s of quiet, then the student types.
    debug(26_000, "silence", "quiet_hint", { sinceMs: 12_000 }),
    debug(38_000, "silence", "quiet_checkin", { sinceMs: 24_000 }),
    debug(40_000, "silence", "quiet_checkin_skipped", { sinceMs: 26_000, reason: "student typing" }),
    said(44_000, "student", "four and five"),
    turn({ n: 3, trigger: "text", inputOffset: 44_000, endOffset: 47_000, firstAudioMs: null, audioMs: 0, silent: true, toolsBeforeAudio: 2, tools: ["check_answer", "circle_item"], words: 0, questions: 0 }),
    check(45_000, "Verdict: correct. Correct: 8 / 2 = 4, and the student's 4 matches."),
    check(45_500, "Verdict: cannot_check. Can't check this automatically: \"half of ten\" has symbols it can't read."),
    check(45_800, "", false),
    // An event-triggered turn is not the student's think time.
    turn({ n: 4, trigger: "event", inputOffset: 50_000, endOffset: 53_000, firstAudioMs: 2000, words: 10, questions: 0 }),
    ev(54_000, "session.paused", "system"),
    ev(90_000, "session.resumed", "system"),
    said(91_000, "student", "ok back"),
    turn({ n: 5, inputOffset: 91_000, endOffset: 95_000, firstAudioMs: 7000, words: 12, questions: 0, interrupted: true, costUsd: null }),
  ];
  const sc = sessionScorecard(events, 120_000);
  assert.equal(sc.perTurn, true);
  assert.equal(sc.turnSummaries, 5);
  assert.equal(sc.durationMs, 120_000);

  const replies = valueOf(sc.replies);
  assert.equal(sc.replies.source, "measured");
  assert.equal(replies.count, 5);
  assert.deepEqual(replies.byTrigger, { opening: 1, voice: 2, text: 1, event: 1 });

  // First audio over the four turns that had any: 800, 1200, 2000, 7000.
  assert.deepEqual(valueOf(sc.firstAudioMs), { p50: 1600, p90: 5500, n: 4 });
  // Tools before speech over the four turns that spoke: 1, 0, 0, 0.
  assert.deepEqual(valueOf(sc.toolsBeforeSpeech), { mean: 0.25, max: 1, n: 4 });

  // Think time: turn 2 answers turn 1 (9000 - 5000 = 4 s), turn 3 answers turn 2
  // (44000 - 14000 = 30 s), turn 4 is an event, turn 5 comes after a pause.
  assert.equal(sc.thinkTimeMs.source, "measured");
  assert.deepEqual(valueOf(sc.thinkTimeMs), { p50: 17_000, p90: 27_400, n: 2, over20s: 1, midTurn: 0 });

  assert.deepEqual(valueOf(sc.wordsPerTurn), { p50: 21, p90: 37, n: 4 });
  assert.deepEqual(valueOf(sc.questionsPerTurn), { mean: 0.75, twoOrMore: 1, n: 4 });

  // Talk ratio comes from the transcript, without the intake line.
  const talk = valueOf(sc.talkRatio);
  assert.equal(talk.studentWords, 4 + 3 + 2);
  assert.equal(talk.tutorWords, 10 + 14);
  assert.equal(talk.ratio, 2.7);

  const checks = valueOf(sc.answerChecks);
  assert.equal(checks.count, 3);
  assert.equal(checks.cannotCheck, 1);
  assert.equal(checks.failed, 1);
  assert.equal(checks.cannotCheckShare, 0.333);
  assert.deepEqual(checks.verdicts, { correct: 1, partial: 0, incorrect: 0, cannot_check: 1 });

  assert.deepEqual(valueOf(sc.silentTurns), { count: 1, afterStudent: 1, cutOff: 0 });
  assert.equal(valueOf(sc.repeatedTurns), 1);
  assert.equal(valueOf(sc.interruptedTurns), 1);
  assert.deepEqual(valueOf(sc.audioGaps), { count: 2, maxMs: 640 });
  assert.deepEqual(valueOf(sc.underruns), { count: 2, totalMs: 600, maxMs: 420 });
  assert.deepEqual(valueOf(sc.quiet), { hints: 1, checkins: 1, unsent: 0, skipped: 1 });

  const tokens = valueOf(sc.tokens);
  assert.equal(tokens.turnsWithUsage, 2);
  assert.equal(tokens.prompt, 10_000);
  assert.equal(tokens.response, 800);
  assert.equal(tokens.toolUse, 100);
  assert.deepEqual(tokens.promptByModality, { TEXT: 9600, AUDIO: 400 });
  assert.deepEqual(tokens.responseByModality, { AUDIO: 800 });

  const cost = valueOf(sc.cost);
  assert.equal(cost.usd, 0.01);
  assert.equal(cost.perMinuteUsd, 0.005, "$0.01 over two minutes");
  assert.equal(cost.turnsPriced, 2);
  assert.equal(cost.turns, 5);

  for (const key of Object.keys(sc) as Array<keyof typeof sc>) {
    const m = sc[key];
    if (m && typeof m === "object" && "source" in m) assert.equal(m.source, "measured", `${key}: ${m.note}`);
  }
  assert.equal(scorecardCaption(sc), "Measured from 5 turn summaries.");
});

test("an older voice recording falls back honestly: approximate where it can, not recorded where it can't", () => {
  const events: TimelineEvent[] = [
    said(0, "student", "I need help with: slope", { id: "intake_2" }),
    debug(800, "session", "opening_turn_sent", { sent: true, mode: "new", fromIntake: true }),
    ev(2000, "tutor.speaking", "tutor", { speaking: true }),
    said(2000, "tutor", "Slope. What do you know?"),
    ev(6000, "tutor.speaking", "tutor", { speaking: false }),
    said(8000, "student", "rise"),
    said(9000, "student", "over run"),
    // Silent bookkeeping before the voice is not the reply.
    debug(10_000, "tool", "tool_response_sent", { name: "draw_desmos", success: true, message: "Drew y = 2x" }),
    debug(10_200, "tool", "tool_response_sent", { name: "check_answer", success: true, message: "Verdict: cannot_check. Can't check this automatically." }),
    ev(12_500, "tutor.speaking", "tutor", { speaking: true }),
    said(12_500, "tutor", "Yes. Rise over run."),
    said(14_000, "tutor", "Which is the rise here? And the run?"),
    debug(15_500, "turn", "interrupted"),
    ev(16_000, "tutor.speaking", "tutor", { speaking: false }),
    said(46_000, "student", "four"),
    ev(47_000, "tutor.speaking", "tutor", { speaking: true }),
    said(47_000, "tutor", "Right."),
    ev(48_000, "tutor.speaking", "tutor", { speaking: false }),
  ];
  const sc = sessionScorecard(events, 50_000);
  assert.equal(sc.perTurn, false);
  assert.deepEqual(legacyTurns(events), [], "no turn_complete events, so no turns to rebuild");

  // Replies: the tutor's words between two student lines.
  assert.equal(sc.replies.source, "approximate");
  assert.equal(valueOf(sc.replies).count, 3);
  assert.equal(sc.wordsPerTurn.source, "approximate");
  assert.deepEqual(valueOf(sc.wordsPerTurn), { p50: 5, p90: 11, n: 3 });
  assert.deepEqual(valueOf(sc.questionsPerTurn), { mean: 1, twoOrMore: 1, n: 3 });

  // First audio, to the voice only: opening 800 -> 2000, "over run" 9000 -> 12500
  // (not the tool at 10000), "four" 46000 -> 47000. "rise" is answered by "over run".
  assert.equal(sc.firstAudioMs.source, "approximate");
  assert.deepEqual(valueOf(sc.firstAudioMs), { p50: 1200, p90: 3040, n: 3 });
  assert.match(sc.firstAudioMs.note, /voice starting/);

  // Think time: 6000 -> 9000 and 16000 -> 46000.
  assert.equal(sc.thinkTimeMs.source, "approximate");
  assert.deepEqual(valueOf(sc.thinkTimeMs), { p50: 16_500, p90: 27_300, n: 2, over20s: 1, midTurn: 0 });

  assert.equal(sc.talkRatio.source, "measured");
  assert.deepEqual(valueOf(sc.talkRatio), { ratio: 4.5, tutorWords: 18, studentWords: 4 });
  assert.equal(sc.answerChecks.source, "measured");
  assert.equal(valueOf(sc.answerChecks).cannotCheck, 1);
  assert.equal(sc.interruptedTurns.source, "approximate");
  assert.equal(valueOf(sc.interruptedTurns), 1);

  for (const key of ["toolsBeforeSpeech", "silentTurns", "repeatedTurns", "audioGaps", "underruns", "quiet", "tokens", "cost"] as const) {
    assert.equal(sc[key].source, "not recorded", key);
    assert.equal(sc[key].value, null, key);
  }

  const rows = scorecardRows(sc);
  assert.equal(rows.length, 16);
  assert.ok(rows.filter((r) => r.source === "not recorded").every((r) => r.value === null), "not recorded never shows a number");
  assert.match(scorecardCaption(sc), /≈ marks an estimate/);
});

test("a typed recording with turn_complete events gets exact replies and think time, and voice-only reply times", () => {
  const typed = (offsetMs: number, text: string) => [debug(offsetMs, "text", "student_text_sent", { text, success: true }), said(offsetMs, "student", text, { id: `text_${offsetMs}` })];
  const events: TimelineEvent[] = [
    said(0, "student", "I need help with: fractions", { id: "intake_1" }),
    debug(1000, "session", "opening_turn_sent", { sent: true, mode: "new" }),
    ev(2500, "tutor.speaking", "tutor", { speaking: true }),
    said(2500, "tutor", "Hi. What are we working on?"),
    debug(5000, "turn", "turn_complete"),
    ev(5200, "tutor.speaking", "tutor", { speaking: false }),
    ...typed(11_000, "fractions"),
    debug(11_600, "tool", "tool_response_sent", { name: "check_answer", success: true, message: "Verdict: correct." }),
    debug(12_000, "tool", "tool_response_sent", { name: "record_teaching_move", success: true, message: "ok" }),
    ev(13_500, "tutor.speaking", "tutor", { speaking: true }),
    said(13_500, "tutor", "Good. Look at the circle. How many parts?"),
    debug(17_000, "turn", "turn_complete"),
    ev(17_200, "tutor.speaking", "tutor", { speaking: false }),
    ...typed(42_000, "4"),
    ev(43_000, "tutor.speaking", "tutor", { speaking: true }),
    said(43_000, "tutor", "Yes, four parts. Now"),
    // The student cuts in; the server's turnComplete that follows ends the same turn.
    debug(44_500, "turn", "interrupted"),
    ev(44_500, "tutor.speaking", "tutor", { speaking: false }),
    debug(44_600, "turn", "turn_complete"),
    said(45_000, "student", "wait what"),
    ev(47_000, "tutor.speaking", "tutor", { speaking: true }),
    said(47_000, "tutor", "Sure. Say it again?"),
    debug(49_000, "turn", "turn_complete"),
    ev(49_500, "tutor.speaking", "tutor", { speaking: false }),
  ];
  assert.deepEqual(
    legacyTurns(events).map((t) => [t.trigger, t.inputMs, t.startMs, t.endMs, t.interrupted]),
    [
      ["opening", 1000, 2500, 5000, false],
      ["text", 11_000, 11_600, 17_000, false],
      ["text", 42_000, 43_000, 44_500, true],
      ["voice", 45_000, 47_000, 49_000, false],
    ],
  );
  const sc = sessionScorecard(events, 60_000);
  assert.equal(sc.replies.source, "measured");
  assert.deepEqual(valueOf(sc.replies), { count: 4, byTrigger: { opening: 1, text: 2, voice: 1 } });
  // Think time from turn_complete: 5000 -> 11000, 17000 -> 42000, 44500 -> 45000.
  assert.equal(sc.thinkTimeMs.source, "measured");
  assert.deepEqual(valueOf(sc.thinkTimeMs), { p50: 6000, p90: 21_200, n: 3, over20s: 1, midTurn: 0 });
  // First audio to the voice, never to check_answer or record_teaching_move: 1500, 2500, 1000, 2000.
  assert.equal(sc.firstAudioMs.source, "approximate");
  assert.deepEqual(valueOf(sc.firstAudioMs), { p50: 1750, p90: 2350, n: 4 });
  assert.equal(scorecardRows(sc).find((r) => r.key === "replies")?.detail, "2 typed · 1 opening · 1 spoken");
  assert.equal(sc.rebuiltTurns, 4);
  assert.match(scorecardMarkdown(sc).join("\n"), /replies and think time are rebuilt from its turn_complete events \(4 turns\)/);
});

test("think time: mid-turn input, a quiet check-in, pauses mid-turn and inside the summary's delay", () => {
  // Summaries are written 1.5 s after the turn ends, as the client does; the transcript fixes the clock exactly.
  const at = (offsetMs: number, role: "student" | "tutor", text: string) => said(offsetMs, role, text, { at: T0 + offsetMs });
  const late = (input: TurnInput) => ({ ...turn(input), offsetMs: input.endOffset + 1500 });
  const midAndCheckin: TimelineEvent[] = [
    at(1000, "tutor", "What is a half of ten?"),
    late({ n: 1, inputOffset: 0, endOffset: 5000 }),
    at(10_000, "student", "five"),
    late({ n: 2, inputOffset: 10_000, endOffset: 16_000 }),
    // A late fragment of what turn 2 already answered: it came before turn 2 ended.
    late({ n: 3, inputOffset: 15_000, endOffset: 20_000 }),
    debug(65_000, "silence", "quiet_checkin", { sinceMs: 45_000, sent: true }),
    late({ n: 4, trigger: "event", inputOffset: 65_000, endOffset: 68_000 }),
    at(80_000, "student", "is it three"),
    late({ n: 5, inputOffset: 80_000, endOffset: 84_000 }),
  ];
  assert.deepEqual(recordingClock(midAndCheckin, recordedTurns(midAndCheckin))(40_000), { base: T0, exact: true });
  // 10000 - 5000 = 5 s; turn 3 is mid-turn, not a zero; after the check-in the student's
  // silence still runs from turn 3's end: 80000 - 20000 = 60 s.
  assert.deepEqual(valueOf(sessionScorecard(midAndCheckin, 90_000).thinkTimeMs), { p50: 32_500, p90: 54_500, n: 2, over20s: 1, midTurn: 1 });
  const midRow = scorecardRows(sessionScorecard(midAndCheckin, 90_000)).find((r) => r.key === "thinkTime");
  assert.equal(midRow?.detail, "1 of 2 over 20 s · 1 came mid-turn");

  const pauses: TimelineEvent[] = [
    at(1000, "tutor", "Try this one."),
    // Paused while the tutor was still talking; back ten minutes later.
    ev(4000, "session.paused", "system"),
    late({ n: 1, inputOffset: 0, endOffset: 5000 }),
    ev(600_000, "session.resumed", "system"),
    late({ n: 2, inputOffset: 601_000, endOffset: 605_000 }),
    // Paused a second after the turn ended, before its summary was written.
    ev(606_000, "session.paused", "system"),
    ev(900_000, "session.resumed", "system"),
    late({ n: 3, inputOffset: 901_000, endOffset: 905_000 }),
    late({ n: 4, inputOffset: 915_000, endOffset: 918_000 }),
  ];
  assert.deepEqual(valueOf(sessionScorecard(pauses, 920_000).thinkTimeMs), { p50: 10_000, p90: 10_000, n: 1, over20s: 0, midTurn: 0 });

  // Without a transcript the summaries bound the clock (written 0 to 1.5 s after the turn): the middle is within 0.75 s.
  const bare = [late({ n: 1, inputOffset: 0, endOffset: 5000 }), late({ n: 2, inputOffset: 9000, endOffset: 12_000 })];
  assert.deepEqual(recordingClock(bare, recordedTurns(bare))(0), { base: T0 - 750, exact: false });

  // An older recording reloaded without a pause: the gap across the reload is not think time.
  const reload = [
    said(0, "student", "hi"),
    ev(500, "tutor.speaking", "tutor", { speaking: true }),
    said(500, "tutor", "Hello, what are we doing?"),
    ev(3000, "tutor.speaking", "tutor", { speaking: false }),
    ev(7_200_000, "session.started", "system", { resumed: true }),
    said(7_201_000, "student", "back"),
  ];
  assert.equal(sessionScorecard(reload, 7_300_000).thinkTimeMs.source, "not recorded");
});

test("GPT-Live on the new page: quiet events are measured, audio stalls are not recorded, unsent check-ins apart", () => {
  const events = [
    said(0, "student", "hi"),
    said(1000, "tutor", "Hello, what are we doing?"),
    debug(20_000, "silence", "quiet_hint", { sinceMs: 20_000 }),
    debug(45_000, "silence", "quiet_checkin", { sinceMs: 45_000, sent: false }),
    said(50_000, "student", "fractions"),
  ];
  const sc = sessionScorecard(events, 60_000);
  assert.equal(sc.audioGaps.source, "not recorded");
  assert.equal(sc.underruns.source, "not recorded");
  assert.deepEqual(valueOf(sc.quiet), { hints: 1, checkins: 0, unsent: 1, skipped: 0 });
  const rows = Object.fromEntries(scorecardRows(sc).map((r) => [r.key, r]));
  assert.equal(rows.audioStalls.value, null);
  assert.equal(rows.audioStalls.source, "not recorded");
  assert.equal(rows.quiet.value, "1 / 0");
  assert.equal(rows.quiet.detail, "1 not sent");

  // An underrun recorded without turn summaries is still counted; the gaps are not.
  const dry = sessionScorecard([said(0, "student", "hi"), debug(2000, "audio", "audio_underrun", { gapMs: 400, turn: 1 })], 5000);
  const row = scorecardRows(dry).find((r) => r.key === "audioStalls");
  assert.equal(row?.value, "\u2013 / 1");
  assert.equal(row?.detail, "gaps not recorded · 400 ms dry");
});

test("a turn the student cut off before any audio is barge-in, not a missing reply", () => {
  const events = [turn({ n: 4, inputOffset: 3000, endOffset: 5000, firstAudioMs: null, audioMs: 0, silent: true, words: 0, questions: 0, interrupted: false, endedBy: "interrupted" })];
  const [t] = recordedTurns(events);
  assert.equal(t.interrupted, true, "endedBy interrupted reads as interrupted");
  assert.deepEqual(describeTurn(t).problems, []);
  const sc = sessionScorecard(events, 10_000);
  assert.deepEqual(valueOf(sc.silentTurns), { count: 1, afterStudent: 0, cutOff: 1 });
  const row = scorecardRows(sc).find((r) => r.key === "silentTurns");
  assert.equal(row?.detail, "0 after the student · 1 cut off first");
  assert.equal(row?.tone, undefined);
});

test("tokens and cost are approximate while a turn sums several usage messages", () => {
  const usage = { prompt: 1000, response: 100, cached: 0, toolUse: 0, thoughts: 0, total: 1100, promptByModality: { TEXT: 1000 }, responseByModality: { AUDIO: 100 } };
  const events = [
    turn({ n: 1, inputOffset: 0, endOffset: 4000, usage, usageMessages: 1, costUsd: 0.002 }),
    turn({ n: 2, inputOffset: 6000, endOffset: 9000, usage, usageMessages: 3, costUsd: 0.002 }),
    turn({ n: 3, inputOffset: 11_000, endOffset: 14_000, usage, usageMessages: 2, costUsd: 0.002 }),
  ];
  const sc = sessionScorecard(events, 60_000);
  assert.equal(sc.tokens.source, "approximate");
  assert.equal(valueOf(sc.tokens).multiMessageTurns, 2);
  assert.match(sc.tokens.note, /2 of 3 turns summed more than one usage message/);
  assert.equal(sc.cost.source, "approximate");
  assert.match(scorecardCaption(sc), /^Measured from 3 turn summaries\. ≈ marks an estimate\.$/);
  assert.match(describeTurn(recordedTurns(events)[1]).detail, /summed from 3 usage messages/);
  // Summaries that do not say how many messages they summed are approximate too.
  const unknown = sessionScorecard([turn({ n: 1, inputOffset: 0, endOffset: 4000, usage, usageMessages: undefined, costUsd: 0.002 })], 60_000);
  assert.equal(unknown.tokens.source, "approximate");
  assert.match(unknown.tokens.note, /do not say how many usage messages/);
  // A summary stored twice (a retried batch) counts once.
  const twice = sessionScorecard([events[0], { ...events[0], seq: 999 }], 60_000);
  assert.equal(valueOf(twice.replies).count, 1);
  assert.equal(valueOf(twice.cost).usd, 0.002);
});

test("a recording with no tool log and no live events says so, and never shows 0", () => {
  const sc = sessionScorecard([said(0, "student", "hi"), ev(500, "tool.call", "tutor", { name: "draw_fraction", success: true })], 1000);
  assert.equal(sc.answerChecks.source, "not recorded");
  assert.match(sc.answerChecks.note, /board tools only/);
  assert.equal(sc.interruptedTurns.source, "not recorded");
  assert.equal(sc.replies.source, "not recorded");
  const empty = sessionScorecard([], 0);
  assert.ok(scorecardRows(empty).every((r) => r.value === null && r.source === "not recorded"));
  // With live events but no tools at all, zero checks is a real zero.
  const quiet = sessionScorecard([debug(0, "connection", "websocket_open")], 1000);
  assert.equal(quiet.answerChecks.source, "measured");
  assert.equal(valueOf(quiet.answerChecks).count, 0);
});

test("the rows read like the page and the Markdown export", () => {
  const events = [
    turn({ n: 1, inputOffset: 0, endOffset: 4000, firstAudioMs: 900, usage: { prompt: 182_400, response: 31_200, cached: 40_000, toolUse: 0, thoughts: 1500, total: 215_100, promptByModality: { TEXT: 120_000, AUDIO: 60_000, IMAGE: 2400 }, responseByModality: { AUDIO: 31_200 } }, usageMessages: 1, costUsd: 0.4213 }),
    debug(5000, "audio", "audio_underrun", { gapMs: 900 }),
  ];
  const rows = Object.fromEntries(scorecardRows(sessionScorecard(events, 60_000)).map((r) => [r.key, r]));
  assert.equal(rows.firstAudio.value, "0.9 s / 0.9 s");
  assert.equal(rows.replies.detail, "1 spoken");
  assert.equal(rows.tokensIn.value, "182k");
  assert.equal(rows.tokensIn.detail, "text 120k · audio 60k · image 2.4k · 40k cached");
  assert.equal(rows.tokensOut.value, "32.7k");
  assert.equal(rows.tokensOut.detail, "audio 31.2k · thinking 1.5k");
  assert.equal(rows.cost.value, "$0.42");
  assert.equal(rows.cost.detail, "$0.42 a minute");
  assert.equal(rows.audioStalls.value, "0 / 1");
  assert.equal(rows.audioStalls.detail, "900 ms dry");
  assert.equal(rows.audioStalls.tone, "warn");
  assert.equal(rows.thinkTime.value, null, "one turn has nothing to answer");
  assert.equal(compactCount(999), "999");
  assert.equal(compactCount(1_250_000), "1.25M");
  assert.equal(money(0.0132), "$0.013");
  assert.equal(money(0.00042), "$0.0004");

  const md = scorecardMarkdown(sessionScorecard(events, 60_000)).join("\n");
  assert.match(md, /^## Scorecard/);
  assert.match(md, /- First audio, p50 \/ p90: 0\.9 s \/ 0\.9 s \(over 1 reply\)/);
  assert.match(md, /- Think time, p50 \/ p90: not recorded \(no student input after a tutor turn\)/);
  const old = scorecardMarkdown(sessionScorecard([said(0, "student", "hi"), said(1000, "tutor", "Hello there. What are we doing?"), said(4000, "student", "fractions")], 5000)).join("\n");
  assert.match(old, /- Replies: ≈ 1; approximate: /);
  assert.match(old, /- Tokens in: not recorded \(needs per-turn summaries/);
});

test("a turn reads as one log line with its problems first", () => {
  const [t] = recordedTurns([turn({ n: 7, trigger: "text", inputOffset: 0, endOffset: 9000, firstAudioMs: 7200, toolsBeforeAudio: 3, tools: ["start_problem", "ask", "point_at"], repeat: true, arrivalGaps: 1, maxArrivalGapMs: 450, text: "Try it. Try it." })]);
  const d = describeTurn(t);
  assert.deepEqual(d.problems, ["said a sentence twice", "first audio after 7.2 s"]);
  assert.equal(d.title, "Turn 7: said a sentence twice, first audio after 7.2 s");
  assert.match(d.detail, /^typed input · first audio 7\.2 s after 3 tool calls/);
  assert.match(d.detail, /tools: start_problem, ask, point_at/);
  assert.match(d.detail, /20 words, 1 question, 3\.0 s of audio · 1 arrival gap, longest 450 ms/);
  const [quiet] = recordedTurns([turn({ n: 2, trigger: "event", inputOffset: 0, endOffset: 100, audioMs: 0, silent: true, firstAudioMs: null })]);
  assert.deepEqual(describeTurn(quiet).problems, [], "a silent turn after an event is not a problem");
});
