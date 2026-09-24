import { test } from "node:test";
import assert from "node:assert/strict";
import { bothSidesOp, detectUnknown, GENERIC_QUESTION, namesOnlyFractions, splitAnswerLine } from "./board-grammar";

test("both-sides operations are read from the note", () => {
  assert.equal(bothSidesOp("subtract 3 from both sides"), "-\\,3");
  assert.equal(bothSidesOp("Take 3 away from both sides"), "-\\,3");
  assert.equal(bothSidesOp("add 5 to both sides"), "+\\,5");
  assert.equal(bothSidesOp("divide both sides by 2"), "\\div\\,2");
  assert.equal(bothSidesOp("Divide by 4"), "\\div\\,4");
  assert.equal(bothSidesOp("multiply both sides by 3"), "\\times\\,3");
  assert.equal(bothSidesOp("− 7"), "-\\,7");
  assert.equal(bothSidesOp("subtract x from both sides"), "-\\,x");
  assert.equal(bothSidesOp("multiply each side by 1/2"), "\\times\\,\\tfrac{1}{2}");
});

test("notes that are not a both-sides move give no operation", () => {
  assert.equal(bothSidesOp("add the tops, keep the bottom the same"), null);
  assert.equal(bothSidesOp("combine like terms"), null);
  assert.equal(bothSidesOp(""), null);
  assert.equal(bothSidesOp(undefined), null);
});

test("the unknown is the one letter the problem solves for", () => {
  assert.equal(detectUnknown("Solve 2x + 3 = 11"), "x");
  assert.equal(detectUnknown("Solve $3n - 4 = 11$"), "n");
  assert.equal(detectUnknown("$\\frac{y}{4} = 3$"), "y");
  assert.equal(detectUnknown("What is 3/4 of 20?"), null);
  assert.equal(detectUnknown("Solve $2x + y = 7$ and $x - y = 2$"), null, "two letters: no guess");
  assert.equal(detectUnknown("$y = mx + b$"), null);
  assert.equal(detectUnknown("Graph $f(x) = x^2$"), "x");
  assert.equal(detectUnknown("$20 + 5g = 45$"), "g");
  assert.equal(detectUnknown("$\\text{Area} = 12$"), null);
  assert.equal(detectUnknown("A plan costs \\$20 a month plus \\$5. Maya paid \\$45."), null, "dollars are not math");
});

test("a trailing ? is the blank", () => {
  assert.deepEqual(splitAnswerLine("x = ?"), { prefix: "x =", blank: true, suffix: "" });
  assert.deepEqual(splitAnswerLine("3/6 + 2/6 = ?"), { prefix: "3/6 + 2/6 =", blank: true, suffix: "" });
  // A fraction with a "?" in it is one box: a typeset "?" in a numerator was never filled.
  assert.deepEqual(splitAnswerLine("\\frac{1}{2} = \\frac{?}{6}"), { prefix: "\\frac{1}{2} =", blank: true, suffix: "", fraction: { den: "6" } });
  assert.deepEqual(splitAnswerLine("1/2 = ?/6"), { prefix: "1/2 =", blank: true, suffix: "", fraction: { den: "6" } });
  assert.deepEqual(splitAnswerLine("3/4 = 6/?"), { prefix: "3/4 =", blank: true, suffix: "", fraction: { num: "6" } });
  assert.deepEqual(splitAnswerLine("slope = ?/?"), { prefix: "slope =", blank: true, suffix: "" }, "both parts unknown: one box");
  assert.deepEqual(splitAnswerLine("x = \\boxed{?}"), { prefix: "x =", blank: true, suffix: "" });
  assert.deepEqual(splitAnswerLine("?"), { prefix: "", blank: true, suffix: "" });
  assert.deepEqual(splitAnswerLine("2x = 8"), { prefix: "2x = 8", blank: false, suffix: "" });
});

import { autoMath, mapMath } from "./board-grammar";

