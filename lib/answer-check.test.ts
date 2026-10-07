import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAnswer, verbTask, inlineFunctions, finalValue, substituteFunctionEval, stripUnitWords, checkBlankInPage, formatNumber, prepareExpression, solveOneVariable, spokenToDigits } from "./answer-check";

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
  assert.match(checkAnswer("x > 2", "3").message, /judge it yourself and reply now/i);
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
  assert.match(r.message, /Judge it yourself and reply now\. Call check_answer again only if it is arithmetic you can write in digits and symbols/);
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

test("a plus-or-minus problem is checked against both of its values", () => {
  assert.equal(checkAnswer("\\frac{3 \\pm 1}{4}", "1 and 1/2").verdict, "correct");
  assert.equal(checkAnswer("(3 ± 1)/4", "x = 1 or x = 0.5").verdict, "correct");
  assert.equal(checkAnswer("(3 ± 1)/4", "1").verdict, "partial");
  assert.equal(checkAnswer("(3 ± 1)/4", "2 and 1").verdict, "incorrect");
});

test("a comparison claim answered with a named value", () => {
  assert.equal(checkAnswer("0.5 > 0.35", "0.5 is bigger").verdict, "correct");
  assert.equal(checkAnswer("0.5 > 0.35", "0.35 is bigger").verdict, "incorrect");
});

test("kid decimals: point thirty five", () => {
  assert.equal(spokenToDigits("i put point thirty five"), "i put 0.35");
  assert.equal(spokenToDigits("point three five"), "0.35");
  assert.equal(checkAnswer("Which is bigger, 0.35 or 0.5?", "point five").verdict, "correct");
});

test("a question with words before its math", () => {
  assert.equal(checkAnswer("Now, for the second year, what's fifteen percent of seventeen thousand?", "2550").verdict, "correct");
  assert.equal(checkAnswer("For the second year, what's 15% of 17000?", "2500").verdict, "incorrect");
});

test("a tight fraction is one number: a half divided by a sixth is 3", () => {
  assert.equal(checkAnswer("1/2 / 1/6", "3").verdict, "correct");
  assert.equal(checkAnswer("1/2 ÷ 1/6", "3").verdict, "correct");
  assert.equal(checkAnswer("1/2 / 1/6", "1/12").verdict, "incorrect");
  assert.equal(checkAnswer("12 / 2/3", "18").verdict, "correct");
  assert.equal(checkAnswer("3/2^2", "3/4").verdict, "correct", "a power binds first");
  assert.equal(checkAnswer("2 1/2 + 1/2", "3").verdict, "correct", "mixed numbers still read");
  assert.equal(checkAnswer("6/2/3", "1").verdict, "correct", "a tight chain stays left to right");
  assert.equal(checkAnswer("12/2*5", "30").verdict, "correct");
});

test("minus a negative is subtraction of a negative, spoken or typed", () => {
  assert.equal(spokenToDigits("six minus negative two"), "6 - -2");
  assert.equal(checkAnswer("six minus negative two", "8").verdict, "correct");
  assert.equal(checkAnswer("what would six minus negative two equal?", "8").verdict, "correct");
  assert.equal(checkAnswer("negative seven plus negative five", "-12").verdict, "correct");
  assert.equal(checkAnswer("negative seven minus four", "-11").verdict, "correct");
});

test("a precedence slip in the problem never turns a right answer wrong", () => {
  const r = checkAnswer("3 + 1 / 4", "1");
  assert.equal(r.verdict, "cannot_check");
  assert.match(r.message, /call check_answer again with problem="\(3 \+ 1\) \/ 4"/);
  assert.equal(checkAnswer("3 + 1 / 4", "3.25").verdict, "correct");
  assert.equal(checkAnswer("(3 + 1) / 4", "1").verdict, "correct");
  assert.equal(checkAnswer("3 + 1 / 4", "2").verdict, "incorrect", "an answer wrong both ways stays wrong");
  assert.equal(checkAnswer("1/2 + 1/3", "0.5").verdict, "incorrect", "fractions on the left are not regrouped");
});

test("rules stated in the question are applied (spoken function questions)", () => {
  const v = (q: string, a: string) => checkAnswer(q, a).verdict;
  assert.equal(v("Now, solve this one on your own: if h(x) = 3x - 1, what's h(4)?", "so 3 times 4 is 12, minus 1 is 11? so h(4) is 11?"), "correct");
  assert.equal(v("if h(x) = 3x - 1, what's h(4)?", "12"), "incorrect");
  assert.equal(v("if f(x) = x + 5 and g(x) = 3x, what is f(2) + g(2)?", "f(2) is 2+5 which is 7. and g(2) is 3 times 2 which is 6. so 7 plus 6 is 13? is that right?"), "correct");
  assert.equal(v("if f(x) = x + 5 and g(x) = 3x, what is f(2) + g(2)?", "so it's 12?"), "incorrect");
  assert.equal(v("Try this one: if f(x) = x^2 and g(x) = x + 1, what is f(g(3))?", "ok so g(3) is 3+1 which is 4. then i put that into f, so 4 squared is 16. is it 16?"), "correct");
  assert.equal(v("if f(x) = x^2 and g(x) = x + 1, what is f(g(3))?", "10"), "incorrect");
  // An equation to solve is not a rule: left to the tutor.
  assert.equal(v("Now try this: if h(x) = 8, what was our input?", "3"), "cannot_check");
  assert.equal(inlineFunctions("if g(x) = 2x, what's g(3)?"), "(2(3))");
});

