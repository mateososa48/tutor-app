import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeSession,
  buildLog,
  buildMarkdownExport,
  clampPayload,
  compareEvents,
  formatClock,
  lastIndexAtOrBefore,
  breakIntervals,
  mergeUtterances,
  speakingIntervals,
  studentInputs,
  voiceReplyTimes,
  type TimelineEvent,
} from "./session-recording";

let seq = 0;
const ev = (offsetMs: number, kind: string, actor: string, payload: Record<string, unknown> = {}): TimelineEvent => ({ seq: ++seq, offsetMs, kind, actor, payload });
const said = (offsetMs: number, role: "student" | "tutor", text: string) => ev(offsetMs, "transcript.entry", role, { role, text });
const debug = (offsetMs: number, kind: string, message: string, payload: Record<string, unknown> = {}) => ev(offsetMs, "live.debug", "system", { kind, message, payload });

test("events in the same millisecond keep the recorder's order, whatever seq the server gave them", () => {
  // Fragments of one sentence, all at 5000 ms, stored with shuffled seq (the old race).
  const pieces = [
    { seq: 12, cseq: 1, text: "That's" },
    { seq: 10, cseq: 2, text: " okay," },
    { seq: 14, cseq: 3, text: " this kind of problem" },
    { seq: 11, cseq: 4, text: " can be" },
    { seq: 13, cseq: 5, text: " tricky." },
  ];
  const events: TimelineEvent[] = pieces.map((p) => ({ seq: p.seq, cseq: p.cseq, offsetMs: 5000, kind: "transcript.entry", actor: "tutor", payload: { role: "tutor", text: p.text, spaced: true } }));
  assert.deepEqual(mergeUtterances(events).map((u) => u.text), ["That's okay, this kind of problem can be tricky."]);
  // Older events without cseq fall back to seq; time always comes first.
  assert.ok(compareEvents({ offsetMs: 1, seq: 9 }, { offsetMs: 2, seq: 1 }) < 0);
  assert.ok(compareEvents({ offsetMs: 1, seq: 2, cseq: null }, { offsetMs: 1, seq: 1, cseq: 5 }) > 0);
  assert.ok(compareEvents({ offsetMs: 1, seq: 2, cseq: 1 }, { offsetMs: 1, seq: 1, cseq: 5 }) < 0);
});

test("spaced fragments join exactly; old trimmed ones get spaces", () => {
  const spaced = (at: number, text: string): TimelineEvent => ev(at, "transcript.entry", "tutor", { role: "tutor", text, spaced: true });
  assert.deepEqual(mergeUtterances([spaced(0, "Tri"), spaced(10, "cky"), spaced(20, " one.")]).map((u) => u.text), ["Tricky one."]);
  assert.deepEqual(mergeUtterances([said(0, "tutor", "Tricky"), said(10, "tutor", "one"), said(20, "tutor", ".")]).map((u) => u.text), ["Tricky one."]);
});

test("payloads stay small", () => {
  const out = clampPayload({ text: "x".repeat(5000), list: Array.from({ length: 250 }, (_, i) => i), gone: undefined }) as Record<string, unknown>;
  assert.match(String(out.text), /1000 more characters/);
  assert.equal((out.list as unknown[]).length, 201);
  assert.equal("gone" in out, false);
});

test("clock times read like a stopwatch", () => {
  assert.equal(formatClock(65_300), "1:05.3");
  assert.equal(formatClock(59_999), "0:59.9");
  assert.equal(formatClock(3_723_400), "1:02:03.4");
  assert.equal(lastIndexAtOrBefore([{ offsetMs: 0 }, { offsetMs: 10 }, { offsetMs: 20 }], 15), 1);
  assert.equal(lastIndexAtOrBefore([{ offsetMs: 5 }], 1), -1);
});

test("transcript fragments become utterances", () => {
  const u = mergeUtterances([said(0, "student", "what is"), said(600, "student", "a half?"), said(2500, "tutor", "Great"), said(3000, "tutor", ", let's look."), said(9000, "student", "ok")]);
  assert.deepEqual(u.map((x) => [x.role, x.text, x.startMs, x.endMs]), [
    ["student", "what is a half?", 0, 600],
    ["tutor", "Great, let's look.", 2500, 3000],
    ["student", "ok", 9000, 9000],
  ]);
  assert.deepEqual(speakingIntervals([ev(100, "tutor.speaking", "tutor", { speaking: true }), ev(900, "tutor.speaking", "tutor", { speaking: false })]), [{ startMs: 100, endMs: 900 }]);
});

