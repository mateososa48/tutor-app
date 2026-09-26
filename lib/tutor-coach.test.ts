import { test } from "node:test";
import assert from "node:assert/strict";
import { coachNote, coachPrompt } from "./tutor-coach";

test("the coach's reply becomes one short note, or nothing", () => {
  assert.equal(coachNote("none"), null);
  assert.equal(coachNote("None."), null);
  assert.equal(coachNote(""), null);
  assert.equal(coachNote('"Ask how they got 15."'), "[Coach, not from the student: Ask how they got 15.]");
  const long = coachNote(Array.from({ length: 40 }, (_, i) => `w${i}`).join(" "));
  assert.ok(long && long.endsWith("…]") && long.split(" ").length <= 36);
});

test("the coach sees the last turns, the board and the state, and never the student's next line", () => {
  const turns = Array.from({ length: 10 }, (_, i) => ({ student: `s${i + 1}`, tutor: `t${i + 1}`, tools: i === 9 ? ["draw_grid"] : [] }));
  const p = coachPrompt({ grade: "5th grade", topic: "decimals", turns, board: "b1 grid", state: "[Tutor state: step PROBE]" });
  assert.match(p, /Turn 3\nStudent: s3/);
  assert.doesNotMatch(p, /Turn 2\n/);
  assert.match(p, /Tutor's board moves: draw_grid/);
  assert.match(p, /The board now: b1 grid/);
  assert.match(p, /The student has not answered yet/);
});