test("autoMath typesets the math in a plain line and leaves words alone", () => {
  assert.equal(autoMath("Solve 2x + 3 = 11"), "Solve $2x + 3 = 11$");
  assert.equal(autoMath("What is 3/4 of 20?"), "What is $3/4$ of 20?");
  assert.equal(autoMath("Is 1/2 + 1/3 = 2/5?"), "Is $1/2 + 1/3 = 2/5$?");
  assert.equal(autoMath("Find the slope of y = 2x + 1"), "Find the slope of $y = 2x + 1$");
  assert.equal(autoMath("2x + 3 = 11"), "$2x + 3 = 11$");
  assert.equal(autoMath("\\frac{1}{2} + \\frac{1}{3}"), "$\\frac{1}{2} + \\frac{1}{3}$");
  assert.equal(autoMath("A ladder 13 ft long leans against a wall."), "A ladder 13 ft long leans against a wall.");
  assert.equal(autoMath("Solve $3x = 9$"), "Solve $3x = 9$");
  assert.equal(autoMath("Adding fractions"), "Adding fractions");
  assert.equal(autoMath("**Goal:** Find x\n**Given:** 2x + 3 = 11"), "**Goal:** Find x\n**Given:** $2x + 3 = 11$");
});

test("mapMath rewrites only the math", () => {
  assert.equal(mapMath("Solve $2x = 8$ now", (m) => m.replace("x", "y")), "Solve $2y = 8$ now");
});

import { splitInlineMath } from "./board-grammar";

test("dollars in word problems stay dollars", () => {
  assert.deepEqual(splitInlineMath("A plan costs $20 a month plus $5 per GB."), [{ kind: "text", value: "A plan costs $20 a month plus $5 per GB." }]);
  assert.deepEqual(splitInlineMath("Solve $2x + 3 = 11$"), [{ kind: "text", value: "Solve " }, { kind: "math", value: "2x + 3 = 11" }]);
  assert.deepEqual(splitInlineMath("It costs \\$4, so $4n = 20$"), [{ kind: "text", value: "It costs $4, so " }, { kind: "math", value: "4n = 20" }]);
  assert.deepEqual(splitInlineMath("$20 plus $x$ dollars"), [{ kind: "text", value: "$20 plus " }, { kind: "math", value: "x" }, { kind: "text", value: " dollars" }]);
  assert.equal(autoMath("Pens cost $2 each. How many for $10?"), "Pens cost \\$2 each. How many for \\$10?");
  assert.equal(mapMath("Save $5 a week: $5w = 40$", (m) => m.toUpperCase()), "Save \\$5 a week: $5W = 40$");
});

import { boardQuestion, wordyAnswerLine } from "./board-grammar";

test("the board keeps the question, not the whole spoken turn", () => {
  assert.equal(boardQuestion("Which bar is bigger?"), "Which bar is bigger?");
  assert.equal(
    boardQuestion("Okay, two quick ones first so I don't waste your time. Which two numbers multiply to twelve and add up to seven?"),
    "Which two numbers multiply to twelve and add up to seven?",
  );
  assert.equal(
    boardQuestion("If I just hand you answers, the test will feel brand new. Here's one just like it, worked through, so the rest go fast. What's the first move on yours?"),
    "What's the first move on yours?",
  );
  assert.equal(boardQuestion("x".repeat(120)), null);
  assert.ok(wordyAnswerLine("The two numbers are ? and ?"));
  assert.ok(!wordyAnswerLine("x = ?"));
  assert.ok(!wordyAnswerLine("\\frac{3}{6} + \\frac{2}{6} = ?"));
});

import { firstLineOf } from "./board-grammar";

test("a solve problem's equation becomes the first line of working", () => {
  assert.equal(firstLineOf("Solve $2x + 3 = 11$"), "2x + 3 = 11");
  assert.equal(firstLineOf("Solve x/4 + 2 = 6"), "x/4 + 2 = 6");
  assert.equal(firstLineOf("What is $\\frac{3}{4}$ of 12?"), null);
  assert.equal(firstLineOf("Is $\\frac{1}{2} + \\frac{1}{3} = \\frac{2}{5}$?"), null, "a claim to test is not a line to solve");
  assert.equal(firstLineOf("Solve $2x + y = 7$"), null, "two letters");
  assert.equal(firstLineOf("Solve $x + 1 = 3$ and $x - 1 = 1$"), null, "two equations");
});

import { answerRowFor } from "./board-grammar";

