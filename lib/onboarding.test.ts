import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONCERNS,
  GRADE_OPTIONS,
  gradeLabel,
  NOTE_MAX,
  onboardingNotes,
  onboardingProfileLine,
  sanitizeOnboarding,
} from "./onboarding";
import { registerForGrade } from "./tutor-prompts";

test("sanitizeOnboarding keeps a valid record and drops what it does not know", () => {
  assert.deepEqual(sanitizeOnboarding({ by: "student" }), { by: "student" });
  assert.deepEqual(sanitizeOnboarding({ by: "parent", concern: "test", note: "  finals   next week " }), {
    by: "parent",
    concern: "test",
    note: "finals next week",
  });
  // A student's record never carries a parent's fields.
  assert.deepEqual(sanitizeOnboarding({ by: "student", concern: "test", note: "x" }), { by: "student" });
  // Unknown concern keys and empty notes are dropped, not stored.
  assert.deepEqual(sanitizeOnboarding({ by: "parent", concern: "sad", note: "   " }), { by: "parent" });
  assert.equal(sanitizeOnboarding({ by: "teacher" }), null);
  assert.equal(sanitizeOnboarding({}), null);
  assert.equal(sanitizeOnboarding(null), null);
  assert.equal(sanitizeOnboarding("parent"), null);
});

test("a note is capped", () => {
  const record = sanitizeOnboarding({ by: "parent", note: "a".repeat(NOTE_MAX + 50) });
  assert.equal(record?.note?.length, NOTE_MAX);
});

test("the prompt line is a lead to check, never a fact, and only for a parent", () => {
  assert.equal(onboardingProfileLine({ by: "student" }), null);
  assert.equal(onboardingProfileLine({}), null);
  const line = onboardingProfileLine({ by: "parent", concern: "test" }) ?? "";
  assert.match(line, /a test is coming up/);
  assert.match(line, /not a fact/);
  assert.match(line, /never repeat it to the student/);
  const withNote = onboardingProfileLine({ by: "parent", concern: "behind", note: "mostly fractions" }) ?? "";
  assert.match(withNote, /falling behind in class \("mostly fractions"\)/);
  const noteOnly = onboardingProfileLine({ by: "parent", concern: "unsure", note: "he says it's boring" }) ?? "";
  assert.match(noteOnly, /wrote: "he says it's boring"/);
  assert.equal(onboardingProfileLine({ by: "parent" }), "A parent set this up for them.");
});

test("every grade option lands in the register the prompt expects", () => {
  const elementary = registerForGrade("5th grade");
  const middle = registerForGrade("7th grade");
  const high = registerForGrade("11th grade");
  assert.match(elementary, /Very short sentences/);
  assert.match(middle, /concrete example before any abstraction/);
  assert.match(high, /some abstraction/);
  assert.match(registerForGrade("9th grade"), /some abstraction/);
  assert.match(registerForGrade("12th grade"), /some abstraction/);
  assert.match(registerForGrade("College / University"), /Precise language/);
  // 10th must not read as "1st" (elementary) or "0th".
  assert.match(registerForGrade("10th grade"), /some abstraction/);
  assert.equal(GRADE_OPTIONS.length, 10);
  assert.equal(gradeLabel("7th grade"), "7th");
  assert.equal(gradeLabel("Self-learner"), "Not in school");
  assert.equal(gradeLabel("Middle school (6–8)"), "Middle school (6–8)");
});

test("the notepad follows the answers, and makes the parent rule visible", () => {
  assert.deepEqual(onboardingNotes({ by: null, name: "Mateo", grade: "7th grade", concern: null, note: "" }), []);
  assert.deepEqual(onboardingNotes({ by: "student", name: "Mateo", grade: "", concern: null, note: "" }), [
    { label: "Name", text: "Mateo" },
  ]);
  assert.deepEqual(onboardingNotes({ by: "student", name: "Mateo", grade: "7th grade", concern: null, note: "" }), [
    { label: "Name", text: "Mateo" },
    { label: "Grade", text: "7th" },
    { label: "Next", text: "Ask what they're working on" },
  ]);
  const parent = onboardingNotes({ by: "parent", name: "Ana", grade: "9th grade", concern: "test", note: " finals " });
  assert.deepEqual(parent, [
    { label: "Name", text: "Ana" },
    { label: "Grade", text: "9th" },
    { label: "Parent says", text: "A test is coming up" },
    { label: "Parent's note", text: "finals" },
    { label: "Note to self", text: "Check this for myself" },
  ]);
  const unsure = onboardingNotes({ by: "parent", name: "Ana", grade: "9th grade", concern: "unsure", note: "" });
  assert.equal(unsure.at(-1)?.text, "Find out what's going on");
  assert.equal(CONCERNS.length, 5);
});
