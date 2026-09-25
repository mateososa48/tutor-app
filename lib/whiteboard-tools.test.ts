import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_CUT, WHITEBOARD_FUNCTION_TOOLS, WHITEBOARD_TOOL_DECLARATIONS, firstSentence, liveWhiteboardDeclarations } from "./whiteboard-tools";
import { liveToolDeclarations } from "./gemini-live";

test("every whiteboard tool converts to a valid Responses function tool", () => {
  assert.equal(WHITEBOARD_FUNCTION_TOOLS.length, WHITEBOARD_TOOL_DECLARATIONS.length);
  const names = new Set<string>();
  for (const tool of WHITEBOARD_FUNCTION_TOOLS) {
    assert.equal(tool.type, "function");
    assert.match(tool.name, /^[a-z_]+$/);
    assert.ok(!names.has(tool.name), `duplicate tool ${tool.name}`);
    names.add(tool.name);
    assert.ok(tool.description.length > 20, `${tool.name} needs a description`);
    assert.equal((tool.parameters as { type?: string }).type, "object");
    assert.equal(tool.strict, false);
  }
  assert.ok(names.has("remember_about_student"));
  assert.ok(names.has("draw_equation_step"));
});

test("the picture tools exist and require the arguments the renderer needs", () => {
  const byName = new Map(WHITEBOARD_FUNCTION_TOOLS.map((t) => [t.name, t]));
  const required = (name: string) => ((byName.get(name)!.parameters as { required?: string[] }).required ?? []).slice().sort();
  assert.deepEqual(required("draw_fraction"), ["fraction"]);
  assert.deepEqual(required("add_number_line"), ["max", "min"]);
  assert.deepEqual(required("draw_figure"), ["figure"]);
  assert.deepEqual(required("draw_angle"), ["degrees"]);
  assert.deepEqual(required("draw_array"), ["columns", "rows"]);
  assert.deepEqual(required("add_area_model"), ["cells", "column_labels", "row_labels", "title"]);
  assert.deepEqual(required("draw_balance"), ["left", "right"]);
  assert.deepEqual(required("draw_bar_chart"), ["categories", "values"]);
  assert.deepEqual(required("draw_sketch"), ["strokes"]);
  const line = (byName.get("add_number_line")!.parameters as { properties: Record<string, unknown> }).properties;
  assert.ok("step" in line && "intervals" in line && "jumps" in line, "number line grew step, intervals and jumps");
  assert.match(byName.get("add_text_note")!.description, /never use text to describe a picture/i);
  assert.match(byName.get("draw_fraction")!.description, /never describe a fraction picture in words/i);
});

test("dead board parameters are gone from the schema", () => {
  const section = WHITEBOARD_FUNCTION_TOOLS.find((t) => t.name === "start_board_section")!;
  const props = (section.parameters as { properties: Record<string, unknown> }).properties;
  assert.ok(!("fresh_page" in props), "fresh_page was removed with the page metaphor");
  // `place` replaced `column` (Sept 16 2026); the dispatcher still reads it from old recordings.
  for (const tool of WHITEBOARD_FUNCTION_TOOLS) {
    const toolProps = (tool.parameters as { properties?: Record<string, unknown> }).properties ?? {};
    assert.ok(!("column" in toolProps), `${tool.name} still offers column`);
  }
  const callout = WHITEBOARD_FUNCTION_TOOLS.find((t) => t.name === "add_callout")!;
  assert.ok(!("style" in (callout.parameters as { properties: Record<string, unknown> }).properties), "callouts are one sky tag");
  assert.doesNotMatch(JSON.stringify(WHITEBOARD_TOOL_DECLARATIONS), /new page/i);
});

test("off-topic tools are cut and the schema stays small", () => {
  const names = new Set(WHITEBOARD_TOOL_DECLARATIONS.map((d) => d.name));
  // Still replayed by the dispatcher for old recordings, but no longer offered.
  for (const cut of ["add_two_column_comparison", "add_vector_diagram", "add_process_map", "clear_whiteboard", "highlight_step", "add_coordinate_axes"]) {
    assert.ok(!names.has(cut), `${cut} should not be declared`);
  }
  // Every session sends the whole schema. Sept 16 2026: 43,513 characters for
  // 41 tools before the cut, 35,748 for 35 after. Sept 17: 38,815 for 37, with
  // draw_desmos and draw_data_plot (declared only where Desmos can load).
  const size = JSON.stringify(WHITEBOARD_TOOL_DECLARATIONS).length;
  // 39,400 since Sept 24 2026: set_plan, and start_new_problem taking the
  // problem and the first question, which saves a round trip on every problem.
  assert.ok(size < 39400, `whiteboard tool schema is ${size} characters`);
});

// The Live set (Sept 25 2026): what a gemini-3.8-live session is given.
test("the Live set leaves out the tools nobody calls, keeps the ones a lesson needs, and stays small", () => {
  const live = liveWhiteboardDeclarations();
  const names = new Set(live.map((d) => d.name));
  const full = new Set(WHITEBOARD_TOOL_DECLARATIONS.map((d) => d.name));
  for (const cut of LIVE_CUT) {
    assert.ok(!names.has(cut), `${cut} should not be declared to a Live session`);
    assert.ok(full.has(cut), `${cut} must stay in the full set for GPT-Live and replays`);
  }
  for (const keep of ["start_new_problem", "draw_equation_step", "add_student_attempt", "draw_fraction", "add_number_line", "draw_figure", "draw_balance", "add_area_model", "add_table", "draw_tape_diagram", "draw_grid", "draw_icons", "draw_sketch", "point_at", "highlight", "circle_item", "erase_items", "add_callout", "set_plan", "remember_about_student"]) {
    assert.ok(names.has(keep), `${keep} should be declared to a Live session`);
  }
  for (const d of live) {
    assert.ok(!("place" in (d.parameters.properties ?? {})), `${d.name} still offers place to a Live session`);
    assert.equal(d.description, firstSentence(d.description), `${d.name}: one sentence`);
    assert.ok(d.description.length > 15, `${d.name}: a description`);
  }
  const size = JSON.stringify(liveToolDeclarations()).length;
  // 42,381 characters for 40 tools before the diet.
  assert.ok(size < 22000, `Live tool set is ${size} characters`);
});

test("firstSentence keeps a sentence that carries an example in quotes", () => {
  assert.equal(firstSentence("Write ONE equation line in typeset math. Use it for every step."), "Write ONE equation line in typeset math.");
  assert.equal(firstSentence("A small sky tag ('Which side is heavier?'), a rule. More."), "A small sky tag ('Which side is heavier?'), a rule.");
  assert.equal(firstSentence("Draw a number line with labelled ticks."), "Draw a number line with labelled ticks.");
});
