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

test("dead board parameters are gone from the schema", () => {
  const section = WHITEBOARD_FUNCTION_TOOLS.find((t) => t.name === "start_board_section")!;
  const props = (section.parameters as { properties: Record<string, unknown> }).properties;
  assert.ok(!("fresh_page" in props), "fresh_page was removed with the page metaphor");
  const map = WHITEBOARD_FUNCTION_TOOLS.find((t) => t.name === "add_process_map")!;
  const connectors = (map.parameters as { properties: { connectors: { description: string } } }).properties.connectors;
  assert.match(connectors.description, /pipe-separated/i);
});
