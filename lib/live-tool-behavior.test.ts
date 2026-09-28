import { test } from "node:test";
import assert from "node:assert/strict";
import { NEXT_MOVE_DECLARATION } from "./tutor-planner";
import { BLOCKING_TOOLS, ReplyGate, ResponseHold, liveToolMode, resolveAsyncTools, resolveLiveVad, toolScheduling, withToolBehavior, verdictContradicts, finishReplyNote} from "./live-tool-behavior";
import { WHITEBOARD_TOOL_DECLARATIONS } from "./whiteboard-tools";
import { TUTOR_TOOL_DECLARATIONS } from "./tutor-tools";
import { SESSION_TOOL_DECLARATIONS } from "./session-tools";
import { LIVE_MODELS } from "./gemini-live";

const ALL = [...WHITEBOARD_TOOL_DECLARATIONS, ...TUTOR_TOOL_DECLARATIONS, ...SESSION_TOOL_DECLARATIONS];

test("which models get per-tool behaviour", () => {
  assert.equal(liveToolMode(LIVE_MODELS["3.1"]), "legacy");
  assert.equal(liveToolMode("gemini-2.5-flash-native-audio"), "legacy");
  assert.equal(liveToolMode(LIVE_MODELS["3.8"]), "scheduled");
  assert.equal(liveToolMode(LIVE_MODELS["3.8-thinking"]), "async-only");
  assert.equal(liveToolMode("gemini-4.0-live"), "scheduled");
});

test("3.8 blocks on every tool by default (its own default is NON_BLOCKING)", () => {
  for (const d of withToolBehavior(ALL, LIVE_MODELS["3.8"])) assert.equal(d.behavior, "BLOCKING", d.name);
  assert.equal(toolScheduling(LIVE_MODELS["3.8"], "write_step", { success: true }), undefined);
});

test("with async tools on, 3.8 waits only for the tools whose result decides the words", () => {
  for (const d of withToolBehavior(ALL, LIVE_MODELS["3.8"], true)) {
    assert.equal(d.behavior, BLOCKING_TOOLS.has(d.name) ? "BLOCKING" : "NON_BLOCKING", d.name);
  }
  const names = new Set(ALL.map((d) => d.name));
  // next_move is declared only in sessions with the planner on (lib/tutor-planner).
  for (const name of BLOCKING_TOOLS) assert.ok(names.has(name) || name === NEXT_MOVE_DECLARATION.name, `${name} is declared`);
});

test("3.1 and the thinking model get their declarations untouched", () => {
  for (const model of [LIVE_MODELS["3.1"], LIVE_MODELS["3.8-thinking"]]) {
    for (const asyncTools of [false, true]) {
      assert.equal(withToolBehavior(ALL, model, asyncTools), ALL);
      assert.equal(toolScheduling(model, "write_step", { success: true }, asyncTools), undefined);
    }
  }
});

test("async results: one that worked is filed silently; a refusal or a warning is answered", () => {
  const m = LIVE_MODELS["3.8"];
  assert.equal(toolScheduling(m, "write_step", { success: true, message: "Wrote it (item b3)." }, true), "SILENT");
  assert.equal(toolScheduling(m, "point_at", { success: true }, true), "SILENT");
  assert.equal(toolScheduling(m, "record_teaching_move", { success: true, message: "[Tutor state: …]" }, true), "SILENT", "a changed state line is read next turn, not spoken over the reply");
  assert.equal(toolScheduling(m, "ask", { success: false }, true), "WHEN_IDLE");
  assert.equal(toolScheduling(m, "draw_figure", { success: true, message: "Drew it. Careful: 6, 8 and 11 cannot make a right triangle." }, true), "WHEN_IDLE");
  assert.equal(toolScheduling(m, "check_answer", { success: true }, true), undefined);
  assert.equal(toolScheduling(m, "look_at_board", { success: true }, true), undefined);
  // Before the model has said anything this turn, a result is what makes it speak.
  assert.equal(toolScheduling(m, "write_step", { success: true, message: "Wrote it (item b3)." }, true, false), "WHEN_IDLE");
  assert.equal(toolScheduling(m, "write_step", { success: true, message: "Wrote it (item b3)." }, true, true), "SILENT");
  assert.equal(toolScheduling(m, "check_answer", { success: true }, true, false), undefined);
});

test("a check made after the reply mutes the continuation, unless the verdict contradicts the reply", () => {
  const gives = (t: string) => /\?\s*$/.test(t.trim());
  const g = new ReplyGate();
  g.onCheckAfterReply("So which amount is bigger?", "Verdict: cannot_check. …", gives);
  assert.equal(g.muted, true, "the reply gave them a question; the continuation would be a second reply");
  const yes = new ReplyGate();
  yes.onCheckAfterReply("Yes, that's right! What's next?", "Verdict: incorrect. The student's 2/5 …", gives);
  assert.equal(yes.muted, false, "a yes to a wrong answer has to be taken back");
  const unfinished = new ReplyGate();
  unfinished.onCheckAfterReply("Let's look at that.", "Verdict: correct.", gives);
  assert.equal(unfinished.muted, false, "a reply that gave them nothing to do may go on");
  assert.equal(verdictContradicts("Hmm, not quite. Which is bigger?", "Verdict: correct."), true);
  assert.equal(verdictContradicts("How'd you get that?", "Verdict: incorrect."), false);
});

