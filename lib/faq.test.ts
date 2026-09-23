import { test } from "node:test";
import assert from "node:assert/strict";
import { FAQ_ANSWER_MAX, FAQ_ITEMS, FAQ_QUESTION_MAX, FAQ_SYSTEM, clampAnswer, cleanQuestion } from "./faq";

test("cleanQuestion trims, collapses and bounds", () => {
  assert.equal(cleanQuestion("  does   it\nwork on a phone? "), "does it work on a phone?");
  assert.equal(cleanQuestion(""), null);
  assert.equal(cleanQuestion("a"), null);
  assert.equal(cleanQuestion(42), null);
  assert.equal(cleanQuestion("x".repeat(FAQ_QUESTION_MAX + 1)), null);
  assert.equal(cleanQuestion("x".repeat(FAQ_QUESTION_MAX)), "x".repeat(FAQ_QUESTION_MAX));
});

test("clampAnswer strips markdown and wrapping quotes", () => {
  assert.equal(clampAnswer('"**Yes**, it works."'), "Yes, it works.");
  assert.equal(clampAnswer("It  runs\n\nin a browser."), "It runs in a browser.");
});

test("clampAnswer keeps whole sentences under the cap", () => {
  const s = "One short sentence. ".repeat(30);
  const out = clampAnswer(s);
  assert.ok(out.length <= FAQ_ANSWER_MAX);
  assert.ok(out.endsWith("."));
});

test("clampAnswer cuts a single long sentence at a word, with an ellipsis", () => {
  const out = clampAnswer("word ".repeat(200).trim());
  assert.ok(out.length <= FAQ_ANSWER_MAX + 1);
  assert.ok(out.endsWith("…"));
  assert.ok(!out.includes("wor…"));
});

test("the prompt carries every curated answer and the no-price rule", () => {
  for (const item of FAQ_ITEMS) assert.ok(FAQ_SYSTEM.includes(item.a));
  assert.match(FAQ_SYSTEM, /Never quote a price/);
  assert.doesNotMatch(FAQ_SYSTEM, /\$\d/);
});
