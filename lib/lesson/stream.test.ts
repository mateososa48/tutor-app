import { test } from "node:test";
import assert from "node:assert/strict";
import { earlySentence, scanPartial } from "./stream";
import { commitInput, createLesson } from "./state";

const full = JSON.stringify({ move: "repair", question: { ask: "What do four hours cost?", kind: "value", expects: "23" }, speech: [{ say: "Four hours is right." }, { say: "Five times four plus three is twenty-three." }], board: [] });

test("a partial plan gives up its complete fields and speech items as they arrive", () => {
  const cut = full.slice(0, full.indexOf("Five times"));
  const p = scanPartial(cut);
  assert.equal(p.fields.move, "repair");
  assert.deepEqual((p.fields.question as { expects: string }).expects, "23");
  assert.equal(p.speech.length, 1);
  assert.ok(!("speech" in p.fields));
  assert.equal(scanPartial(full).speech.length, 2);
  assert.deepEqual(scanPartial('{"move": "expl').fields, {});
  assert.deepEqual(scanPartial('{"close": tr').fields, {});
});

test("the first sentence is said early only when it is safe on its own", () => {
  const s0 = createLesson({ intake: "A bike rental costs $3 to start plus $5 per hour. My budget is $23. What is the most hours I can rent it?" });
  const { state, assessment } = commitInput(s0, { id: "u1", source: "typed", text: "I got 4 hours because 5 times 4 plus 3 is 24, which is under 23. Is my reasoning right?", at: 1 });
  const plan = (first: string, extra: Record<string, unknown> = {}) => scanPartial(JSON.stringify({ move: "repair", question: { ask: "What would five hours cost?", kind: "value", expects: "28" }, ...extra, speech: [{ say: first }] }).slice(0, -2));
  assert.equal(earlySentence(state, assessment, plan("Four hours is right.")), "Four hours is right.");
  // False math, the answer given away, or a board part it talks about: not early.
  assert.equal(earlySentence(state, assessment, plan("Five times four plus three is twenty-four.")), null);
  assert.equal(earlySentence(state, assessment, plan("Five hours would cost twenty-eight dollars.")), null);
  // The budget is given, so saying it gives nothing away.
  assert.equal(earlySentence(state, assessment, plan("Four hours costs twenty-three dollars.")), "Four hours costs twenty-three dollars.");
  assert.equal(earlySentence(state, assessment, scanPartial(JSON.stringify({ move: "explain", question: null, speech: [{ say: "Look at the diagonal.", needs: ["fig1.diagonal"] }] }).slice(0, -2))), null);
  // No question yet: a sentence with a new number waits for the whole plan.
  assert.equal(earlySentence(state, assessment, scanPartial(JSON.stringify({ move: "explain", speech: [{ say: "That makes twenty dollars." }] }).slice(0, -2))), null);
});