test("a result that wakes an unfinished reply says to add only the question", () => {
  assert.match(finishReplyNote(true, false, "WHEN_IDLE") ?? "", /Add only the one question or task now.*don't repeat/);
  assert.equal(finishReplyNote(true, true, "SILENT"), null);
  assert.equal(finishReplyNote(false, false, "WHEN_IDLE"), null, "before any speech the wake is the reply itself");
  assert.equal(finishReplyNote(true, false, "SILENT"), null, "only the batch's waking result carries it");
});

test("before the first sound, a batch of calls wakes the model once: only its last result", () => {
  const m = LIVE_MODELS["3.8"];
  const done = { success: true, message: "Drew it (item b2)." };
  assert.equal(toolScheduling(m, "draw_fraction", done, true, false, false), "SILENT");
  assert.equal(toolScheduling(m, "point_at", done, true, false, true), "WHEN_IDLE");
  assert.equal(toolScheduling(m, "point_at", done, true, true, false), "SILENT", "after the first sound nothing wakes it");
  assert.equal(toolScheduling(m, "draw_fraction", { success: false }, true, true, false), "WHEN_IDLE", "a refusal after speech still gets a (muted) chance to fix the drawing");
  // Mid-reply ("Let's test that." then a drawing): the reply has given them nothing to do yet, so the result wakes it to finish.
  assert.equal(toolScheduling(m, "draw_fraction", done, true, true, true, false), "WHEN_IDLE");
  assert.equal(toolScheduling(m, "draw_fraction", done, true, true, false, false), "SILENT", "one wake per batch");
  assert.equal(toolScheduling(m, "draw_fraction", done, true, true, true, true), "SILENT", "a finished reply is not woken");
});

test("async tools are the default; ?tools=sync turns them off", () => {
  assert.equal(resolveAsyncTools(new URLSearchParams("tools=async")), true);
  assert.equal(resolveAsyncTools(new URLSearchParams("tools=blocking")), false);
  assert.equal(resolveAsyncTools(new URLSearchParams("tools=sync")), false);
  assert.equal(resolveAsyncTools(new URLSearchParams("")), true);
  assert.equal(resolveAsyncTools(null), true);
});

test("a changed state line is filed once the tutor has spoken, and ?vad=patient is the only VAD knob", () => {
  const m = LIVE_MODELS["3.8"];
  assert.equal(toolScheduling(m, "draw_fraction", { success: true, message: "Drew it (b2). [Tutor state: step TOGETHER · next: …]" }, true), "SILENT");
  assert.equal(toolScheduling(m, "draw_fraction", { success: true, message: "Drew it (b2)." }, true), "SILENT");
  assert.deepEqual(resolveLiveVad(new URLSearchParams("vad=patient")), { endOfSpeechSensitivity: "END_SENSITIVITY_LOW", silenceDurationMs: 1200 });
  assert.equal(resolveLiveVad(new URLSearchParams("")), undefined);
  assert.equal(resolveLiveVad(null), undefined);
});

test("a result that beats the first sound is held: filed SILENT when the tutor talks, WHEN_IDLE once when it stays quiet", async () => {
  const m = LIVE_MODELS["3.8"];
  const sent: string[] = [];
  const hold = new ResponseHold((id, _n, _r, s) => sent.push(`${id}:${s}`), (name, result, spoken) => toolScheduling(m, name, result, true, spoken));
  assert.equal(hold.offer("a", "start_new_problem", { success: true }, false), true);
  assert.equal(hold.offer("c", "check_answer", { success: true }, false), false, "blocking tools are never held");
  hold.onAudio();
  assert.deepEqual(sent, ["a:SILENT"]);
  sent.length = 0;
  hold.offer("b", "draw_grid", { success: true }, false);
  hold.offer("d", "set_plan", { success: true }, false);
  hold.onTurnComplete(false);
  await new Promise((r) => setTimeout(r, ResponseHold.GRACE_MS + 50));
  assert.deepEqual(sent, ["b:SILENT", "d:WHEN_IDLE"], "a quiet turn wakes the tutor once");
  sent.length = 0;
  assert.equal(hold.offer("e", "draw_grid", { success: true }, true), false, "once it is talking nothing is held");
  hold.offer("f", "draw_grid", { success: false }, false);
  hold.onNewInput();
  assert.deepEqual(sent, ["f:WHEN_IDLE"], "a refusal still asks to be heard");
  hold.dispose();
});

test("a second reply to the same line is muted once a reply ended on a question or a task", () => {
  const task = (t: string) => /\?\s*$/.test(t) || /^(try|find)/i.test(t.trim().split(/(?<=[.!?])\s+/).at(-1) ?? "");
  const g = new ReplyGate();
  g.onTurnComplete(true, "Let's look at this.", task);
  assert.equal(g.muted, false, "no task yet: the real reply may follow");
  g.onTurnComplete(true, "Let's look at this. Do you have a sheet, or the idea?", task);
  assert.equal(g.muted, true);
  g.onNewInput();
  assert.equal(g.muted, false);
  g.onTurnComplete(false, "", task);
  assert.equal(g.muted, false, "a quiet turn end never mutes");
});

test("speech over a muted reply keeps it muted until the server cuts it off", () => {
  const task = (t: string) => /\?\s*$/.test(t);
  const g = new ReplyGate();
  g.onTurnComplete(true, "Is there a sheet, or the idea?", task);
  g.onNewInput(true);
  assert.equal(g.muted, true, "the old second reply is still arriving");
  g.onBoundary();
  assert.equal(g.muted, false, "cut off: the next reply is theirs");
  g.onTurnComplete(true, "Which is bigger?", task);
  g.onNewInput(false);
  assert.equal(g.muted, false, "nothing arriving: open at once");
});
