import { test } from "node:test";
import assert from "node:assert/strict";
import { addStep, describeWork, fillLine, plainMath, renderWork, splitLine, startWork, type WorkSpec } from "./board-work";

const ok = <T,>(r: T | { error: string }): T => {
  if (r && typeof r === "object" && "error" in r) throw new Error((r as { error: string }).error);
  return r as T;
};

test("a line splits at its relation and reads as plain math", () => {
  assert.deepEqual(splitLine("3x + 7 = 22"), ["3x + 7", "=", "22"]);
  assert.deepEqual(splitLine("x = 15/3"), ["x", "=", "15/3"]);
  assert.equal(plainMath("3x-7=-2"), "3x − 7 = −2");
  assert.equal(plainMath("2*3"), "2 × 3");
});

// Oct 26 2026, session 6banh2: "÷3" went under the first line beside "−7".
test("each move goes under the newest line, and its line under it", () => {
  let w: WorkSpec = startWork("3x + 7 = 22");
  w = ok(addStep(w, { left: "−7", right: "−7", note: "subtract 7", result: "3x = ?" })).spec;
  assert.equal(w.moves[0].after, "L1");
  // The next move cannot go under a line still waiting for the student.
  assert.match((addStep(w, { left: "÷3", right: "÷3", result: null }) as { error: string }).error, /still waiting/);
  w = ok(fillLine(w, "L2", "3x = 15")).spec;
  w = ok(addStep(w, { left: "÷3", right: "÷3", note: "divide by 3", result: "x = ?" })).spec;
  assert.equal(w.moves[1].after, "L2");
  assert.equal(describeWork(w), "L1 3x + 7 = 22; M1 −7 | −7 (subtract 7); L2 3x = 15 (theirs); M2 ÷3 | ÷3 (divide by 3); L3 x = ?");
});

test("the drawing lines up the relations and names every line, side and move", () => {
  let w: WorkSpec = startWork("3x + 7 = 22");
  w = ok(addStep(w, { left: "−7", right: "−7", note: "subtract 7", result: "3x = 15" })).spec;
  const out = renderWork(w, new Set(["M1", "L2"]));
  for (const id of ["L1", "L1.left", "L1.right", "M1", "M1.left", "M1.right", "M1.note", "L2"]) assert.ok(out.parts[id], id);
  // The two equals signs sit in one column: both right sides start at one x.
  assert.equal(out.parts["L1.right"].x, out.parts["L2.right"].x);
  // The move row is between the two lines.
  assert.ok(out.parts.M1.y >= out.parts.L1.y + out.parts.L1.h - 0.01 && out.parts.M1.y + out.parts.M1.h <= out.parts.L2.y + 0.01);
  assert.equal((out.svg.match(/data-fresh/g) ?? []).length, 2);
  assert.equal(out.aliases["3x=15"], "L2");
});
