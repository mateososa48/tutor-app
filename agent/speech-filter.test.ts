import { test } from "node:test";
import assert from "node:assert/strict";
import { SpeechFilter } from "./speech-filter";

const say = (...chunks: string[]) => {
  const f = new SpeechFilter();
  return chunks.map((c) => f.push(c)).join("") + f.end();
};

test("a praise opener is cut, the rest is kept", () => {
  assert.equal(say("Spot on. Zero point five", " is the same as zero point fifty."), "Zero point five is the same as zero point fifty.");
  assert.equal(say("Yes. Four in, eleven out."), "Four in, eleven out.");
});

test("a sentence that is only praise is dropped whole", () => {
  assert.equal(say("Exactly! ", "Now try this."), "Now try this.");
});

test("a question passes untouched", () => {
  assert.equal(say("How did you ", "get fifteen?"), "How did you get fifteen?");
});

test("markdown and LaTeX symbols are not spoken", () => {
  assert.equal(say("Let's use **bars** and $x$."), "Let's use bars and x.");
});

test("a tool call written as text ends the reply", () => {
  assert.equal(say("How many for two cups? ", 'setplan(steps="Find cookies")', " more"), "How many for two cups? ");
});
