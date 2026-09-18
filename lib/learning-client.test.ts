import { test } from "node:test";
import assert from "node:assert/strict";
import { LearningRecorder, loadSessionLearning } from "./learning-client";
import type { TutoringDomainEvent } from "./tutor-runtime";

const attemptEvent: TutoringDomainEvent = {
  type: "attempt.recorded",
  attempt: {
    id: "attempt_1",
    callId: "call_1",
    skillKey: "equations.two-step",
    rawSkill: "two step equations",
    problem: "2x+3=11",
    problemFingerprint: "p_1",
    studentAnswer: "x=4",
    result: "correct",
    helpLevel: 0,
    occurredAt: 100,
    cancelledAt: null,
  },
};

test("batches learning events in order and deduplicates immutable ids", async () => {
  const bodies: unknown[] = [];
  const recorder = new LearningRecorder("session 1", async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return { ok: true, json: async () => ({ ok: true }) };
  });
  recorder.record(attemptEvent);
  recorder.record(attemptEvent);
  recorder.record({ type: "evidence.cancelled", callId: "call_1", occurredAt: 200 });
  await recorder.flush();
  assert.deepEqual(bodies, [{ events: [attemptEvent, { type: "evidence.cancelled", callId: "call_1", occurredAt: 200 }] }]);
});

test("a failed flush keeps the batch for an ordered retry", async () => {
  let calls = 0;
  const recorder = new LearningRecorder("s1", async () => {
    calls += 1;
    return { ok: calls > 1, json: async () => ({}) };
  });
  recorder.record(attemptEvent);
  await recorder.flush();
  assert.equal(recorder.pendingCount, 1);
  await recorder.flush();
  assert.equal(recorder.pendingCount, 0);
  assert.equal(calls, 2);
});

test("loads hydration before a resumed runtime starts", async () => {
  const hydration = { attempts: [attemptEvent.attempt], teachingMoves: [] };
  const loaded = await loadSessionLearning("session/1", async (input) => {
    assert.equal(input, "/api/sessions/session%2F1/learning");
    return { ok: true, json: async () => hydration };
  });
  assert.deepEqual(loaded, hydration);
});

