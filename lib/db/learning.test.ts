import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareLearningEvents } from "./learning";

test("server recomputes verdict, fingerprint, and canonical skill", () => {
  const prepared = prepareLearningEvents([{
    type: "attempt.recorded",
    attempt: {
      id: "attempt_1",
      callId: "call_1",
      skillKey: "made.up.client-key",
      rawSkill: "adding fractions with unlike denominators",
      problem: "1/2 + 1/3",
      problemFingerprint: "client-lie",
      studentAnswer: "2/5",
      result: "correct",
      helpLevel: 2,
      occurredAt: 100,
      cancelledAt: null,
    },
  }]);
  assert.equal(prepared.length, 1);
  const event = prepared[0];
  assert.equal(event.type, "attempt.recorded");
  if (event.type !== "attempt.recorded") return;
  assert.equal(event.attempt.result, "incorrect");
  assert.equal(event.attempt.skillKey, "fractions.add-unlike");
  assert.notEqual(event.attempt.problemFingerprint, "client-lie");
});

test("keeps an observed wrong-answer kind but never lets it override a correct verdict", () => {
  const wrong = prepareLearningEvents([{
    type: "attempt.recorded",
    attempt: {
      id: "a1", rawSkill: "two step equations", problem: "2x+3=11", studentAnswer: "x=5",
      result: "misconception", helpLevel: 1, occurredAt: 10,
    },
  }]);
  assert.equal(wrong[0]?.type === "attempt.recorded" ? wrong[0].attempt.result : null, "misconception");
  const right = prepareLearningEvents([{
    type: "attempt.recorded",
    attempt: {
      id: "a2", rawSkill: "two step equations", problem: "2x+3=11", studentAnswer: "x=4",
      result: "misconception", helpLevel: 1, occurredAt: 11,
    },
  }]);
  assert.equal(right[0]?.type === "attempt.recorded" ? right[0].attempt.result : null, "correct");
});

test("validates, bounds, and deduplicates incoming evidence", () => {
  const raw = {
    type: "teaching_move.recorded",
    teachingMove: {
      id: "move_1", callId: "call_1", rawSkill: "slope", helpLevel: 4,
      move: "shown_step", diagnosis: "  swapped rise and run  ", strategy: "visual_model", intent: "show the vertical change", occurredAt: 50,
    },
  };
  const prepared = prepareLearningEvents([raw, raw, { ...raw, teachingMove: { ...raw.teachingMove, id: "bad", helpLevel: 9 } }]);
  assert.equal(prepared.length, 1);
  const event = prepared[0];
  assert.equal(event.type, "teaching_move.recorded");
  if (event.type !== "teaching_move.recorded") return;
  assert.equal(event.teachingMove.skillKey, "graphs.slope");
  assert.equal(event.teachingMove.diagnosis, "swapped rise and run");
});

test("unknown skills stay unresolved and cancellation is a bounded audit event", () => {
  const prepared = prepareLearningEvents([
    {
      type: "attempt.recorded",
      attempt: { id: "a1", rawSkill: "train word problem", problem: "12 / 3", studentAnswer: "4", result: "correct", helpLevel: 0, occurredAt: 1 },
    },
    { type: "evidence.cancelled", callId: " call_1 ", occurredAt: 2 },
  ]);
  assert.equal(prepared[0]?.type === "attempt.recorded" ? prepared[0].attempt.skillKey : "missing", null);
  assert.deepEqual(prepared[1], { type: "evidence.cancelled", callId: "call_1", occurredAt: 2 });
});