test("the analysis finds failed tools, interruptions, reconnects, reply times and silence", () => {
  const events = [
    said(0, "student", "help me with slope"),
    said(1000, "student", "please"),
    ev(2500, "tutor.speaking", "tutor", { speaking: true }),
    ev(6000, "tutor.speaking", "tutor", { speaking: false }),
    debug(3000, "tool", "tool_response_sent", { name: "add_function_graph", success: true, message: "Graphed", durationMs: 12 }),
    debug(4000, "tool", "tool_response_sent", { name: "highlight", success: false, error: "Nothing matches b9" }),
    ev(4000, "tool.call", "tutor", { name: "highlight", success: false, error: "Nothing matches b9" }),
    debug(5000, "turn", "interrupted"),
    debug(7000, "connection", "live_session_reconnecting", { attempt: 1 }),
    said(40_000, "student", "hello?"),
  ];
  const a = analyzeSession(events, 45_000);
  assert.equal(a.toolCalls, 2, "tool.call is not double counted when the live client reports tools");
  assert.equal(a.toolErrors, 1);
  assert.equal(a.interruptions, 1);
  assert.equal(a.reconnects, 1);
  assert.equal(a.medianReplyMs, 1500);
  assert.ok(a.longestSilenceMs >= 30_000, String(a.longestSilenceMs));
  assert.ok(a.flags.some((f) => f.tone === "error" && f.label.includes("highlight failed")));
  assert.ok(a.flags.some((f) => f.label.includes("silence")));
});

test("the log merges speech, hides duplicates and low-level noise", () => {
  const events = [
    said(0, "student", "hi"),
    said(400, "student", "there"),
    debug(1000, "tool", "tool_call_received", { name: "draw_fraction" }),
    debug(1100, "tool", "tool_response_sent", { name: "draw_fraction", success: true, message: "Drew 1/2", args: { fraction: "1/2" } }),
    ev(1100, "tool.call", "tutor", { name: "draw_fraction", success: true }),
    ev(2000, "board.frame", "system", { frameId: 7, reason: "sent to tutor", sentToTutor: true }),
    debug(2100, "connection", "websocket_open"),
  ];
  const log = buildLog(events);
  const shown = log.filter((e) => !e.hidden);
  assert.deepEqual(shown.map((e) => [e.lane, e.title]), [
    ["student", "hi there"],
    ["action", "draw_fraction"],
    ["board", "Board picture"],
  ]);
  assert.match(shown[1].detail ?? "", /args \{"fraction":"1\/2"\}\n→ Drew 1\/2/);
  assert.equal(shown[2].detail, "sent to tutor");
  const md = buildMarkdownExport({ sessionId: "s1", title: "Halves", studentName: "Ana", studentEmail: "ana@example.com", startedAt: 0, durationSec: 10, events, frameUrl: (id) => `https://x/frames/${id}` });
  assert.match(md, /\[0:00\.0\] STUDENT: hi there/);
  assert.match(md, /picture: https:\/\/x\/frames\/7/);
  assert.match(md, /Tool calls: 1 \(failed: 0\)/);
});

