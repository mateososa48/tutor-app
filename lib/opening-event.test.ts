import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeadSession, openingEvent } from "./gemini-live";

test("the opening greets the student by name before anything else", () => {
  for (const files of [0, 1]) {
    const text = openingEvent("I need help with fractions.", files);
    assert.ok(text.startsWith("I need help with fractions."), "their own words come first");
    assert.match(text, /Greet them first, by name/);
  }
});

test("with a worksheet attached, it asks which problem and never fetches the photo again", () => {
  const text = openingEvent("I need help with the work I just uploaded.", 1);
  assert.match(text, /which problem they want to start with/);
  assert.match(text, /no look_at_worksheet/);
  assert.doesNotMatch(text, /a problem on a sheet, or the whole idea/);
});

test("a 1008 'not found or expired' close means the session is gone; other closes may resume", () => {
  assert.ok(isDeadSession(1008, "BidiGenerateContent session not found or expired"));
  assert.ok(!isDeadSession(1011, "Internal error encountered."));
  assert.ok(!isDeadSession(1008, "unregistered callers"));
  assert.ok(!isDeadSession(1000, ""));
});
