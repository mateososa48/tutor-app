import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAnswer, formatNumber, prepareExpression, solveOneVariable } from "./answer-check";

const verdict = (problem: string, answer: string) => checkAnswer(problem, answer).verdict;

test("arithmetic and fractions", () => {
  assert.equal(verdict("1/2 + 1/3", "5/6"), "correct");
  const wrong = checkAnswer("1/2 + 1/3", "2/5");
  assert.equal(wrong.verdict, "incorrect");
  assert.match(wrong.message, /2\/5 \(0\.4\)/);
  assert.match(wrong.message, /For you only: 1\/2 \+ 1\/3 = 5\/6/);
  assert.equal(verdict("22 - 7", "16"), "incorrect");
  assert.equal(verdict("15/3", "5"), "correct");
  assert.equal(verdict("23 * 14", "322"), "correct");
  assert.equal(verdict("-3 - (-5)", "2"), "correct");
  assert.equal(verdict("−3 − (−5)", "2"), "correct");
  assert.equal(verdict("3 × 4 ÷ 6", "2"), "correct");
});

test("percent, of, mixed numbers, decimals, and LaTeX", () => {
  assert.equal(verdict("25% of 80", "20"), "correct");
  assert.equal(verdict("1/2 of 12", "6"), "correct");
  assert.equal(verdict("5/2", "2 1/2"), "correct");
  assert.equal(verdict("1 1/2 + 1/2", "2"), "correct");
  assert.equal(verdict("1/3", "0.33"), "correct");
  assert.equal(verdict("1/3", "0.34"), "incorrect");
  assert.equal(verdict("0.7 - 0.65", "0.05"), "correct");
  assert.equal(verdict("\\frac{3}{4} + \\frac{1}{4}", "1"), "correct");
  assert.equal(verdict("2^3 + \\sqrt{16}", "12"), "correct");
});

test("answers wrapped in speech", () => {
  assert.equal(verdict("2x + 3 = 11", "x is 4? I think"), "correct");
  assert.equal(verdict("1/2 + 1/3", "the answer is 5/6"), "correct");
  assert.equal(verdict("1/2 + 1/3", "um, 5/6?"), "correct");
});

test("equations: right, wrong, other letters, two solutions", () => {
  assert.equal(verdict("2x + 3 = 11", "4"), "correct");
  const wrong = checkAnswer("2x + 3 = 11", "x = 16");
  assert.equal(wrong.verdict, "incorrect");
  assert.match(wrong.message, /with x = 16, the left side 2x \+ 3 is 35 but the right side is 11\./);
  assert.match(wrong.message, /For you only: x = 4/);
  assert.equal(verdict("3y - 5 = 16", "7"), "correct");
  assert.equal(verdict("4(x - 2) = 20", "7"), "correct");
  assert.equal(verdict("5x + 2 = 3x + 10", "4"), "correct");
  assert.equal(verdict("x^2 = 9", "x = 3 or x = -3"), "correct");
  const half = checkAnswer("x^2 = 9", "3");
  assert.equal(half.verdict, "partial");
  assert.match(half.message, /2 solutions/);
  assert.equal(verdict("3x = 1", "0.33"), "correct");
  assert.equal(verdict("x^2 = 2", "1.41"), "partial");
});

test("expressions with a letter are checked for equivalence", () => {
  assert.equal(verdict("3(x + 4)", "3x + 12"), "correct");
  const wrong = checkAnswer("3(x + 4)", "3x + 4");
  assert.equal(wrong.verdict, "incorrect");
  assert.match(wrong.message, /With x = 2/);
  assert.equal(verdict("(x + 2)(x + 3)", "x^2 + 5x + 6"), "correct");
  assert.equal(verdict("4(2a - 3)", "8a - 12"), "correct");
});

test("never guesses: unreadable input can't be checked", () => {
  assert.equal(verdict("x > 2", "3"), "cannot_check");
  assert.equal(verdict("1/2 + 1/3", "a half"), "cannot_check");
  assert.equal(verdict("3 4 + 1", "35"), "cannot_check");
  assert.equal(verdict("2x + 3y = 11", "4"), "cannot_check");
  assert.equal(verdict("", "4"), "cannot_check");
  assert.match(checkAnswer("x > 2", "3").message, /Work it out yourself/);
});

test("helpers", () => {
  assert.equal(formatNumber(5 / 6), "5/6 (about 0.8333)");
  assert.equal(formatNumber(0.25), "1/4 (0.25)");
  assert.equal(formatNumber(-0.5), "-1/2 (-0.5)");
  assert.equal(formatNumber(7), "7");
  assert.deepEqual(solveOneVariable((x) => 2 * x - 8), [4]);
  assert.deepEqual(solveOneVariable((x) => x * x - 9), [-3, 3]);
  assert.equal(solveOneVariable(() => 0), null);
  const p = prepareExpression("2y(y + 1)");
  assert.ok(p.ok && p.text === "2*x*(x+1)" && p.variable === "y");
});