test("a checked answer with no blank gets a row: the problem, then their answer", () => {
  assert.deepEqual(answerRowFor("30% of 80"), { equation: null, prefix: "30% of 80 =" });
  assert.deepEqual(answerRowFor("What's 15% of 60?"), { equation: null, prefix: "15% of 60 =" });
  assert.deepEqual(answerRowFor("3/4 of 12 = ?"), { equation: null, prefix: "3/4 of 12 =" });
  assert.deepEqual(answerRowFor("Solve 5(x + 3) = 25"), { equation: "5(x + 3) = 25", prefix: "x =" });
  assert.deepEqual(answerRowFor("$2y - 1 = 7$"), { equation: "2y - 1 = 7", prefix: "y =" });
  // Word problems, inequalities and long things keep the old way.
  assert.equal(answerRowFor("Sam has 12 apples and gives away 3"), null);
  assert.equal(answerRowFor("2x + 1 > 7"), null);
  assert.equal(answerRowFor("x + y = 7"), null);
  assert.equal(answerRowFor(""), null);
});

import { lineShowsOp, problemMath, pureArithmetic } from "./board-grammar";

test("a both-sides move keeps its letter: subtract 2x is −2x, not −2", () => {
  assert.equal(bothSidesOp("subtract 2x from both sides"), "-\\,2x");
  assert.equal(bothSidesOp("add 3y to both sides"), "+\\,3y");
  assert.equal(bothSidesOp("subtract 7 from both sides"), "-\\,7");
});

test("a line that already shows its move gets no both-sides row", () => {
  assert.equal(lineShowsOp("3x + 7 - 7 = 25 - 7", "-\\,7"), true);
  assert.equal(lineShowsOp("3x = 18", "-\\,7"), false);
  assert.equal(lineShowsOp("\\frac{3x}{3} = \\frac{18}{3}", "\\div\\,3"), true);
  assert.equal(lineShowsOp("\\frac{5(x-2)}{5} = \\frac{20}{5}", "\\div\\,5"), true);
  assert.equal(lineShowsOp("x = 6", "\\div\\,3"), false);
  assert.equal(lineShowsOp("4x - 9 - 2x = 2x + 7 - 2x", "-\\,2x"), true);
  assert.equal(lineShowsOp("2x - 9 = 7", "-\\,2x"), false);
});

test("plain arithmetic is told from problems with something to solve", () => {
  for (const t of ["25 - 7", "\\frac{18}{3}", "18/3", "3.5 × 4"]) assert.equal(pureArithmetic(t), true, t);
  for (const t of ["x - 2 = 4", "25% of 80", "3x", ""]) assert.equal(pureArithmetic(t), false, t);
});

test("the math a problem asks about, without its words", () => {
  assert.equal(problemMath("Solve $5(x - 2) = 20$"), "5(x - 2) = 20");
  assert.equal(problemMath("What is 25% of 80?"), "25% of 80");
  assert.equal(problemMath("Sam has 3 apples and eats one"), null);
});

test("a box can come first: '? = 7'", () => {
  assert.deepEqual(splitAnswerLine("? = 7"), { prefix: "", blank: true, suffix: "= 7" });
  assert.deepEqual(splitAnswerLine("x = ?"), { prefix: "x =", blank: true, suffix: "" });
});

import { questionOnly } from "./board-grammar";

test("a board question is the question, without the praise and the chat around it", () => {
  assert.equal(questionOnly("Yep, we can subtract 2x from both sides. What does that leave on the left?"), "What does that leave on the left?");
  assert.equal(questionOnly("There. Now you can finish it. What's x?"), "What's x?");
  assert.equal(questionOnly("Nice job. Last step: what does x equal?"), "Last step: what does x equal?");
  assert.equal(questionOnly("Okay, and what's left on both sides?"), "What's left on both sides?");
  assert.equal(questionOnly("What's 0.5 times 8?"), "What's 0.5 times 8?");
  assert.equal(questionOnly("What's your first move?"), "What's your first move?");
});

test("captions that only name the fractions, and questions that add nothing to a box", () => {
  for (const label of ["one half", "one third", "1/2 and 1/3", "one half and two fifths", "$\\frac{1}{2}$", "one half, one third"]) {
    assert.equal(namesOnlyFractions(label), true, label);
  }
  for (const label of ["both cut into sixths", "3 slices of pizza", "a whole cut into sixths", ""]) {
    assert.equal(namesOnlyFractions(label), false, label);
  }
  for (const q of ["What's the answer?", "what is the answer", "What do you get?", "Your turn!", "So, what's the total?"]) {
    assert.ok(GENERIC_QUESTION.test(q), q);
  }
  for (const q of ["What's your first move?", "How many sixths is one half?", "Why does that work?"]) {
    assert.ok(!GENERIC_QUESTION.test(q), q);
  }
});
