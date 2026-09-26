import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAnswer, substituteFunctionEval, stripUnitWords, checkBlankInPage, formatNumber, prepareExpression, solveOneVariable, spokenToDigits } from "./answer-check";

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
  // "a half" used to be unreadable here; spoken numbers are read now (below).
  assert.equal(verdict("1/2 + 1/3", "a few"), "cannot_check");
  assert.equal(verdict("3 4 + 1", "35"), "cannot_check");
  assert.equal(verdict("2x + 3y = 11", "4"), "cannot_check");
  assert.equal(verdict("", "4"), "cannot_check");
  assert.match(checkAnswer("x > 2", "3").message, /work it out yourself/i);
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

test("a line with a box in it: the answer goes where the ? is", () => {
  assert.equal(checkAnswer("1/2 = ?/6", "3").verdict, "correct");
  assert.equal(checkAnswer("1/2 = ?/6", "3/6").verdict, "correct", "a fraction fills the whole ?/6");
  assert.equal(checkAnswer("\\frac{1}{2} = \\frac{?}{6}", "3").verdict, "correct");
  assert.equal(checkAnswer("3/4 = 6/?", "8").verdict, "correct");
  assert.equal(checkAnswer("? + 5 = 12", "7").verdict, "correct");
  assert.equal(checkAnswer("25\\% = ?/100", "25").verdict, "correct", "the board's LaTeX percent");
  const wrong = checkAnswer("1/2 = ?/6", "2");
  assert.equal(wrong.verdict, "incorrect");
  assert.match(wrong.message, /For you only: the box is 3\./);
  assert.equal(checkAnswer("3/6 + 2/6 = ?", "5/6").verdict, "correct", "a box at the end is the value of the rest");
});

test("a box beside the page's letter is checked against the page's equation", () => {
  // Alone, "x - 2 = ?" has no single value: it must not be judged (it once called a right 5 wrong).
  assert.equal(checkAnswer("x - 2 = ?", "5").verdict, "cannot_check");
  assert.equal(checkBlankInPage("4(x - 2) = 20", "x - 2 = ?", "5")?.verdict, "correct");
  assert.equal(checkBlankInPage("4(x - 2) = 20", "x - 2 = ?", "4")?.verdict, "incorrect");
  assert.equal(checkBlankInPage("3x + 7 = 25", "3x = ?", "18")?.verdict, "correct");
  assert.equal(checkBlankInPage("x^2 = 9", "x = ?", "3"), null, "two solutions: not this helper's call");
});

test("spoken numbers become digits, and only whole number phrases", () => {
  const cases: [string, string][] = [
    ["two", "2"], ["twelve", "12"], ["twenty five", "25"], ["twenty-five", "25"], ["negative four", "-4"], ["minus 3", "-3"],
    ["a half", "1/2"], ["one half", "1/2"], ["three quarters", "3/4"], ["three fourths", "3/4"], ["3 fourths", "3/4"],
    ["two and a half", "2 1/2"], ["zero point five", "0.5"], ["point five", "0.5"], ["five sixths", "5/6"],
    ["a hundred and five", "105"], ["one hundred twenty", "120"], ["fifty percent of forty", "50% of 40"],
    ["two thirds of twelve", "2/3 of 12"], ["half of ten", "1/2 of 10"], ["three over four", "3/4"], ["12 divided by 4", "12 / 4"],
  ];
  for (const [said, want] of cases) assert.equal(spokenToDigits(said), want, said);
  // Left alone: no number words, letters glued to digits, a lone "a", a run that isn't one number.
  for (const same of ["x is 4", "the answer is 5/6", "4(2a - 3)", "a + 3 = 7", "the third", "one2"]) assert.equal(spokenToDigits(same), same, same);
  assert.equal(spokenToDigits("two three"), "2 3", "two numbers in a row stay two numbers (and the checker refuses them)");
  assert.equal(spokenToDigits("two seconds"), "2 seconds", "second is never a denominator");
  assert.equal(spokenToDigits("the third", { the: true }), "1/3", "only an answer reads 'the third' as a third");
});

test("spoken answers are checked like written ones", () => {
  assert.equal(verdict("1/2 + 1/3", "five sixths"), "correct");
  assert.equal(verdict("1/2 + 1/3", "a half"), "incorrect");
  assert.equal(verdict("5/2", "two and a half"), "correct");
  assert.equal(verdict("2x + 3 = 11", "x equals four"), "correct");
  assert.equal(verdict("x + 9 = 5", "negative four"), "correct");
  assert.equal(verdict("x + 9 = 5", "minus 4"), "correct");
  assert.equal(verdict("x^2 = 9", "three and negative three"), "correct");
  assert.equal(verdict("20 + 5", "twenty five"), "correct");
  assert.equal(verdict("1/2", "zero point five"), "correct");
  assert.equal(verdict("3/4", "three quarters"), "correct");
  assert.equal(verdict("3/4", "three fourths"), "correct");
  assert.equal(verdict("2 + 3", "um, it's five I think"), "correct");
  assert.equal(verdict("2 + 3", "two three"), "cannot_check", "never guesses 23 or 5");
  assert.equal(verdict("1/2 + 1/3", "the answer is 5/6"), "correct");
});

