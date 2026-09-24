import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_MINUTES,
  EMPTY_INTAKE,
  isSessionLength,
  SESSION_LENGTHS,
  intakeInstructions,
  intakeOpeningMessage,
  intakeTitle,
  languageName,
  type SessionIntake,
} from "./session-intake";

const intake = (over: Partial<SessionIntake> = {}): SessionIntake => ({ ...EMPTY_INTAKE, ...over });

test("sessions open in English unless the student picks otherwise", () => {
  assert.equal(DEFAULT_LANGUAGE, "en");
  assert.equal(languageName("de"), "German");
  assert.equal(languageName("vi"), "Vietnamese");
});

test("the title is the first line of the topic, trimmed", () => {
  assert.equal(intakeTitle(intake({ topic: "Adding fractions\nquestion 4" })), "Adding fractions");
  assert.equal(intakeTitle(intake({ topic: "   " })), "Session");
  const long = intakeTitle(intake({ topic: "x".repeat(80) }));
  assert.ok(long.length <= 60, long);
  assert.ok(long.endsWith("…"));
});

test("the opening message says the problem, the uploads and the language", () => {
  const message = intakeOpeningMessage(intake({ topic: "Adding fractions", language: "de" }), 2);
  assert.match(message, /I need help with: Adding fractions/);
  assert.match(message, /uploaded 2 pictures/);
  assert.match(message, /teach me in German/);
});

test("with no topic, the opening message leans on the upload", () => {
  const message = intakeOpeningMessage(intake({ language: "en" }), 1);
  assert.match(message, /the work I just uploaded/);
  assert.match(message, /uploaded a picture/);
  assert.match(message, /teach me in English/);
});

test("the instructions set the language, quote the topic and open by asking, not diving in", () => {
  const text = intakeInstructions(intake({ topic: "Solving for x", language: "de" }), 0);
  assert.match(text, /speak and write on the board in German/);
  assert.match(text, /"Solving for x"/);
  assert.match(text, /dive in on what they sent: open with OPEN from the steps/);
  assert.match(text, /say the plan in one breath/);
  assert.doesNotMatch(text, /pictures/);
});

test("the time they have sizes the plan, and old intakes without it still work", () => {
  assert.equal(EMPTY_INTAKE.minutes, DEFAULT_MINUTES);
  assert.deepEqual([...SESSION_LENGTHS], [10, 15, 20, 30, 45, 60]);
  assert.ok(isSessionLength(45) && !isSessionLength(25) && !isSessionLength("20"));
  const text = intakeInstructions(intake({ topic: "Slope", minutes: 30 }), 0);
  assert.match(text, /They have 30 minutes today\. Size the plan to it/);
  assert.match(text, /when it says to wrap up, wrap up/);
  const old = intakeInstructions({ topic: "Slope", language: "en", fileNames: [] }, 0);
  assert.doesNotMatch(old, /minutes today/);
});

test("attachments are called out so the tutor reads them before speaking", () => {
  assert.match(intakeInstructions(intake({ language: "de" }), 1), /one picture of the work\. Read it/);
  assert.match(intakeInstructions(intake({ language: "de" }), 3), /3 pictures of the work\. Read them/);
});

test("an empty intake still carries the language", () => {
  const text = intakeInstructions(EMPTY_INTAKE, 0);
  assert.match(text, /English/);
  assert.doesNotMatch(text, /The student said/);
});

test("a topic brings its skill, what comes before it and show-me problems; an unknown one brings nothing", () => {
  const text = intakeInstructions(intake({ topic: "adding fractions" }), 0);
  assert.match(text, /Likely skill: Adding fractions with unlike denominators\. Comes before it: Equivalent fractions/);
  assert.match(text, /Show-me problems, easiest first:/);
  const lost = intakeInstructions(intake({ topic: "I don't get fractions at all" }), 0);
  assert.doesNotMatch(lost, /\\div|Division/, "a student lost on fractions is not quizzed on division");
  assert.doesNotMatch(intakeInstructions(intake({ topic: "my essay on the civil war" }), 0), /Likely skill/);
});

test("with no topic and no upload, the opening message claims no upload", () => {
  const message = intakeOpeningMessage(intake({ language: "en" }), 0);
  assert.match(message, /not sure what to work on yet/);
  assert.doesNotMatch(message, /uploaded/);
});