test("turn summaries, underruns and quiet events read as log lines and issues", () => {
  const T0 = 1_790_300_000_000;
  const summary = (offsetMs: number, extra: Record<string, unknown>) =>
    debug(offsetMs, "turn", "turn_summary", { n: 1, model: "m", trigger: "voice", inputAt: T0, endAt: T0 + offsetMs, firstAudioMs: 900, toolsBeforeAudio: 0, tools: [], audioMs: 2000, words: 12, questions: 1, text: "A line.", arrivalGaps: 0, maxArrivalGapMs: 0, repeat: false, silent: false, interrupted: false, usage: null, costUsd: null, ...extra });
  const events = [
    said(0, "student", "what is a half"),
    summary(3000, { n: 1 }),
    summary(9000, { n: 2, repeat: true }),
    summary(15_000, { n: 3, trigger: "text", silent: true, audioMs: 0, firstAudioMs: null }),
    debug(16_000, "audio", "audio_underrun", { gapMs: 412.6, turn: 3 }),
    debug(30_000, "silence", "quiet_checkin_skipped", { sinceMs: 14_000, reason: "the student is typing" }),
    debug(31_000, "turn", "voice_activity", { type: "ACTIVITY_START" }),
  ];
  const log = buildLog(events);
  const shown = log.filter((e) => !e.hidden).map((e) => [e.title, e.tone, e.issue]);
  assert.deepEqual(shown, [
    ["what is a half", "default", false],
    ["Turn 2: said a sentence twice", "warn", true],
    ["Turn 3: no audio after the student typed", "warn", true],
    ["Voice ran dry for 413 ms", "warn", true],
    ["Quiet: check-in skipped after 14.0 s of quiet", "default", false],
  ]);
  const hidden = log.filter((e) => e.hidden).map((e) => e.title);
  assert.ok(hidden.includes("Turn 1"), "a turn with nothing wrong is there under Every event");
  assert.ok(hidden.includes("Voice activity: ACTIVITY_START"));
  assert.equal(log.find((e) => e.title.startsWith("Quiet"))?.detail, "the student is typing");

  const flags = analyzeSession(events, 40_000).flags.map((f) => f.label);
  assert.ok(flags.includes("Turn 2: said a sentence twice"));
  assert.ok(flags.includes("Turn 3: no audio after the student typed"));
  assert.ok(flags.includes("Voice ran dry for 413 ms"));
});

test("the Markdown export carries the scorecard", () => {
  const events = [said(0, "student", "hi"), said(1500, "tutor", "Hello. What are we working on?"), said(6000, "student", "fractions")];
  const md = buildMarkdownExport({ sessionId: "s2", title: "Hi", studentName: null, studentEmail: null, startedAt: 0, durationSec: 8, events, frameUrl: (id) => `f/${id}` });
  const at = (heading: string) => md.indexOf(heading);
  assert.ok(at("## Summary") < at("## Scorecard") && at("## Scorecard") < at("## Issues"), "the scorecard sits between the summary and the issues");
  assert.match(md, /- Talk ratio, tutor : student: 3 : 1 \(6 and 2 words\)/);
  assert.match(md, /- Tools before speech, mean \/ max: not recorded/);
});

test("what the tutor answers: the opening, typed sends, files, events and speech, never the intake or a typed line's copy", () => {
  const events = [
    ev(0, "transcript.entry", "student", { role: "student", text: "I need help with: ratios", id: "intake_1" }),
    debug(900, "session", "opening_turn_sent", { sent: true, mode: "new" }),
    debug(5000, "text", "student_text_sent", { text: "ok", success: true }),
    ev(5000, "transcript.entry", "student", { role: "student", text: "ok", id: "text_5000" }),
    debug(6000, "text", "student_text_sent", { text: "lost", success: false }),
    said(9000, "student", "so is it"),
    said(9400, "student", "three"),
    debug(12_000, "file", "files_sent_to_tutor", { success: true, count: 1 }),
    debug(20_000, "explore", "report", { text: "moved m" }),
    debug(30_000, "silence", "quiet_checkin", { sinceMs: 45_000, sent: true }),
    debug(31_000, "silence", "quiet_checkin", { sinceMs: 46_000, sent: false }),
    debug(40_000, "session", "opening_turn_sent", { sent: true, mode: "resume" }),
  ];
  assert.deepEqual(studentInputs(events), [
    { atMs: 900, trigger: "opening" },
    { atMs: 5000, trigger: "text" },
    { atMs: 9000, trigger: "voice" },
    { atMs: 9400, trigger: "voice" },
    { atMs: 12_000, trigger: "files" },
    { atMs: 20_000, trigger: "event" },
    { atMs: 30_000, trigger: "event", checkin: true },
    { atMs: 40_000, trigger: "resume" },
  ]);
  // A pause, and a reload recorded with no pause before it, are both breaks.
  assert.deepEqual(breakIntervals([ev(100, "session.paused", "system"), ev(900, "session.resumed", "system"), ev(5000, "session.started", "system", { resumed: true }), ev(6000, "session.paused", "system")]), [
    { startMs: 100, endMs: 900 },
    { startMs: 5000, endMs: 5000 },
    { startMs: 6000, endMs: Infinity },
  ]);
});

