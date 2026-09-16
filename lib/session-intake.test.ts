import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_LANGUAGE,
  EMPTY_INTAKE,
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

test("the instructions set the language, quote the topic and forbid the warm-up question", () => {
  const text = intakeInstructions(intake({ topic: "Solving for x", language: "de" }), 0);
  assert.match(text, /speak and write on the board in German/);
  assert.match(text, /"Solving for x"/);
  assert.match(text, /Ask nothing about what they want to work on/);
  assert.doesNotMatch(text, /pictures/);
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
