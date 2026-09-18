import { test } from "node:test";
import assert from "node:assert/strict";
import { TutorRuntime, type TutoringDomainEvent } from "./tutor-runtime";
import { problemFingerprint } from "./learning-evidence";

test("teaching moves raise effective help and the ledger clears after an answer", () => {
  const events: TutoringDomainEvent[] = [];
  const runtime = new TutorRuntime({ startedAt: 0, onEvent: (event) => events.push(event) });
  const move = runtime.runTool("record_teaching_move", {
    skill: "solving two step equations",
    help_level: "H1",
    move: "shown_step",
    diagnosis: "subtracts on only one side",
    strategy: "counterexample",
    intent: "make equality visible",
  }, 100, "move-1");
  assert.ok(move?.success);
  const moveEvent = events.find((event) => event.type === "teaching_move.recorded");
  assert.equal(moveEvent?.type === "teaching_move.recorded" ? moveEvent.teachingMove.helpLevel : null, 4, "a shown step is H4 even if the model under-reports it");

  const checked = runtime.runTool("check_answer", {
    problem: "2x + 3 = 11",
    student_answer: "x = 4",
    skill: "two-step equations",
    help_level: "H1",
  }, 200, "attempt-1");
  assert.ok(checked?.success);
  assert.equal(runtime.policy.attempts.at(-1)?.help, 4, "observable help beats the model's lower claim");
  const attemptEvent = events.find((event) => event.type === "attempt.recorded");
  assert.equal(attemptEvent?.type === "attempt.recorded" ? attemptEvent.attempt.helpLevel : null, 4);
  assert.equal(attemptEvent?.type === "attempt.recorded" ? attemptEvent.attempt.skillKey : null, "equations.two-step");
  assert.equal(attemptEvent?.type === "attempt.recorded" ? attemptEvent.attempt.problemFingerprint : null, problemFingerprint("2x + 3 = 11"));

  runtime.runTool("check_answer", {
    problem: "3x - 5 = 16",
    student_answer: "x = 7",
    skill: "two step equations",
    help_level: "H0",
  }, 300, "attempt-2");
  assert.equal(runtime.policy.attempts.at(-1)?.help, 0, "help from the previous problem does not leak");
});

test("missing help is conservatively recorded as supported, never independent", () => {
  const runtime = new TutorRuntime({ startedAt: 0 });
  runtime.runTool("check_answer", {
    problem: "25% of 80",
    student_answer: "20",
    skill: "percent of an amount",
  }, 100, "attempt-1");
  assert.equal(runtime.policy.attempts.at(-1)?.help, 1);
});

test("hydration rebuilds session policy without re-emitting events", () => {
  const emitted: TutoringDomainEvent[] = [];
  const runtime = new TutorRuntime({ startedAt: 0, onEvent: (event) => emitted.push(event) });
  runtime.hydrate({
    attempts: [{
      id: "a1",
      callId: "call-a1",
      skillKey: "graphs.slope",
      rawSkill: "slope",
      problem: "slope through (0,0) and (2,4)",
      problemFingerprint: "p_test",
      studentAnswer: "2",
      result: "correct",
      helpLevel: 0,
      occurredAt: 50,
      cancelledAt: null,
    }],
    teachingMoves: [],
  });
  assert.equal(runtime.policy.attempts.length, 1);
  assert.equal(runtime.policy.currentSkill, "slope");
  assert.deepEqual(emitted, []);
});

test("cancelling a call rolls back active policy and emits an audit event", () => {
  const emitted: TutoringDomainEvent[] = [];
  const runtime = new TutorRuntime({ startedAt: 0, onEvent: (event) => emitted.push(event) });
  runtime.runTool("check_answer", {
    problem: "7 + 8",
    student_answer: "15",
    skill: "addition",
    help_level: "H0",
  }, 100, "attempt-1");
  assert.equal(runtime.cancelToolCall("attempt-1", 200), true);
  assert.equal(runtime.policy.attempts.length, 0);
  assert.ok(emitted.some((event) => event.type === "evidence.cancelled" && event.callId === "attempt-1"));
});

test("an event sink can be attached after React creates the runtime", () => {
  const events: TutoringDomainEvent[] = [];
  const runtime = new TutorRuntime({ startedAt: 0 });
  runtime.setEventSink((event) => events.push(event));
  runtime.runTool("record_teaching_move", { skill: "slope", help_level: "H2", move: "point" }, 100, "move-1");
  assert.equal(events.length, 1);
  runtime.setEventSink();
  runtime.runTool("record_teaching_move", { skill: "slope", help_level: "H2", move: "point" }, 200, "move-2");
  assert.equal(events.length, 1);
});
