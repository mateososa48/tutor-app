import { test } from "node:test";
import assert from "node:assert/strict";
import { describeAnnotations, parseAnnotations } from "./board-annotate";

test("Mateo's whiteboard: −22 under both sides with a note, and a division bar under each side", () => {
  const subtract = parseAnnotations("under 22: −22 | under 7: −22 | right: subtract 22");
  assert.deepEqual(subtract, [
    { kind: "under", term: "22", text: "−22" },
    { kind: "under", term: "7", text: "−22" },
    { kind: "right", term: null, text: "subtract 22" },
  ]);
  const divide = parseAnnotations("divide 2x: 2 | divide 7: 2");
  assert.deepEqual(divide, [
    { kind: "divide", term: "2x", text: "2" },
    { kind: "divide", term: "7", text: "2" },
  ]);
  assert.equal(describeAnnotations(subtract as never), "−22 under 22, −22 under 7, a note: subtract 22");
});

test("other words for the same marks, and a cancel needs no text", () => {
  assert.deepEqual(parseAnnotations("above x: one bag | cross +7 | beside: take 7 from both sides | below: check it"), [
    { kind: "over", term: "x", text: "one bag" },
    { kind: "cancel", term: "+7", text: "" },
    { kind: "right", term: null, text: "take 7 from both sides" },
    { kind: "below", term: null, text: "check it" },
  ]);
  assert.deepEqual(parseAnnotations("below 7: 2"), [{ kind: "under", term: "7", text: "2" }]);
});

test("a mark it cannot place says how to write it", () => {
  for (const bad of ["", "under: −22", "under 22", "sideways 22: x", "a | b | c | d | e | f | g"]) {
    const r = parseAnnotations(bad);
    assert.ok("error" in r, bad);
  }
});
