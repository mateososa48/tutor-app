import { test } from "node:test";
import assert from "node:assert/strict";
import { SentenceStream, decimalWords, displayText, fractionWords, numberWords, pointsAtBoard, speakMath, stripPraise } from "./speech";

test("numbers, fractions and decimals in words", () => {
  assert.equal(numberWords(48), "forty-eight");
  assert.equal(numberWords(1205), "one thousand two hundred five");
  assert.equal(fractionWords(1, 2), "one half");
  assert.equal(fractionWords(3, 4), "three fourths");
  assert.equal(fractionWords(17, 31), "seventeen over thirty-one");
  assert.equal(decimalWords("0.35"), "zero point three five");
  assert.equal(decimalWords("-12.75"), "negative twelve point seven five");
});

test("math is read aloud as a tutor says it", () => {
  assert.equal(speakMath("So x² + 3x = 10."), "So x squared plus 3 x equals 10.");
  assert.equal(speakMath("Is 0.35 bigger than 0.5?"), "Is zero point three five bigger than zero point five?");
  assert.equal(speakMath("What's 1/2 + 1/3?"), "What's one half plus one third?");
  assert.equal(speakMath("That's 2 1/4 cups."), "That's two and one fourth cups.");
  assert.equal(speakMath("What is f(3)?"), "What is f of 3?");
  assert.equal(speakMath("So it's 6 r 5."), "So it's 6 remainder 5.");
  assert.equal(speakMath("Try -7 - 4."), "Try negative 7 minus 4.");
  assert.equal(speakMath("The ratio is 2:3."), "The ratio is 2 to 3.");
  assert.equal(speakMath("That's 25% off."), "That's 25 percent off.");
});

test("negative squared is said two different ways", () => {
  assert.equal(speakMath("What is (-3)^2?"), "What is negative 3, all squared?");
  assert.equal(speakMath("What is -3^2?"), "What is the negative of 3 squared?");
});

test("LaTeX, markup, notes and tool names are never spoken", () => {
  assert.equal(speakMath("Look at $\\frac{3}{4}$ on the bar."), "Look at three fourths on the bar.");
  assert.equal(speakMath("So $\\sqrt{16} = 4$."), "So the square root of 16 equals 4.");
  assert.equal(speakMath("It's **really** close."), "It's really close.");
  assert.equal(speakMath("Now draw_fraction(fraction=\"1/2\") which is bigger?"), "Now which is bigger?");
  assert.equal(speakMath("Which one? [Checker: correct]"), "Which one?");
  assert.equal(speakMath("12 \\times 4 is 48."), "12 times 4 is 48.");
  assert.equal(speakMath("x/2 = 4"), "x over 2 equals 4");
});

test("the shown text keeps digits and drops markup", () => {
  assert.equal(displayText("Is **0.35** bigger than $\\frac{1}{2}$? [Checker: x]"), "Is 0.35 bigger than \\frac{1}{2}?");
  assert.equal(displayText("Now draw_fraction(fraction=\"1/2\") which is bigger?"), "Now which is bigger?");
});

test("praise openers go; a sentence of only praise is dropped", () => {
  assert.equal(stripPraise("Exactly! Six a cup."), "Six a cup.");
  assert.equal(stripPraise("Spot on."), "");
  assert.equal(stripPraise("Great job, what about five cups?"), "What about five cups?");
  assert.equal(stripPraise("Right, so what's next?"), "Right, so what's next?");
  assert.equal(stripPraise("Right, you're spot on: no flour, no cookies."), "No flour, no cookies.");
});

test("tokens become whole sentences; decimals and abbreviations are not ends", () => {
  const s = new SentenceStream();
  const got: string[] = [];
  for (const tok of ["Is 0", ".", "35 bigger", "? Try it", ". Then", " we'll see"]) got.push(...s.push(tok));
  got.push(...s.end());
  assert.deepEqual(got, ["Is 0.35 bigger?", "Try it.", "Then we'll see"]);
});

test("the first clause can go early, once", () => {
  const s = new SentenceStream({ earlyClauseWords: 5 });
  const got = [...s.push("If you add three every time, what does zero cups give you, then"), ...s.push(" one cup? Hmm, ok.")];
  assert.equal(got[0], "If you add three every time,");
  assert.deepEqual(got.slice(1), ["what does zero cups give you, then one cup?", "Hmm, ok."].slice(0, got.length - 1));
});

test("a sentence pointing at the board is told apart from one announcing a drawing", () => {
  assert.equal(pointsAtBoard("Look at the two bars."), true);
  assert.equal(pointsAtBoard("Here's a number line."), true);
  assert.equal(pointsAtBoard("Let me draw that."), false);
  assert.equal(pointsAtBoard("How did you get fifteen?"), false);
});
