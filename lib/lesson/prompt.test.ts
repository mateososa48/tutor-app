import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedMoves } from "./prompt";
import { commitInput, createLesson, newProblem } from "./state";

// Session 8i9xr1 (Nov 2): they picked problem 1 and the tutor said its first
// step at once. Mateo: "it should first figure out what exactly the student needs".
const sheet = () => [newProblem("P1", "1. Solve: 3x + 7 = 22", { kind: "worksheet", file: "File 1", question: "1" }), newProblem("P2", "2. Solve: 5(x - 2) = 30", { kind: "worksheet", file: "File 1", question: "2" })];
const line = (text: string) => ({ id: "u1", source: "typed" as const, text, at: 0 });

test("a problem they just picked starts by finding out where they are", () => {
  for (const text of ["1", "can you help me with number 1?"]) {
    const { state, assessment } = commitInput(createLesson({ intake: "help with my sheet", problems: sheet(), current: "P1" }), line(text));
    const m = allowedMoves(state, assessment, text);
    assert.deepEqual(m.moves, ["diagnose", "clarify"], text);
    assert.match(m.note, /Do not explain/);
  }
});

test("teach me, a real question, or their own attempt skips straight to it", () => {
  for (const text of ["i dont know how to do this", "why do you subtract 7 first?", "i got x = 5"]) {
    const { state, assessment } = commitInput(createLesson({ intake: "help with my sheet", problems: sheet(), current: "P1" }), line(text));
    assert.notDeepEqual(allowedMoves(state, assessment, text).moves, ["diagnose", "clarify"], text);
  }
});
