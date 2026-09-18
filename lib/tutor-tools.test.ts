import { test } from "node:test";
import assert from "node:assert/strict";
import { TUTOR_FUNCTION_TOOLS, TUTOR_TOOL_DECLARATIONS, TUTOR_TOOL_NAMES, attemptFromVerdict, runTutorTool } from "./tutor-tools";
import { SESSION_TOOL_NAMES } from "./session-tools";
import { WHITEBOARD_TOOL_DECLARATIONS } from "./whiteboard-tools";
import { buildBackendInstructions, buildGeminiInstructions } from "./tutor-prompts";
import { createPolicy } from "./tutor-policy";

test("tutor tools do not collide with whiteboard tools and convert for Responses", () => {
  const board = new Set(WHITEBOARD_TOOL_DECLARATIONS.map((d) => d.name));
  for (const name of TUTOR_TOOL_NAMES) assert.ok(!board.has(name), `${name} collides with a whiteboard tool`);
  assert.equal(TUTOR_FUNCTION_TOOLS.length, TUTOR_TOOL_DECLARATIONS.length);
  assert.ok(TUTOR_FUNCTION_TOOLS.every((t) => t.type === "function" && t.strict === false));
});

test("learning tools require an honest help level and a structured teaching move", () => {
  const check = TUTOR_TOOL_DECLARATIONS.find((tool) => tool.name === "check_answer");
  assert.ok(check);
  assert.ok(check.parameters.required.includes("help_level"));
  const move = TUTOR_TOOL_DECLARATIONS.find((tool) => tool.name === "record_teaching_move");
  assert.ok(move);
  assert.deepEqual(move.parameters.required, ["skill", "help_level", "move"]);
  assert.deepEqual(move.parameters.properties.help_level.enum, ["H0", "H1", "H2", "H3", "H4", "H5"]);
  const properties = move.parameters.properties as unknown as Record<string, { enum?: readonly string[] }>;
  assert.ok(properties.move?.enum?.includes("worked_example"));
  assert.ok(properties.strategy?.enum?.includes("counterexample"));
});

test("check_answer returns a verdict and validates its arguments", () => {
  const p = createPolicy(0);
  const r = runTutorTool("check_answer", { problem: "1/2 + 1/3", student_answer: "2/5" }, p, 0);
  assert.ok(r && r.success);
  assert.match(r.message ?? "", /^Verdict: incorrect\./);
  const bad = runTutorTool("check_answer", { problem: 3 }, p, 0);
  assert.ok(bad && !bad.success);
});

test("check_answer records the attempt and answers with the state line", () => {
  const p = createPolicy(0);
  const r = runTutorTool("check_answer", { problem: "1/2 + 1/3", student_answer: "2/5", skill: "adding fractions", help_level: "H1", kind: "misconception" }, p, 0, "call-1");
  assert.ok(r && r.success);
  assert.match(r.message ?? "", /\[Tutor state: skill "adding fractions": 0 of 1 right/);
  assert.deepEqual(p.attempts.map((a) => [a.result, a.help, a.callId]), [["misconception", 1, "call-1"]]);
  // A right answer asks for the ring, and for equations the check.
  const right = runTutorTool("check_answer", { problem: "2x + 3 = 11", student_answer: "x = 4", skill: "two-step equations" }, p, 0);
  assert.match(right && right.success ? right.message ?? "" : "", /Verdict: correct\..*circle_item.*keep=true.*putting the value back in/);
  // What the checker cannot judge counts neither way.
  const misses = p.missesInRow;
  runTutorTool("check_answer", { problem: "x + y = 5", student_answer: "3", skill: "two-step equations" }, p, 0);
  assert.equal(p.attempts.at(-1)?.result, "unchecked");
  assert.equal(p.missesInRow, misses);
  assert.equal(runTutorTool("record_attempt", { skill: "x", result: "correct", help_level: "H1" }, p, 0), null, "record_attempt is gone");
  assert.equal(runTutorTool("draw_fraction", {}, p, 0), null);
});

test("wrong answers keep the kind the tutor saw", () => {
  assert.equal(attemptFromVerdict("incorrect"), "incorrect");
  assert.equal(attemptFromVerdict("incorrect", "slip"), "slip");
  assert.equal(attemptFromVerdict("incorrect", "nonsense"), "incorrect");
  assert.equal(attemptFromVerdict("correct", "slip"), "correct");
  assert.equal(attemptFromVerdict("cannot_check"), "unchecked");
});

test("every tool named in the prompt examples is declared", () => {
  const declared = new Set([...WHITEBOARD_TOOL_DECLARATIONS.map((d) => d.name), ...TUTOR_TOOL_NAMES, ...SESSION_TOOL_NAMES]);
  for (const text of [buildBackendInstructions(null, []), buildGeminiInstructions(null, [])]) {
    const lines = text.split("\n").filter((l) => l.startsWith("Tool calls:"));
    assert.ok(lines.length >= 8, `expected example tool-call lines, got ${lines.length}`);
    for (const line of lines) {
      for (const m of line.matchAll(/\b([a-z]+(?:_[a-z]+)+)\(/g)) assert.ok(declared.has(m[1]), `undeclared tool in an example: ${m[1]}`);
    }
  }
});
