import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  buildLearnerBrief,
  focusSkillStates,
  problemFingerprint,
  projectSkillEvidence,
  type LearningAttemptEvidence,
} from "./learning-evidence";
import { resolveSkill } from "./skill-catalog";

const NOW = Date.UTC(2026, 8, 17, 18);
const skill = resolveSkill("two step equations")!;

function attempt(overrides: Partial<LearningAttemptEvidence> = {}): LearningAttemptEvidence {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    skillKey: overrides.skillKey === undefined ? skill.key : overrides.skillKey,
    rawSkill: overrides.rawSkill ?? skill.label,
    problem: overrides.problem ?? "2x + 3 = 11",
    problemFingerprint: overrides.problemFingerprint ?? problemFingerprint(overrides.problem ?? "2x + 3 = 11"),
    studentAnswer: overrides.studentAnswer ?? "x = 4",
    result: overrides.result ?? "correct",
    helpLevel: overrides.helpLevel ?? 0,
    occurredAt: overrides.occurredAt ?? NOW - 1_000,
    cancelledAt: overrides.cancelledAt ?? null,
  };
}

test("normalizes equivalent problem text into a stable non-plain fingerprint", () => {
  assert.equal(problemFingerprint(" 2X  +  3 = 11 "), problemFingerprint("2x + 3=11"));
  assert.notEqual(problemFingerprint("2x + 3 = 11"), problemFingerprint("2x + 5 = 11"));
  assert.doesNotMatch(problemFingerprint("2x + 3 = 11"), /2x/);
});

test("separates building, supported, and recent independent evidence", () => {
  assert.equal(projectSkillEvidence(skill, [attempt({ result: "incorrect" })], NOW)?.status, "building");
  const supported = projectSkillEvidence(skill, [attempt({ helpLevel: 2 })], NOW)!;
  assert.equal(supported.status, "supported");
  assert.match(supported.evidenceNote, /correct with H2 support/i);
  const independent = projectSkillEvidence(skill, [attempt({ helpLevel: 0 })], NOW)!;
  assert.equal(independent.status, "independent_recent");
  assert.match(independent.evidenceNote, /independently/i);
});

test("makes independent evidence review-due after 24 hours", () => {
  const state = projectSkillEvidence(skill, [attempt({ occurredAt: NOW - DAY_MS - 1 })], NOW)!;
  assert.equal(state.status, "review_due");
  assert.equal(state.lastIndependentAt, NOW - DAY_MS - 1);
});

test("retention requires delayed H0 successes on distinct problems", () => {
  const first = attempt({ problem: "2x + 3 = 11", occurredAt: NOW - 2 * DAY_MS });
  const later = attempt({ problem: "3x - 5 = 16", occurredAt: NOW - DAY_MS + 1 });
  assert.equal(projectSkillEvidence(skill, [first, later], NOW)?.status, "retained");

  const repeated = attempt({ problem: "2x+3=11", occurredAt: NOW - DAY_MS + 1 });
  assert.notEqual(projectSkillEvidence(skill, [first, repeated], NOW)?.status, "retained", "same problem is not delayed retrieval evidence");

  const helped = attempt({ problem: "3x - 5 = 16", helpLevel: 1, occurredAt: NOW - DAY_MS + 1 });
  assert.notEqual(projectSkillEvidence(skill, [first, helped], NOW)?.status, "retained", "helped success is not independent evidence");
});

test("later substantive misses reopen a skill, while a slip does not erase retention", () => {
  const retained = [
    attempt({ problem: "2x + 3 = 11", occurredAt: NOW - 3 * DAY_MS }),
    attempt({ problem: "3x - 5 = 16", occurredAt: NOW - DAY_MS }),
  ];
  const slip = attempt({ problem: "5x + 1 = 21", result: "slip", occurredAt: NOW - 500 });
  assert.equal(projectSkillEvidence(skill, [...retained, slip], NOW)?.status, "retained");
  for (const result of ["incorrect", "misconception", "guess", "stuck"] as const) {
    assert.equal(projectSkillEvidence(skill, [...retained, attempt({ result, occurredAt: NOW - 400 })], NOW)?.status, "needs_revisit", result);
  }
});

test("ignores unchecked and cancelled attempts in the projection", () => {
  const attempts = [
    attempt({ result: "unchecked" }),
    attempt({ result: "correct", cancelledAt: NOW }),
  ];
  assert.equal(projectSkillEvidence(skill, attempts, NOW), null);
});

test("focus ranking favors actionable evidence and the brief stays concise", () => {
  const definitions = [
    resolveSkill("slope")!,
    resolveSkill("two step equations")!,
    resolveSkill("percent of an amount")!,
    resolveSkill("integer operations")!,
  ];
  const states = [
    projectSkillEvidence(definitions[0], [
      attempt({ skillKey: definitions[0].key, rawSkill: definitions[0].label, occurredAt: NOW - 10_000 }),
      attempt({ skillKey: definitions[0].key, rawSkill: definitions[0].label, result: "incorrect", occurredAt: NOW - 1_000 }),
    ], NOW)!,
    projectSkillEvidence(definitions[1], [attempt({ helpLevel: 2 })], NOW)!,
    projectSkillEvidence(definitions[2], [attempt({ skillKey: definitions[2].key, rawSkill: definitions[2].label, occurredAt: NOW - 2 * DAY_MS })], NOW)!,
    projectSkillEvidence(definitions[3], [attempt({ skillKey: definitions[3].key, rawSkill: definitions[3].label })], NOW)!,
  ];
  const focused = focusSkillStates(states, 3);
  assert.deepEqual(focused.map((state) => state.status), ["needs_revisit", "review_due", "supported"]);
  const brief = buildLearnerBrief(states, 3);
  assert.match(brief, /^\[Learner evidence:/);
  assert.ok(brief.length < 600, brief);
  assert.doesNotMatch(brief, /Integer operations/, "only three priorities are included");
  assert.equal(buildLearnerBrief([], 3), "");
});
