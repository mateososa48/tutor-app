import { test } from "node:test";
import assert from "node:assert/strict";
import { assessClaims, evaluate, extractClaims, falseAssertions, mathForm } from "./math-claims";

const verdicts = (t: string) => assessClaims(t).map((c) => `${c.lhs} ${c.rel} ${c.rhs}: ${c.verdict}${c.correct ? ` (${c.correct})` : ""}`);

// Oct 26 2026, session 7wr9ea (T01): a right conclusion on two false claims.
test("the bike line has two claims, both false, each with its true fact", () => {
  const v = assessClaims("I got 4 hours because 5 times 4 plus 3 is 24, which is under 23. Is my reasoning right?");
  assert.equal(v.length, 2, JSON.stringify(v));
  assert.equal(v[0].verdict, "verified_false");
  assert.equal(v[0].correct, "5 × 4 + 3 = 23");
  assert.equal(v[1].rel, "<");
  assert.equal(v[1].verdict, "verified_false");
  assert.equal(v[1].correct, "24 > 23");
});

test("claims in symbols and words, true and false", () => {
  assert.deepEqual(verdicts("2 + 2 = 5"), ["2 + 2 = 5: verified_false (2 + 2 = 4)"]);
  assert.deepEqual(verdicts("six times seven is forty three"), ["6 * 7 = 43: verified_false (6 × 7 = 42)"]);
  assert.deepEqual(verdicts("$5 × 4 + $3 = $23"), ["5 * 4 + 3 = 23: verified_true"]);
  assert.deepEqual(verdicts("24 is more than 23"), ["24 > 23: verified_true"]);
  assert.deepEqual(verdicts("so 15 divided by 3 is 5"), ["15 / 3 = 5: verified_true"]);
  assert.deepEqual(verdicts("0.35 is bigger than 0.5"), ["0.35 > 0.5: verified_false (0.35 < 0.5)"]);
});

test("an answer is not a claim; a letter's value is not ours", () => {
  assert.deepEqual(extractClaims("it is 24"), []);
  assert.deepEqual(extractClaims("I got 4 hours"), []);
  assert.deepEqual(extractClaims("x is 4"), []);
  assert.deepEqual(extractClaims("3x + 7 = 22"), []);
});

test("the tutor may report or deny a false claim, never assert one", () => {
  assert.equal(falseAssertions("Five times four plus three is twenty-four, so that's over budget.").length, 1);
  assert.equal(falseAssertions("You said five times four plus three is twenty-four. Let's check that.").length, 0);
  assert.equal(falseAssertions("Five times four plus three isn't twenty-four, it's twenty-three.").length, 0);
  assert.equal(falseAssertions("Five times four plus three is twenty-three, and twenty-four is more than twenty-three.").length, 0);
});

test("the evaluator is exact on the four operations, powers and brackets", () => {
  assert.equal(evaluate("5 * 4 + 3"), 23);
  assert.equal(evaluate("(3 + 1) / 4"), 1);
  assert.equal(evaluate("2 ^ 3 * 2"), 16);
  assert.equal(evaluate("-3 * -2"), 6);
  assert.equal(evaluate("4 / 0"), null);
  assert.match(mathForm("five times four"), /5 \* 4/);
});

test("a number inside a letter's expression is not a claim about the number", () => {
  assert.deepEqual(falseAssertions("So b squared is negative three times negative three, which is positive nine."), []);
  assert.deepEqual(falseAssertions("So f of seven is seven plus three, which is ten."), []);
  assert.equal(falseAssertions("Two times three is five.").length, 1);
});
