import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBackendInstructions,
  buildFilesItemText,
  buildGreetingLine,
  buildResumeLine,
  buildVoiceInstructions,
  registerForGrade,
} from "./tutor-prompts";

const profile = {
  displayName: "Sofia Ramirez",
  gradeLevel: "Middle school (6–8)",
  learningPrefs: { hintVsAnswer: -1, pace: -1, examplesVsTheory: -1, tone: 1 },
  extraContext: "Struggles with fractions.",
};

test("voice instructions stay short and mention the student by first name", () => {
  const text = buildVoiceInstructions(profile);
  assert.ok(text.length < 5000, `voice prompt too long: ${text.length}`);
  assert.match(text, /named Sofia/);
  assert.match(text, /Delegate when:/);
  assert.match(text, /Do not delegate when:/);
  assert.doesNotMatch(text, /Sofia Ramirez/);
});

test("backend instructions carry the profile, memory notes, and the output contract", () => {
  const text = buildBackendInstructions(profile, ["confuses kinetic with momentum"]);
  assert.match(text, /Name: Sofia Ramirez/);
  assert.match(text, /Struggles with fractions/);
  assert.match(text, /- confuses kinetic with momentum/);
  assert.match(text, /Output contract/);
  assert.match(text, /\[Board: …\]/);
  assert.ok(text.length < 18000, `backend prompt too long: ${text.length}`);
});

test("backend instructions put the board first and name the picture tools", () => {
  const text = buildBackendInstructions(null, []);
  assert.match(text, /EVERY reply includes at least one board action/);
  assert.match(text, /draw_fraction/);
  assert.match(text, /draw_balance/);
  assert.match(text, /never fake a diagram with text, brackets, dashes, or ASCII/);
  assert.match(text, /never a bare question with an empty board/i);
  assert.match(text, /point_at/);
  assert.match(text, /erase_older/);
  assert.match(text, /one to four board actions/);
  assert.ok(text.indexOf("Example B") < text.indexOf('draw_fraction(fraction="1/2"'), "the fractions example shows the picture being drawn");
  assert.doesNotMatch(text, /Before explaining or drawing anything/);
});

test("backend instructions handle a missing profile and empty memory", () => {
  const text = buildBackendInstructions(null, []);
  assert.match(text, /No profile yet/);
  assert.match(text, /nothing yet/);
});

test("opening lines are short, speakable, and name the student", () => {
  assert.equal(buildGreetingLine(profile, 0), "Hi Sofia! Good to see you. What would you like to work on today?");
  assert.match(buildGreetingLine(profile, 2), /the 2 files you attached/);
  assert.match(buildGreetingLine(null, 1), /^Hi! .*the file you attached/);
  assert.match(buildResumeLine(profile), /Sofia, I'm back/);
  assert.match(buildFilesItemText(["File 1 (hw.png)"]), /File 1/);
  assert.ok(buildFilesItemText(["a", "b"]).length < 1500);
});

test("register scales with grade", () => {
  assert.match(registerForGrade("3rd grade"), /Very short/);
  assert.match(registerForGrade("Middle school (6–8)"), /Short plain/);
  assert.match(registerForGrade("High school (9-12)"), /brisker/);
  assert.match(registerForGrade("College / University"), /Precise/);
  assert.match(registerForGrade(null), /Plain, concrete/);
});