test("approximate reply times run to the tutor's voice, never to a tool", () => {
  const events = [
    said(0, "student", "what is 3/4 of 12"),
    debug(1000, "tool", "tool_response_sent", { name: "record_teaching_move", success: true }),
    debug(3000, "tool", "tool_response_sent", { name: "check_answer", success: true, message: "Verdict: correct." }),
    ev(7000, "tutor.speaking", "tutor", { speaking: true }),
    ev(9000, "tutor.speaking", "tutor", { speaking: false }),
    // Typed while the tutor was talking: no clean reply to time.
    ev(12_000, "tutor.speaking", "tutor", { speaking: true }),
    debug(13_000, "text", "student_text_sent", { text: "wait", success: true }),
    ev(14_000, "tutor.speaking", "tutor", { speaking: false }),
    ev(15_000, "tutor.speaking", "tutor", { speaking: true }),
    ev(16_000, "tutor.speaking", "tutor", { speaking: false }),
    // Paused before the tutor answered.
    said(20_000, "student", "hold on"),
    ev(21_000, "session.paused", "system"),
    ev(30_000, "session.resumed", "system"),
    ev(31_000, "tutor.speaking", "tutor", { speaking: true }),
    ev(32_000, "tutor.speaking", "tutor", { speaking: false }),
  ];
  assert.deepEqual(voiceReplyTimes(events), [{ atMs: 0, waitMs: 7000, trigger: "voice", via: "voice" }]);
  const a = analyzeSession(events, 40_000);
  assert.equal(a.medianReplyMs, 7000);
  assert.ok(a.flags.some((f) => f.label === "Slow reply: 7.0 s from the student's input to the tutor's voice"));
  // A recording with no voice events falls back to the tutor's first transcribed words.
  assert.deepEqual(voiceReplyTimes([said(0, "student", "hi"), said(1800, "tutor", "Hello!")]), [{ atMs: 0, waitMs: 1800, trigger: "voice", via: "words" }]);
});

test("with turn summaries, a slow first audio is an issue and the reply time is the measured one", () => {
  const T0 = 1_790_300_000_000;
  const events = [
    said(10_000, "student", "what is 3/4 of 12"),
    debug(11_000, "tool", "tool_response_sent", { name: "record_teaching_move", success: true, message: "ok" }),
    debug(13_000, "tool", "tool_response_sent", { name: "start_problem", success: true, message: "ok" }),
    debug(16_000, "tool", "tool_response_sent", { name: "draw_fraction", success: true, message: "ok" }),
    ev(18_500, "tutor.speaking", "tutor", { speaking: true }),
    said(18_500, "tutor", "Look at the picture."),
    ev(21_000, "tutor.speaking", "tutor", { speaking: false }),
    debug(22_500, "turn", "turn_summary", { n: 2, model: "m", trigger: "voice", inputAt: T0 + 10_000, endAt: T0 + 21_000, firstToolMs: 1000, firstAudioMs: 8500, toolsBeforeAudio: 3, tools: ["record_teaching_move", "start_problem", "draw_fraction"], audioMs: 2500, words: 4, questions: 0, text: "Look at the picture.", arrivalGaps: 0, maxArrivalGapMs: 0, repeat: false, silent: false, interrupted: false, endedBy: "turn_complete", usage: null, usageMessages: 0, costUsd: null }),
  ];
  const a = analyzeSession(events, 30_000);
  assert.equal(a.medianReplyMs, 8500);
  assert.equal(a.slowestReplyMs, 8500);
  assert.deepEqual(a.flags.map((f) => f.label), ["Turn 2: first audio after 8.5 s"]);
  const md = buildMarkdownExport({ sessionId: "s3", title: "Slow", studentName: null, studentEmail: null, startedAt: 0, durationSec: 30, events, frameUrl: (id) => `f/${id}` });
  assert.match(md, /## Issues\n\n- \[0:22\.5\] Turn 2: first audio after 8\.5 s/);
  assert.match(md, /- First audio, p50 \/ p90: 8\.5 s \/ 8\.5 s \(over 1 reply\)/);
  assert.doesNotMatch(md, /Reply time:|Interruptions:/, "one latency and one interruption count, in the scorecard");
});