test("a worked answer is read by the value it ends on, only when the whole can't be", () => {
  assert.equal(checkAnswer("Now what is 9 minus 4 times 2 times 1?", "so it's 9 minus... 4 times 2 times 1? so 9 minus 8? which is 1?").verdict, "correct");
  assert.equal(checkAnswer("Now what is 9 minus 4 times 2 times 1?", "so 9 minus 8? which is 17?").verdict, "incorrect");
  assert.equal(finalValue("so 7 plus 6 is 13? is that right?"), "13");
  assert.equal(finalValue("13"), null);
  // Two roots stay two roots: the whole answer is read first.
  assert.equal(checkAnswer("2x^2 - 3x + 1 = 0", "x = 1 and x = 1/2").verdict, "correct");
});

test("which is bigger: the number named before 'is bigger', and spoken compare tasks", () => {
  assert.equal(checkAnswer("Which is bigger, zero point zero nine or zero point one?", "oh, that's 0.09 and 0.10. so 0.1 is bigger because 10 cents is more than 9 cents.").verdict, "correct");
  assert.equal(checkAnswer("Which is bigger, zero point zero nine or zero point one?", "oh, that's 0.09 and 0.10. so 0.09 is bigger").verdict, "incorrect");
  assert.equal(checkAnswer("Try comparing zero point zero five and zero point two.", "so that would be 0.05 and 0.20... so 0.2 is bigger because 20 cents is way more than 5 cents.").verdict, "correct");
  assert.equal(checkAnswer("Try comparing zero point zero five and zero point two.", "0.05 is bigger").verdict, "incorrect");
  assert.equal(checkAnswer("0.35 and 0.5", "0.35").verdict, "cannot_check");
});

test("choices named before 'which one is more'", () => {
  assert.equal(checkAnswer("Eighty cents versus seventy-five cents, which one is more?", "80 cents is definitely more").verdict, "correct");
  assert.equal(checkAnswer("Fifty cents versus thirty-five cents. Which amount is more money?", "35").verdict, "cannot_check");
  assert.equal(checkAnswer("0.8 or 0.75, which one is bigger?", "0.75").verdict, "incorrect");
});

test("a step said as a task: subtract A from B, add, multiply, divide", () => {
  assert.equal(checkAnswer("Subtract 1275 from eighty-five hundred to get the value after two years.", "7225").verdict, "correct");
  assert.equal(checkAnswer("Now take 1275 away from 8500.", "7275").verdict, "incorrect");
  assert.equal(checkAnswer("Multiply 6 by 5.", "30").verdict, "correct");
  assert.equal(checkAnswer("Divide 48 by 6 to find the cups.", "8").verdict, "correct");
  // A task with no numbers to use is left alone.
  assert.equal(verbTask("Subtract that from the total."), null);
});

test("a number said in pairs can confirm an answer, never refute one", () => {
  assert.equal(checkAnswer("What's fifteen percent of seventy-two twenty-five?", "1083.75").verdict, "correct");
  assert.equal(checkAnswer("What's fifteen percent of seventy-two twenty-five?", "10.8375").verdict, "cannot_check");
});

test("a confused question about another number is not 'they are equal'", () => {
  assert.equal(checkAnswer("Which is bigger, 0.2 or 0.125?", "wait, is 0.2 the same as 200 cents? i'm confused.").verdict, "cannot_check");
  assert.equal(checkAnswer("Which is bigger, 0.5 or 0.50?", "they're the same").verdict, "correct");
});

test("calculus steps are checked: antiderivatives by their derivative, derivatives by the problem's (Oct 6 2026)", () => {
  assert.equal(checkAnswer("\\int u^3 \\, du", "\\frac{u^4}{4}").verdict, "correct");
  assert.match(checkAnswer("\\int u^3 \\, du", "\\frac{u^4}{4}").message, /left off the \+ C/);
  assert.equal(checkAnswer("\\int u^3 \\, du", "u^4/4 + C").verdict, "correct");
  assert.equal(checkAnswer("\\int u^3 \\, du", "u^4").verdict, "incorrect", "off by a factor of 4");
  assert.equal(checkAnswer("\\int 2x(x^2 + 1)^3 \\, dx", "(x^2+1)^4/4 + C").verdict, "correct");
  // "x^2" may answer "what is u?": not called wrong, and no order to call again.
  const step = checkAnswer("\\int 2x(x^2 + 1)^3 \\, dx", "x^2");
  assert.equal(step.verdict, "cannot_check");
  assert.match(step.message, /don't call check_answer again/);
  assert.equal(checkAnswer("\\int 2x(x^2 + 1)^3 \\, dx", "u^4/4").verdict, "cannot_check", "in u: substitute back first");
  assert.equal(checkAnswer("\\frac{d}{dx}(x^2 + 1)", "2x dx").verdict, "correct");
  assert.equal(checkAnswer("\\frac{d}{dx}(x^2 + 1)", "x").verdict, "incorrect");
  assert.equal(checkAnswer("derivative of x cubed plus 5", "3x^2").verdict, "correct");
  assert.equal(checkAnswer("integral of 3x squared", "x cubed").verdict, "correct");
});

test("a spoken power is a power, not a fraction", () => {
  assert.equal(spokenToDigits("five to the fourth"), "5 ^4");
  assert.equal(spokenToDigits("two to the power of 3"), "2 ^3");
});

test("trig in calculus steps: LaTeX commands and a factor before a function", () => {
  assert.equal(checkAnswer("\\int \\cos(u) \\,du", "\\sin(u)").verdict, "correct");
  assert.equal(checkAnswer("\\frac{d}{dx} \\sin(x^2)", "2x cos(x^2)").verdict, "correct");
  assert.equal(checkAnswer("\\frac{d}{dx} \\sin(x^2)", "cos(x^2)").verdict, "incorrect");
});
