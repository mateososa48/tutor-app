import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOCKING_TOOLS, liveToolMode, resolveAsyncTools, resolveLiveVad, toolScheduling, withToolBehavior } from "./live-tool-behavior";
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
  for (const name of BLOCKING_TOOLS) assert.ok(names.has(name), `${name} is declared`);
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
  assert.equal(toolScheduling(m, "record_teaching_move", { success: true, message: "[Tutor state: …]" }, true), "WHEN_IDLE");
  assert.equal(toolScheduling(m, "ask", { success: false }, true), "WHEN_IDLE");
  assert.equal(toolScheduling(m, "draw_figure", { success: true, message: "Drew it. Careful: 6, 8 and 11 cannot make a right triangle." }, true), "WHEN_IDLE");
  assert.equal(toolScheduling(m, "check_answer", { success: true }, true), undefined);
  assert.equal(toolScheduling(m, "look_at_board", { success: true }, true), undefined);
  // Before the model has said anything this turn, a result is what makes it speak.
  assert.equal(toolScheduling(m, "write_step", { success: true, message: "Wrote it (item b3)." }, true, false), "WHEN_IDLE");
  assert.equal(toolScheduling(m, "write_step", { success: true, message: "Wrote it (item b3)." }, true, true), "SILENT");
  assert.equal(toolScheduling(m, "check_answer", { success: true }, true, false), undefined);
});

test("async tools are the default; ?tools=sync turns them off", () => {
  assert.equal(resolveAsyncTools(new URLSearchParams("tools=async")), true);
  assert.equal(resolveAsyncTools(new URLSearchParams("tools=blocking")), false);
  assert.equal(resolveAsyncTools(new URLSearchParams("tools=sync")), false);
  assert.equal(resolveAsyncTools(new URLSearchParams("")), true);
  assert.equal(resolveAsyncTools(null), true);
});

test("a changed state line comes back when the tutor is idle, and ?vad=patient is the only VAD knob", () => {
  const m = LIVE_MODELS["3.8"];
  assert.equal(toolScheduling(m, "draw_fraction", { success: true, message: "Drew it (b2). [Tutor state: step TOGETHER · next: …]" }, true), "WHEN_IDLE");
  assert.equal(toolScheduling(m, "draw_fraction", { success: true, message: "Drew it (b2)." }, true), "SILENT");
  assert.deepEqual(resolveLiveVad(new URLSearchParams("vad=patient")), { endOfSpeechSensitivity: "END_SENSITIVITY_LOW", silenceDurationMs: 1200 });
  assert.equal(resolveLiveVad(new URLSearchParams("")), undefined);
  assert.equal(resolveLiveVad(null), undefined);
});
