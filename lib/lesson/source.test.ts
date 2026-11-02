import { test } from "node:test";
import assert from "node:assert/strict";
import { namedProblem, sniffImageType } from "./source";
import { newProblem } from "./state";

test("an image's type comes from its bytes, not its name", () => {
  assert.equal(sniffImageType("iVBORw0KGgoAAAANSUhEUg", "image/jpeg"), "image/png");
  assert.equal(sniffImageType("/9j/4AAQSkZJRgABAQ", "image/png"), "image/jpeg");
  assert.equal(sniffImageType("R0lGODlhAQABAIAAAA", "image/png"), "image/gif");
  assert.equal(sniffImageType("UklGRiQAAABXRUJQ", "image/png"), "image/webp");
  assert.equal(sniffImageType("AAAA", "image/jpg"), "image/jpeg");
});

// Session 8i9xr1 (Nov 2): "lets do the last question" stayed on problem 1.
test("the student's 'last question' and 'next one' pick from the sheet; the tutor's 'like the last one' does not", () => {
  const sheet = ["1", "2", "6"].map((q, i) => newProblem(`P${i + 1}`, `${q}. x`, { kind: "worksheet", file: "File 1", question: q }));
  assert.equal(namedProblem("lets do the last question", sheet, false, { current: "P1" }), "P3");
  assert.equal(namedProblem("next one", sheet, false, { current: "P1" }), "P2");
  assert.equal(namedProblem("can we do the next problem", sheet, false, { current: "P3" }), null);
  assert.equal(namedProblem("i didnt get the last one", sheet, false, { current: "P2" }), null);
  assert.equal(namedProblem("lets do the last question", sheet), null);
});
