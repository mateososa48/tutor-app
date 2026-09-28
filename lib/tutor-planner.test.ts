import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANNER_SYSTEM, parsePlannerOrder, plannerNote, plannerPrompt } from "./tutor-planner";

test("the planner's prompt carries the new line, the private verdict, the board and the reminders", () => {
  const text = plannerPrompt({
    grade: "6th grade",
    topic: "ratios and rates",
    turns: [{ student: "i got them all wrong", tutor: "Is there a problem on a sheet?", tools: ["start_new_problem"] }],
    line: "15 cuz you add 3",
    verdict: '[Answer check, not from the student: "15" → incorrect.]',
    board: "b1 heading \"Ratios\"",
    state: "[Tutor state: step PROBE]",
    reminders: "[Note for your next turn: end with a question]",
  });
  assert.match(text, /The student just said: "15 cuz you add 3"/);
  assert.match(text, /Checker \(private; never say it was checked\): \[Answer check/);
  assert.match(text, /The board now: b1 heading/);
  assert.match(text, /App reminders \(use them only if they fit your order\)/);
  assert.match(text, /Turn 1\nStudent: i got them all wrong/);
  assert.ok(text.trim().endsWith("Your one order for the tutor's reply:"));
});

test("the planner starts a lesson with no turns and leaves out what it does not have", () => {
  const text = plannerPrompt({ grade: "5th grade", topic: "decimals", turns: [], line: "hi", verdict: null, board: "", state: null, reminders: null });
  assert.match(text, /This is the start of the lesson/);
  assert.match(text, /The board now: empty/);
  assert.doesNotMatch(text, /Checker|App reminders|Lesson state/);
});

test("the planner's reply becomes one bracketed note: its quote and one allowed board move", () => {
  assert.equal(plannerNote('Say: "How did you get 15?" Board: add_student_attempt("15 cuz you add 3")'), '[Next move, not from the student: Say: "How did you get 15?" After speaking: add_student_attempt("15 cuz you add 3")]');
  assert.equal(plannerNote('Say: "Exactly, fifty cents is more. Which decimal is bigger?"'), '[Next move, not from the student: Say: "Fifty cents is more. Which decimal is bigger?"]', "praise opener cut");
  assert.equal(plannerNote('Say: "Yes, exactly, a negative times a negative is positive. So what is b squared?"'), '[Next move, not from the student: Say: "A negative times a negative is positive. So what is b squared?"]');
  assert.equal(plannerNote('Say: "What comes next?" Board: set_plan("x")'), '[Next move, not from the student: Say: "What comes next?"]', "a tool outside the list is dropped");
  assert.equal(plannerNote('Thinking Process: 1. **Analyze the student** … Rule 2 applies.'), null, "reasoning is never an order");
  assert.equal(plannerNote("none"), null);
  assert.equal(plannerNote(""), null);
  assert.equal(plannerNote(undefined), null);
  assert.equal(parsePlannerOrder('Say: "What is $f(3)$?"')?.say, "What is f(3)?", "no LaTeX in what the tutor will say");
});

test("the planner's rules put diagnosis first and never let it hand over the answer", () => {
  assert.match(PLANNER_SYSTEM, /1\. They gave an answer, a rule or a guess WITHOUT saying why: ask how they got it/);
  assert.match(PLANNER_SYSTEM, /2\. They already said why.*don't ask again/);
  assert.match(PLANNER_SYSTEM, /The quote never starts with praise/);
  assert.match(PLANNER_SYSTEM, /Board tools you may name: add_student_attempt.*No others\./);
  assert.match(PLANNER_SYSTEM, /Never: give the answer, a number they should find, or the rule/);
  assert.match(PLANNER_SYSTEM, /your order agrees with it/);
  assert.match(PLANNER_SYSTEM, /never ask for add_student_attempt of an answer/);
  assert.match(PLANNER_SYSTEM, /never ask them to write, draw or shade/);
});