test("spoken problems and question lead-ins", () => {
  assert.equal(verdict("What is a half of 40?", "20"), "correct");
  assert.equal(verdict("What is a half of 40?", "twenty"), "correct");
  assert.equal(verdict("one third of 12", "4"), "correct");
  assert.equal(verdict("What's 25% of 80?", "20"), "correct");
  assert.equal(verdict("fifty percent of forty", "20"), "correct");
  assert.equal(verdict("1/3 of 12?", "4"), "correct", "a trailing question mark is not a box");
  assert.equal(verdict("Find 2x + 3", "11"), "cannot_check", "a letter with no value: never judged");
  assert.equal(verdict("What is 3/6 + 2/6 = ?", "5/6"), "correct", "a box after = is still a box");
});

test("a typeset mixed number is a mixed number", () => {
  assert.equal(verdict("2\\frac{1}{2} + 1", "3 1/2"), "correct");
  assert.equal(verdict("\\frac{7}{2}", "3\\frac{1}{2}"), "correct");
  assert.equal(verdict("3 \\times \\frac{1}{2}", "1.5"), "correct", "an explicit times still multiplies");
});

test("pictures stay the tutor's call", () => {
  assert.equal(verdict("What fraction is shaded?", "1/2"), "cannot_check");
  assert.equal(verdict("What number is shown on the number line?", "3"), "cannot_check");
  assert.match(checkAnswer("What fraction is shaded?", "1/2").message, /about a picture/);
});

