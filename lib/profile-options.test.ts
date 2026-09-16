import { test } from "node:test";
import assert from "node:assert/strict";
import { LEARNING_PREFS, levelPhrase, matchLevel, normalizePref, STUDENT_LEVELS } from "./profile-options";
import { registerForGrade } from "./tutor-prompts";

test("levels keep the strings onboarding stores and the prompts understand", () => {
  assert.deepEqual(STUDENT_LEVELS.map((l) => l.value), ["Middle school (6–8)", "High school (9–12)", "College / University", "Self-learner"]);
  const generic = registerForGrade("");
  for (const level of STUDENT_LEVELS.slice(0, 3)) assert.notEqual(registerForGrade(level.value), generic, level.value);
});

test("stored levels match loosely and read naturally in a sentence", () => {
  assert.equal(matchLevel("High school (9-12)")?.value, "High school (9–12)");
  assert.equal(matchLevel("  self-learner ")?.value, "Self-learner");
  assert.equal(matchLevel("11"), null);
  assert.equal(levelPhrase("High school (9–12)"), "in high school");
  assert.equal(levelPhrase("11"), "in grade 11");
  assert.equal(levelPhrase(""), "");
  assert.equal(levelPhrase(null), "");
});

test("preferences are -1, 0 or 1 and default to the middle", () => {
  assert.equal(normalizePref(-1), -1);
  assert.equal(normalizePref(1), 1);
  assert.equal(normalizePref("1"), 0);
  assert.equal(normalizePref(2), 0);
  assert.equal(normalizePref(undefined), 0);
});

test("every preference offers -1, 0 and 1 with short phrases", () => {
  for (const pref of LEARNING_PREFS) {
    assert.deepEqual(pref.options.map((o) => o.value), [-1, 0, 1]);
    for (const option of pref.options) {
      assert.ok(option.phrase.length <= 26, `${pref.key}: "${option.phrase}" is too long for an inline choice`);
      assert.equal(option.phrase, option.phrase.toLowerCase(), "phrases sit mid-sentence, so they are lowercase");
    }
  }
});
