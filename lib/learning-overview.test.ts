import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLearningOverview, type StoredSkillState } from "./learning-overview";
import { DAY_MS } from "./learning-evidence";
import { homeFocusItems } from "./home-focus";

const NOW = Date.UTC(2026, 8, 17, 18);

function row(overrides: Partial<StoredSkillState> = {}): StoredSkillState {
  return {
    skillKey: overrides.skillKey ?? "equations.two-step",
    status: overrides.status ?? "supported",
    attemptCount: overrides.attemptCount ?? 2,
    correctCount: overrides.correctCount ?? 1,
    independentCorrectCount: overrides.independentCorrectCount ?? 0,
    distinctIndependentProblemCount: overrides.distinctIndependentProblemCount ?? 0,
    latestAttemptAt: overrides.latestAttemptAt ?? NOW - 1_000,
    lastCorrectAt: overrides.lastCorrectAt ?? NOW - 1_000,
    lastIndependentAt: overrides.lastIndependentAt ?? null,
    retainedAt: overrides.retainedAt ?? null,
    effectiveHelpLevel: overrides.effectiveHelpLevel ?? 2,
    evidenceNote: overrides.evidenceNote ?? "Last answer was correct with H2 support.",
  };
}

test("returns an honest empty overview for a new learner", () => {
  assert.deepEqual(buildLearningOverview([], NOW), { states: [], focus: [], brief: "" });
});

test("refreshes time-based review status and orders only three priorities", () => {
  const overview = buildLearningOverview([
    row({ skillKey: "graphs.slope", status: "needs_revisit", evidenceNote: "Latest evidence was misconception after earlier success." }),
    row({ skillKey: "percent.of", status: "independent_recent", lastIndependentAt: NOW - DAY_MS - 1, effectiveHelpLevel: 0 }),
    row(),
    row({ skillKey: "fractions.add-unlike", status: "building", correctCount: 0, lastCorrectAt: null, evidenceNote: "Practice has started; no correct checked answer yet." }),
  ], NOW);
  assert.deepEqual(overview.focus.map((item) => item.status), ["needs_revisit", "review_due", "supported"]);
  assert.equal(overview.states.find((item) => item.skillKey === "percent.of")?.status, "review_due");
  assert.match(overview.brief, /Follow the student's explicit goal/);
  assert.doesNotMatch(overview.brief, /Adding fractions with unlike denominators/);
});

test("drops stale or unknown catalog keys rather than inventing a label", () => {
  assert.deepEqual(buildLearningOverview([row({ skillKey: "unknown.client-skill" })], NOW), { states: [], focus: [], brief: "" });
});

test("home focus labels describe evidence instead of claiming mastery", () => {
  const overview = buildLearningOverview([
    row({ status: "supported" }),
    row({ skillKey: "graphs.slope", status: "needs_revisit", evidenceNote: "Latest evidence was incorrect after earlier success." }),
  ], NOW);
  assert.deepEqual(homeFocusItems(overview.focus).map((item) => [item.label, item.strength]), [
    ["Revisit", 1],
    ["With support", 2],
  ]);
  assert.equal(homeFocusItems([]).length, 0);
});
