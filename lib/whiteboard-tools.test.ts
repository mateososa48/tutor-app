import { test } from "node:test";
import assert from "node:assert/strict";
import { WHITEBOARD_FUNCTION_TOOLS, WHITEBOARD_TOOL_DECLARATIONS } from "./whiteboard-tools";

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
  // 41 tools before the cut, 35,748 for 35 after.
  const size = JSON.stringify(WHITEBOARD_TOOL_DECLARATIONS).length;
  assert.ok(size < 39000, `whiteboard tool schema is ${size} characters`);
});