test("comparison questions: the value, spoken or written", () => {
  const bigger = "Which is bigger, 1/3 or 1/4?";
  for (const a of ["1/3", "one third", "a third", "the third", "third", "1/3 is bigger", "the third one", "2/6", "I think 1/3 because 3 is less than 4"]) {
    assert.equal(verdict(bigger, a), "correct", a);
  }
  for (const a of ["1/4", "a fourth", "one quarter", "the fourth"]) assert.equal(verdict(bigger, a), "incorrect", a);
  const wrong = checkAnswer(bigger, "a fourth");
  assert.match(wrong.message, /^Incorrect: the student picked 1\/4/);
  assert.match(wrong.message, /For you only: 1\/3 is bigger than 1\/4: 1\/3 is about 0\.3333, 1\/4 is 0\.25\. Don't say it/);
  assert.equal(checkAnswer(bigger, "1/3").message, "Correct: 1/3 is bigger than 1/4.");

  assert.equal(verdict("which is larger: 0.5 or 0.45", "0.5"), "correct");
  assert.equal(verdict("which is larger: 0.5 or 0.45", "zero point four five"), "incorrect");
  assert.equal(verdict("which is larger: 0.5 or 0.45", "point five"), "correct");
  assert.equal(verdict("Which is smaller, \\frac{2}{3} or \\frac{3}{5}?", "3/5"), "correct");
  assert.equal(verdict("Which is smaller, $\\frac{2}{3}$ or $\\frac{3}{5}$?", "three fifths"), "correct");
  assert.equal(verdict("Which is smaller, \\frac{2}{3} or \\frac{3}{5}?", "2/3"), "incorrect");
  assert.equal(verdict("Which is greater, -3 or -7?", "-3"), "correct");
  assert.equal(verdict("Which is greater, -3 or -7?", "negative three"), "correct");
  assert.equal(verdict("Which is greater, -3 or -7?", "minus seven"), "incorrect", "the classic negatives slip");
  assert.equal(verdict("Which is less: a third or a fourth?", "a fourth"), "correct");
  assert.equal(verdict("Which is less: a third or a fourth?", "a third"), "incorrect");
  assert.equal(verdict("Is 2/3 or 3/4 bigger?", "3/4"), "correct");
  assert.equal(verdict("Which is the biggest, 1/2, 1/3, or 1/4?", "1/2"), "correct");
  assert.match(checkAnswer("Which is the biggest, 1/2, 1/3, or 1/4?", "1/2").message, /1\/2 is the biggest of 1\/2, 1\/3 and 1\/4/);
});

test("comparison questions: positions, the other side, and equal choices", () => {
  const bigger = "Which is bigger, 1/3 or 1/4?";
  assert.equal(verdict(bigger, "the first one"), "correct");
  assert.equal(verdict(bigger, "first"), "correct");
  assert.equal(verdict(bigger, "the second one"), "incorrect");
  assert.equal(verdict(bigger, "the second"), "incorrect", "'the second' is a position, never a half");
  assert.equal(verdict(bigger, "the last one"), "incorrect");
  assert.equal(verdict(bigger, "1/4 is smaller"), "correct", "naming the other one the other way round");
  assert.equal(verdict(bigger, "1/3 is smaller"), "incorrect");
  // Never guessed.
  assert.equal(verdict(bigger, "the left one"), "cannot_check", "left and right depend on how it was written");
  assert.equal(verdict(bigger, "the right one"), "cannot_check");
  assert.equal(verdict(bigger, "two seconds"), "cannot_check", "seconds: a place, a fraction, or time");
  assert.equal(verdict(bigger, "1/2"), "cannot_check", "not one of the choices");
  assert.equal(verdict(bigger, "the bigger one"), "cannot_check");
  assert.equal(verdict("Which is the biggest, 1/2, 1/3, or 1/4?", "the third one"), "cannot_check", "with three choices 'third' could be a place");

  const same = "Which is bigger, 1/2 or 2/4?";
  for (const a of ["they're equal", "the same", "neither", "they're equivalent"]) assert.equal(verdict(same, a), "correct", a);
  const picked = checkAnswer(same, "1/2");
  assert.equal(picked.verdict, "incorrect");
  assert.match(picked.message, /For you only: 1\/2 and 2\/4 are equal, so none is bigger\./);
  assert.equal(verdict(bigger, "they're the same"), "incorrect");
  assert.match(checkAnswer(bigger, "neither").message, /For you only: 1\/3 is bigger than 1\/4/);
  assert.equal(verdict("Which is bigger, 1/2, 2/4 or 1/3?", "1/2"), "cannot_check", "a tie for the top: not guessed");
  assert.equal(verdict("Which is bigger, x or 3?", "3"), "cannot_check", "a choice that isn't a number");
});

test("how many Nths", () => {
  const q = "How many sixths is one third?";
  for (const a of ["2", "two", "2/6", "two sixths", "2 sixths"]) assert.equal(verdict(q, a), "correct", a);
  assert.equal(checkAnswer(q, "two").message, "Correct: 1/3 is 2 sixths (2/6).");
  const wrong = checkAnswer(q, "3");
  assert.equal(wrong.verdict, "incorrect");
  assert.match(wrong.message, /the student said 3 sixths, which is 1\/2 \(0\.5\), not 1\/3\. \(For you only: 1\/3 is 2 sixths\. Don't say it/);
  assert.equal(verdict("How many sixths are in 1/3?", "2"), "correct");
  assert.equal(verdict("How many sixths are in $\\frac{1}{3}$?", "2"), "correct");
  assert.equal(verdict("How many twelfths make 3/4?", "9"), "correct");
  assert.equal(verdict("How many twelfths make 3/4?", "nine twelfths"), "correct");
  assert.equal(verdict("How many twelfths make 3/4?", "8"), "incorrect");
  assert.equal(verdict("1/3 is how many sixths?", "two"), "correct");
  assert.equal(verdict("How many fourths in 2 wholes", "8"), "correct");
  assert.equal(verdict("How many fourths make one whole?", "four"), "correct");
  assert.equal(verdict("How many halves are in 3?", "6"), "correct");
  assert.equal(verdict("How many sixths is one fourth?", "one and a half"), "correct", "not every count is whole");
  const same = checkAnswer(q, "4/12");
  assert.equal(same.verdict, "partial", "the right amount, not in sixths");
  assert.match(same.message, /not counted in sixths/);
  assert.equal(verdict(q, "3/6"), "incorrect");
  assert.equal(verdict("How many seconds are in a minute?", "60"), "cannot_check");
  assert.equal(verdict(q, "a few"), "cannot_check");
  assert.equal(verdict("How many apples are in 3 bags?", "12"), "cannot_check");
});

// Function evaluation (Sept 25 2026): 3.8 wrote "f(3) where f(x) = 2x + 1" as
// the problem and got cannot_check; the value goes in for the variable now.
test("f(a) where f(x) = … is read by substitution", () => {
  assert.equal(substituteFunctionEval("f(3) where f(x) = 2x + 1"), "2(3) + 1");
  assert.equal(substituteFunctionEval("g(-2) if g(x) = x^2 + 3"), "(-2)^2 + 3");
  assert.equal(substituteFunctionEval("f(x) = 3x - 5, f(4)"), "3(4) - 5");
  assert.equal(substituteFunctionEval("h(t) = 4t, find h(2)"), "4(2)");
  assert.equal(substituteFunctionEval("2x + 3 = 11"), null);
  assert.equal(checkAnswer("f(3) where f(x) = 2x + 1", "7").verdict, "correct");
  assert.equal(checkAnswer("f(x) = 3x - 5, f(4)", "7").verdict, "correct");
  assert.equal(checkAnswer("f(x) = 3x - 5, f(4)", "12").verdict, "incorrect");
  assert.equal(checkAnswer("g(-2) if g(x) = x^2 + 3", "7").verdict, "correct");
});

test("cannot_check is an order to resend in digits and symbols", () => {
  const r = checkAnswer("How many cookies from 5 cups?", "30");
  assert.equal(r.verdict, "cannot_check");
  assert.match(r.message, /Call check_answer again with the problem in digits and symbols/);
});

// Sept 25 2026: 3.8 passed its own comparison as the problem ("0.5 > 0.35")
// and left unit words in ("5 cups * 6 cookies"); both were cannot_check.
test("a comparison as the problem: the bigger number, or yes and no", () => {
  assert.equal(checkAnswer("0.5 > 0.35", "0.5").verdict, "correct");
  assert.equal(checkAnswer("0.5 > 0.35", "0.35").verdict, "incorrect");
  assert.equal(checkAnswer("0.5 > 0.35", "yes").verdict, "correct");
  assert.equal(checkAnswer("0.35 > 0.5", "yes").verdict, "incorrect");
  assert.equal(checkAnswer("0.35 > 0.5", "no").verdict, "correct");
  assert.equal(checkAnswer("0.2 < 0.15", "0.15").verdict, "correct");
  assert.equal(checkAnswer("1/2 > 1/3", "1/2").verdict, "correct");
  assert.equal(checkAnswer("x > 2", "3").verdict, "cannot_check");
  // "0.35 vs 0.5" with the comparative in the answer.
  assert.equal(checkAnswer("0.35 vs 0.5", "0.35 is bigger because 35 is more than 5").verdict, "incorrect");
  assert.equal(checkAnswer("0.35 vs 0.5", "0.5 is bigger").verdict, "correct");
  assert.equal(checkAnswer("0.35 or 0.5", "0.35 is smaller").verdict, "correct");
  assert.equal(checkAnswer("0.35 vs 0.5", "0.35").verdict, "cannot_check");
});

test("unit words after numbers go when the rest is arithmetic", () => {
  assert.equal(stripUnitWords("5 cups * 6 cookies"), "5 * 6");
  assert.equal(stripUnitWords("25% of 80"), "25% of 80");
  assert.equal(stripUnitWords("2 pi * 3"), "2 pi * 3");
  assert.equal(stripUnitWords("12 cookies / 2 cups"), "12 / 2");
  assert.equal(stripUnitWords("2 cups makes 12 cookies"), "2 cups makes 12 cookies");
  assert.equal(checkAnswer("5 cups * 6 cookies", "30").verdict, "correct");
  assert.equal(checkAnswer("12 cookies / 2 cups", "6").verdict, "correct");
});

// Sept 25 2026, from Maya's Phase 4 session: the auto-check could not read the
// board's typeset line or a kid's "oh so 0.5 is bigger cause its 50 cents".
test("a comparison copied off the board, with the kid's whole sentence", () => {
  assert.equal(checkAnswer("0.35 \\text{ vs } 0.5", "oh so 0.5 is bigger cause its 50 cents").verdict, "correct");
  assert.equal(checkAnswer("0.35 vs 0.5", "0.35 is bigger cuz 35 is more than 5").verdict, "incorrect");
  assert.equal(checkAnswer("Which is bigger: 0.35 or 0.5?", "oh so 0.5 is bigger cause its 50 cents").verdict, "correct");
  assert.equal(checkAnswer("Which is bigger: 0.35 or 0.5?", "wait 0.35").verdict, "incorrect");
  assert.equal(checkAnswer("Which is bigger: 0.35 or 0.5?", "oh 0.35 and 0.5 are both").verdict, "cannot_check", "both named: no guess");
});

test("spoken powers and roots", () => {
  assert.equal(checkAnswer("What is negative three squared?", "9").verdict, "correct");
  assert.equal(checkAnswer("What is negative three squared?", "-9").verdict, "incorrect");
  assert.equal(checkAnswer("what's the square root of sixteen?", "4").verdict, "correct");
  assert.equal(checkAnswer("two cubed", "8").verdict, "correct");
});

test("a function applied to a number with no rule is not read as a product", () => {
  const r = checkAnswer("f(3)", "7");
  assert.equal(r.verdict, "cannot_check");
  assert.match(r.message, /needs the rule f follows/);
  assert.equal(checkAnswer("2(3)+1", "7").verdict, "correct", "digits before the bracket are a product");
  assert.equal(checkAnswer("f(3) where f(x) = x + 2", "5").verdict, "correct");
});
