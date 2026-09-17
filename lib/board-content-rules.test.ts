import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attemptProblem,
  boardLines,
  calloutProblem,
  contentFingerprint,
  findDuplicate,
  isNonAnswer,
  pictureContent,
  splitSlots,
  splitSteps,
  withoutPraise,
} from "./board-content-rules";

test("pipes and literal newlines become line breaks", () => {
  assert.equal(boardLines("Point 1: (2, 3) | Point 2: (6, 11)"), "Point 1: (2, 3)\nPoint 2: (6, 11)");
  assert.equal(boardLines("slope = rise / run | rise = change in y | run = change in x"), "slope = rise / run\nrise = change in y\nrun = change in x");
  assert.equal(boardLines("line one\\nline two"), "line one\nline two");
  assert.equal(boardLines("|x| = 3"), "|x| = 3", "an absolute value is not a line break");
  assert.equal(boardLines("a\n\n\nb"), "a\n\nb");
});

test("slots keep their places, steps keep absolute values", () => {
  assert.deepEqual(splitSlots("factor || solve"), ["factor", "", "solve"]);
  assert.deepEqual(splitSlots("a | b | |"), ["a", "b"]);
  assert.deepEqual(splitSlots(undefined), []);
  assert.deepEqual(splitSteps("x^2 = 9 | x = 3"), ["x^2 = 9", "x = 3"]);
  assert.deepEqual(splitSteps("|x| = 3 | x = 3 \\text{ or } x = -3"), ["|x| = 3", "x = 3 \\text{ or } x = -3"]);
  assert.deepEqual(splitSteps("a=1|b=2"), ["a=1", "b=2"]);
});

test("'I don't know' is recognised in every session language", () => {
  for (const t of ["i dont know", "I don't know.", "idk", "IDK!!", "what?", "Huh?", "umm", "no idea", "I'm lost",
    "ich weiß nicht", "Keine Ahnung", "no sé", "ni idea", "je ne sais pas", "non lo so", "não sei", "nie wiem",
    "bilmiyorum", "не знаю", "لا أعرف", "不知道", "không biết"]) {
    assert.ok(isNonAnswer(t), t);
  }
  for (const t of ["16", "x = 4", "no, four pieces is more", "no", "I don't know if it's 4", "maybe 3/4?", "two", "subtract 3"]) {
    assert.ok(!isNonAnswer(t), t);
  }
});

test("attempts are the student's own short answers", () => {
  assert.match(attemptProblem("i dont know") ?? "", /not an attempt/);
  assert.match(attemptProblem("what?") ?? "", /smaller question/);
  assert.match(attemptProblem("You said the answer is 16") ?? "", /exact words/);
  assert.match(attemptProblem("x".repeat(201)) ?? "", /201 characters/);
  assert.equal(attemptProblem("3/4 + 1/4 = 4/8"), null);
  assert.equal(attemptProblem("so x = 16?"), null);
  assert.equal(attemptProblem("no, four pieces is more"), null);
});

test("callouts carry math, rules and questions, not praise or chat", () => {
  // From the recorded session.
  assert.match(calloutProblem("Perfect slope calculation for these points. slope=3.") ?? "", /Praise/);
  assert.match(calloutProblem("Let's wrap up with one last challenge that fits everything we learned today. Ready?") ?? "", /conversation/);
  assert.equal(calloutProblem("What's our first move to get x by itself?"), null);
  assert.equal(calloutProblem("Keep both sides balanced! Always do the same thing to the left and right."), null);
  assert.equal(calloutProblem("m is the slope, b is the y-intercept"), null);
  assert.equal(calloutProblem("Slope is just Rise divided by Run. Change in y over change in x."), null);
  assert.equal(calloutProblem("Which side is heavier?"), null);
  assert.equal(calloutProblem("Let's check: 3(6) + 7 = 25"), null);
  assert.match(calloutProblem("Great job!") ?? "", /Praise/);
  // A question behind the praise is kept.
  assert.equal(withoutPraise("Exactly. What is the difference between 11 and 3?"), "What is the difference between 11 and 3?");
  assert.equal(withoutPraise("Nice work! Which bar is taller?"), "Which bar is taller?");
  assert.equal(withoutPraise("Perfect slope calculation for these points. slope=3."), null, "no question: still refused");
  assert.equal(withoutPraise("Great job! Great job?"), null);
  assert.equal(withoutPraise("What is 11 minus 3?"), null, "no praise, nothing to strip");
});

test("the same content twice points at what is already there", () => {
  const note = contentFingerprint("add_text_note", "Point 1: (2, 3)\nPoint 2: (6, 11)");
  const items = [
    { id: "b1", tool: "start_new_problem", content: contentFingerprint("start_new_problem", "Slope") },
    { id: "b2", tool: "add_text_note", content: note },
    { id: "b3", tool: "draw_equation_step", content: contentFingerprint("draw_equation_step", "11 - 3 = 8") },
    { id: "b4", tool: "draw_fraction", content: contentFingerprint("draw_fraction", pictureContent({ fraction: "3/4", label: "a" })) },
    { id: "b5", tool: "draw_equation_step", content: contentFingerprint("draw_equation_step", "6 - 2 = 4") },
  ];
  assert.equal(findDuplicate("add_text_note", contentFingerprint("add_text_note", "point 1: (2, 3) point 2: (6, 11)"), items), "b2");
  // Only the newest equation counts: an earlier line may be written again on purpose.
  assert.equal(findDuplicate("draw_equation_step", contentFingerprint("draw_equation_step", "11-3=8"), items), null);
  assert.equal(findDuplicate("draw_equation_step", contentFingerprint("draw_equation_step", "6-2 = 4"), items), "b5");
  // A picture with another caption is the same picture.
  assert.equal(findDuplicate("draw_fraction", contentFingerprint("draw_fraction", pictureContent({ fraction: "3/4", label: "b", place: "right" })), items), "b4");
  assert.equal(findDuplicate("draw_fraction", contentFingerprint("draw_fraction", pictureContent({ fraction: "1/2" })), items), null);
  // A new problem starts fresh.
  const after = [...items, { id: "b6", tool: "start_new_problem", content: "x" }];
  assert.equal(findDuplicate("add_text_note", note, after), null);
});
