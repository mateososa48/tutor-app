import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTutorState,
  rememberNote,
  looksConfused,
  noteStudentTurn,
  noteDraw,
  formatMemory,
  formatDownshift,
} from "./tutor-state";

test("looksConfused detects common confusion phrases", () => {
  assert.equal(looksConfused("I don't get it"), true);
  assert.equal(looksConfused("wait, what?"), true);
  assert.equal(looksConfused("I'm totally lost"), true);
  assert.equal(looksConfused("huh?"), true);
  assert.equal(looksConfused("can you explain that again"), true);
});

test("looksConfused does not fire on confident answers", () => {
  assert.equal(looksConfused("it's x equals four"), false);
  assert.equal(looksConfused("okay that makes sense"), false);
  assert.equal(looksConfused("the ball speeds up"), false);
});

test("noteStudentTurn increments streak on confusion, resets otherwise", () => {
  const s = createTutorState();
  noteStudentTurn(s, "I don't understand");
  assert.equal(s.confusionStreak, 1);
  noteStudentTurn(s, "huh?");
  assert.equal(s.confusionStreak, 2);
  noteStudentTurn(s, "oh, x = 4!");
  assert.equal(s.confusionStreak, 0);
});

test("noteDraw counts draws and noteStudentTurn resets them", () => {
  const s = createTutorState();
  noteDraw(s);
  noteDraw(s);
  assert.equal(s.drawsSinceStudent, 2);
  noteStudentTurn(s, "ok");
  assert.equal(s.drawsSinceStudent, 0);
});

test("rememberNote caps at 12 newest notes", () => {
  const s = createTutorState();
  for (let i = 0; i < 15; i++) rememberNote(s, `note ${i}`);
  assert.equal(s.notes.length, 12);
  assert.equal(s.notes[0], "note 3");
  assert.equal(s.notes[11], "note 14");
});

test("formatMemory is empty until notes exist", () => {
  const s = createTutorState();
  assert.equal(formatMemory(s), "");
  rememberNote(s, "confuses KE with momentum");
  assert.match(formatMemory(s), /\[Memory: confuses KE with momentum\]/);
});

test("formatDownshift returns a pacing directive", () => {
  assert.match(formatDownshift(), /Downshift now/);
});
