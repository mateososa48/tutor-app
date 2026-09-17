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
  mergeUtterances,
  speakingIntervals,
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
