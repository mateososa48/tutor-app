import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONCERNS,
  draftFromProfile,
  EMPTY_DRAFT,
  GRADE_OPTIONS,
  gradeLabel,
  INTERESTS,
  INTEREST_MAX_LEN,
  interestEmoji,
  INTERESTS_MAX,
  interestsProfileLine,
  NOTE_MAX,
  onboardingNotes,
  onboardingProfileLine,
  sanitizeInterests,
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

test("interests are trimmed, deduplicated and capped, for either role", () => {
  assert.deepEqual(sanitizeInterests(["Sports", " sports ", "Video  games", "", 7, "Art"]), ["Sports", "Video games", "Art"]);
  assert.equal(sanitizeInterests(Array.from({ length: 12 }, (_, i) => `thing ${i}`)).length, INTERESTS_MAX);
  assert.equal(sanitizeInterests(["x".repeat(60)])[0].length, 24);
  assert.deepEqual(sanitizeInterests("Sports"), []);
  assert.deepEqual(sanitizeOnboarding({ by: "student", interests: ["Space", "space"] }), { by: "student", interests: ["Space"] });
  assert.deepEqual(sanitizeOnboarding({ by: "parent", interests: [] }), { by: "parent" });
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

test("interests reach the prompt as material for examples, used lightly and never announced", () => {
  assert.equal(interestsProfileLine({ by: "student" }), null);
  assert.equal(interestsProfileLine({}), null);
  const line = interestsProfileLine({ by: "student", interests: ["Sports", "Space"] }) ?? "";
  assert.match(line, /^Likes: Sports, Space\./);
  assert.match(line, /lightly/);
  assert.match(line, /never say that you are doing it/);
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
  assert.deepEqual(onboardingNotes({ ...EMPTY_DRAFT, name: "Mateo", grade: "7th grade" }), []);
  assert.deepEqual(onboardingNotes({ ...EMPTY_DRAFT, by: "student", name: "Mateo" }), [{ label: "Name", text: "Mateo" }]);
  assert.deepEqual(onboardingNotes({ ...EMPTY_DRAFT, by: "student", name: "Mateo", grade: "7th grade" }), [
    { label: "Name", text: "Mateo" },
    { label: "Grade", text: "7th" },
    { label: "Next", text: "Ask what they're working on" },
  ]);
  assert.deepEqual(onboardingNotes({ ...EMPTY_DRAFT, by: "student", name: "Mateo", grade: "7th grade", interests: ["Sports", "Space"] }), [
    { label: "Name", text: "Mateo" },
    { label: "Grade", text: "7th" },
    { label: "Likes", text: "Sports, Space" },
    { label: "Next", text: "Ask what they're working on" },
  ]);
  const parent = onboardingNotes({ ...EMPTY_DRAFT, by: "parent", name: "Ana", grade: "9th grade", concern: "test", note: " finals " });
  assert.deepEqual(parent, [
    { label: "Name", text: "Ana" },
    { label: "Grade", text: "9th" },
    { label: "Parent says", text: "A test is coming up" },
    { label: "Parent's note", text: "finals" },
    { label: "Note to self", text: "Check this for myself" },
  ]);
  const unsure = onboardingNotes({ ...EMPTY_DRAFT, by: "parent", name: "Ana", grade: "9th grade", concern: "unsure" });
  assert.equal(unsure.at(-1)?.text, "Find out what's going on");
  assert.equal(CONCERNS.length, 5);
});

test("a draft rebuilt from a saved profile carries what was stored, and defaults an older profile to a student", () => {
  const draft = draftFromProfile({
    displayName: "Ana",
    gradeLevel: "9th grade",
    onboarding: { by: "parent", concern: "test", interests: ["Art"] },
  });
  assert.deepEqual(draft, { by: "parent", name: "Ana", grade: "9th grade", concern: "test", note: "", interests: ["Art"] });
  // Onboarding does not pick a lesson, so nothing it stores can prefill the
  // intake and hide the "Nothing in mind?" bubble.
  assert.equal("topic" in draft, false);
  assert.equal(draftFromProfile({ displayName: "Old", gradeLevel: "High school (9–12)", onboarding: {} }).by, "student");
  assert.equal(draftFromProfile(null).by, null);
});

test("interest chips carry our emoji, and one they typed gets a neutral one", () => {
  assert.equal(interestEmoji("Sports"), "⚽");
  assert.equal(interestEmoji("  video games  "), "🎮");
  assert.equal(interestEmoji("Skateboarding"), "✨");
  assert.equal(interestEmoji(""), "✨");
  // Every suggestion has an emoji and a label short enough for a chip.
  for (const { label, emoji } of INTERESTS) {
    assert.ok(emoji.length > 0 && emoji.length <= 4, label);
    assert.ok(label.length <= INTEREST_MAX_LEN, label);
    assert.equal(interestEmoji(label), emoji);
  }
  // What a typed interest becomes in the record, and in the prompt.
  const record = sanitizeOnboarding({ by: "student", interests: ["Sports", "Skateboarding"] });
  assert.deepEqual(record?.interests, ["Sports", "Skateboarding"]);
  assert.match(interestsProfileLine(record) ?? "", /Likes: Sports, Skateboarding\./);
});
