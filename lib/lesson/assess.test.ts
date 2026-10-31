import { test } from "node:test";
import assert from "node:assert/strict";
import { statedFinal, verifySolution } from "./assess";

test("the value a student gives as the problem's answer", () => {
  assert.equal(statedFinal("I got 4 hours because 5 times 4 plus 3 is 24, which is under 23."), "4");
  assert.equal(statedFinal("so the answer is twelve"), "12");
  assert.equal(statedFinal("x = 5", "x"), "5");
  assert.equal(statedFinal("x is 5 I think", "x"), "5");
  // A reason's arithmetic is not their answer.
  assert.equal(statedFinal("because 5 times 4 plus 3 is 24"), null);
  assert.equal(statedFinal("can you draw the triangle"), null);
});

test("a solution is kept only when its arithmetic gives its answer", () => {
  assert.ok(verifySolution({ answer: "4", work: "(23-3)/5" }));
  assert.ok(verifySolution({ answer: "4 hours", work: "(23 − 3) ÷ 5" }));
  assert.ok(!verifySolution({ answer: "5", work: "(23-3)/5" }));
  assert.ok(!verifySolution({ answer: "4", work: "the most hours" }));
});

test("an expression equal to the answer, not yet worked out, is partly right", async () => {
  const { checkResponse } = await import("./assess");
  const q = { id: "q1", problemId: "P1", text: "What is one half plus one third?", kind: "value" as const, expects: "5/6", status: "open" as const, askedTurn: "t1" };
  assert.equal(checkResponse(q, "so is it 3/6 plus 2/6?").verdict, "partial");
  assert.equal(checkResponse(q, "5/6").verdict, "correct");
  assert.equal(checkResponse(q, "2/5").verdict, "incorrect");
});
