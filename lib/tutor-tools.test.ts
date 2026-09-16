import { test } from "node:test";
import assert from "node:assert/strict";
import { TUTOR_FUNCTION_TOOLS, TUTOR_TOOL_DECLARATIONS, TUTOR_TOOL_NAMES, runTutorTool } from "./tutor-tools";
import { WHITEBOARD_TOOL_DECLARATIONS } from "./whiteboard-tools";
import { buildBackendInstructions, buildGeminiInstructions } from "./tutor-prompts";
import { createPolicy } from "./tutor-policy";

test("tutor tools do not collide with whiteboard tools and convert for Responses", () => {
  const board = new Set(WHITEBOARD_TOOL_DECLARATIONS.map((d) => d.name));
  for (const name of TUTOR_TOOL_NAMES) assert.ok(!board.has(name), `${name} collides with a whiteboard tool`);
  assert.equal(TUTOR_FUNCTION_TOOLS.length, TUTOR_TOOL_DECLARATIONS.length);
  assert.ok(TUTOR_FUNCTION_TOOLS.every((t) => t.type === "function" && t.strict === false));
});

test("check_answer returns a verdict and validates its arguments", () => {
  const p = createPolicy(0);
  const r = runTutorTool("check_answer", { problem: "1/2 + 1/3", student_answer: "2/5" }, p, 0);
  assert.ok(r && r.success);
  assert.match(r.message ?? "", /^Verdict: incorrect\./);
  const bad = runTutorTool("check_answer", { problem: 3 }, p, 0);
  assert.ok(bad && !bad.success);
});

test("record_attempt updates the policy and answers with the state line", () => {
  const p = createPolicy(0);
  const r = runTutorTool("record_attempt", { skill: "adding fractions", result: "misconception", help_level: "H1" }, p, 0);
  assert.ok(r && r.success);
  assert.match(r.message ?? "", /\[Tutor state: skill "adding fractions": 0 of 1 right/);
  assert.equal(p.attempts.length, 1);
  const bad = runTutorTool("record_attempt", { skill: "x", result: "wrong", help_level: "H9" }, p, 0);
  assert.ok(bad && !bad.success);
  assert.equal(runTutorTool("draw_fraction", {}, p, 0), null);
});

test("every tool named in the prompt examples is declared", () => {
  const declared = new Set([...WHITEBOARD_TOOL_DECLARATIONS.map((d) => d.name), ...TUTOR_TOOL_NAMES]);
  for (const text of [buildBackendInstructions(null, []), buildGeminiInstructions(null, [])]) {
    const lines = text.split("\n").filter((l) => l.startsWith("Tool calls:"));
    assert.ok(lines.length >= 8, `expected example tool-call lines, got ${lines.length}`);
    for (const line of lines) {
      for (const m of line.matchAll(/\b([a-z]+(?:_[a-z]+)+)\(/g)) assert.ok(declared.has(m[1]), `undeclared tool in an example: ${m[1]}`);
    }
  }
});
