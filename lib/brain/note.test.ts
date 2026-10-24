import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTurnNote, describeMove } from "./note";
import { brainToolDeclarations, brainToolNames } from "./tools";
import { anthropicTools, brainMessages } from "./haiku";
import { buildBrainInstructions } from "./prompt";

test("the note puts the verdict first and says when there is none", () => {
  const n = buildTurnNote({ check: "\"15\" → incorrect", state: "step PROBE", board: "b1 heading", reminders: [null, "Draw the cups."], leaving: false });
  assert.match(n, /^Checker: "15" → incorrect/);
  assert.match(n, /Reminders: Draw the cups\./);
  assert.match(buildTurnNote({ check: null, state: null, board: "", reminders: [] }), /^Checker: no answer.*\nBoard: empty\./);
  assert.match(buildTurnNote({ check: null, state: null, board: "", reminders: [], leaving: true }), /They're leaving/);
});

test("a board move is described by its words", () => {
  assert.equal(describeMove("draw_fraction", { fraction: "1/2", second_fraction: "2/4", model: "bar" }), "draw_fraction 1/2, 2/4");
  assert.equal(describeMove("point_at", {}), "point_at");
});

test("the brain's tools are the Live board set, illustrate and check_answer; check is not a board tool", () => {
  const names = brainToolDeclarations().map((d) => d.name);
  assert.ok(names.includes("illustrate") && names.includes("draw_fraction") && names.includes("start_new_problem"));
  assert.ok(names.includes("check_answer") && !names.includes("next_move") && !names.includes("look_at_board"));
  assert.ok(!brainToolNames().has("check_answer"));
  for (const t of anthropicTools(brainToolDeclarations())) assert.equal((t.input_schema as { type: string }).type, "object");
});

test("messages keep the opening, cache the last finished turn, and carry the note on the new line", () => {
  const turns = Array.from({ length: 14 }, (_, i) => ({ student: `s${i}`, tutor: `t${i}` }));
  const m = brainMessages(turns, "15?", "Checker: …", { keep: 6 });
  assert.equal((m[0].content.at(-1) as { text: string }).text, "s0");
  const last = m.at(-1)!;
  assert.equal(last.role, "user");
  assert.match((last.content.at(-1) as { text: string }).text, /^15\?\n\n\[Checker: …\]$/);
  const prev = m.at(-2)!;
  assert.deepEqual((prev.content.at(-1) as { cache_control?: unknown }).cache_control, { type: "ephemeral" });
  // Roles alternate, as the API requires.
  m.forEach((x, i) => assert.equal(x.role, i % 2 === 0 ? "user" : "assistant"));
});

test("the prompt names only tools the brain has", () => {
  const sys = buildBrainInstructions(null, [], { desmos: true });
  const names = new Set(brainToolDeclarations().map((d) => d.name));
  const named = [...sys.matchAll(/\b([a-z]+(?:_[a-z]+)+)\(/g)].map((x) => x[1]);
  for (const n of named) assert.ok(names.has(n), `prompt names ${n}`);
});
