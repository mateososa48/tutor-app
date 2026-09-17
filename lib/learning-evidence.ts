import type { AttemptResult } from "./tutor-policy";
import type { SkillDefinition } from "./skill-catalog";

export const DAY_MS = 24 * 60 * 60 * 1_000;

export type LearningStatus = "building" | "supported" | "independent_recent" | "review_due" | "retained" | "needs_revisit";

export type LearningAttemptEvidence = {
  id: string;
  callId?: string;
  skillKey: string | null;
  rawSkill: string;
  problem: string;
  problemFingerprint: string;
  studentAnswer: string;
  result: AttemptResult;
  helpLevel: number;
  occurredAt: number;
  cancelledAt: number | null;
};

export type LearnerSkillState = {
  skillKey: string;
  label: string;
  domain: SkillDefinition["domain"];
  status: LearningStatus;
  attemptCount: number;
  correctCount: number;
  independentCorrectCount: number;
  distinctIndependentProblemCount: number;
  latestAttemptAt: number;
  lastCorrectAt: number | null;
  lastIndependentAt: number | null;
  retainedAt: number | null;
  effectiveHelpLevel: number | null;
  evidenceNote: string;
};

function normalizeProblem(problem: string): string {
  return problem.normalize("NFKC").toLowerCase().replace(/[−–—]/g, "-").replace(/\s+/g, "").trim();
}

/** A short deterministic identifier; it groups attempts without storing another copy of the problem in projections. */
export function problemFingerprint(problem: string): string {
  const normalized = normalizeProblem(problem);
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `p_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

const SUBSTANTIVE_MISS = new Set<AttemptResult>(["incorrect", "misconception", "guess", "stuck"]);

function retentionDate(independent: LearningAttemptEvidence[]): number | null {
  for (let laterIndex = 1; laterIndex < independent.length; laterIndex++) {
    const later = independent[laterIndex];
    for (let earlierIndex = 0; earlierIndex < laterIndex; earlierIndex++) {
      const earlier = independent[earlierIndex];
      if (later.problemFingerprint !== earlier.problemFingerprint && later.occurredAt - earlier.occurredAt >= DAY_MS) return later.occurredAt;
    }
  }
  return null;
}

export function projectSkillEvidence(
  skill: SkillDefinition,
  attempts: readonly LearningAttemptEvidence[],
  now = Date.now(),
): LearnerSkillState | null {
  const relevant = attempts
    .filter((attempt) => attempt.skillKey === skill.key && attempt.cancelledAt === null && attempt.result !== "unchecked")
    .slice()
    .sort((a, b) => a.occurredAt - b.occurredAt || a.id.localeCompare(b.id));
  if (relevant.length === 0) return null;

  const correct = relevant.filter((attempt) => attempt.result === "correct");
  const independent = correct.filter((attempt) => attempt.helpLevel === 0);
  const lastCorrect = correct.at(-1) ?? null;
  const lastIndependent = independent.at(-1) ?? null;
  const retainedAt = retentionDate(independent);
  const latestAttempt = relevant[relevant.length - 1];
  const latestSubstantiveMiss = [...relevant].reverse().find((attempt) => SUBSTANTIVE_MISS.has(attempt.result)) ?? null;
  const reopened = Boolean(lastCorrect && latestSubstantiveMiss && latestSubstantiveMiss.occurredAt > lastCorrect.occurredAt);

  let status: LearningStatus;
  let evidenceNote: string;
  if (reopened) {
    status = "needs_revisit";
    evidenceNote = `Latest evidence was ${latestSubstantiveMiss!.result} after earlier success.`;
  } else if (retainedAt !== null) {
    status = "retained";
    evidenceNote = "Solved distinct problems independently at least a day apart.";
  } else if (lastIndependent) {
    if (now - lastIndependent.occurredAt >= DAY_MS) {
      status = "review_due";
      evidenceNote = "Previously solved independently; a spaced check is due.";
    } else {
      status = "independent_recent";
      evidenceNote = "Solved independently on a recent problem.";
    }
  } else if (lastCorrect) {
    status = "supported";
    evidenceNote = `Last answer was correct with H${lastCorrect.helpLevel} support.`;
  } else {
    status = "building";
    evidenceNote = "Practice has started; no correct checked answer yet.";
  }

  return {
    skillKey: skill.key,
    label: skill.label,
    domain: skill.domain,
    status,
    attemptCount: relevant.length,
    correctCount: correct.length,
    independentCorrectCount: independent.length,
    distinctIndependentProblemCount: new Set(independent.map((attempt) => attempt.problemFingerprint)).size,
    latestAttemptAt: latestAttempt.occurredAt,
    lastCorrectAt: lastCorrect?.occurredAt ?? null,
    lastIndependentAt: lastIndependent?.occurredAt ?? null,
    retainedAt,
    effectiveHelpLevel: latestAttempt.helpLevel,
    evidenceNote,
  };
}

const FOCUS_PRIORITY: Record<LearningStatus, number> = {
  needs_revisit: 0,
  review_due: 1,
  supported: 2,
  building: 3,
  independent_recent: 4,
  retained: 5,
};

export function focusSkillStates(states: readonly LearnerSkillState[], limit = 3): LearnerSkillState[] {
  if (limit <= 0) return [];
  return states
    .filter((state) => state.status !== "retained")
    .slice()
    .sort((a, b) => FOCUS_PRIORITY[a.status] - FOCUS_PRIORITY[b.status] || b.latestAttemptAt - a.latestAttemptAt || a.label.localeCompare(b.label))
    .slice(0, limit);
}

const BRIEF_STATUS: Record<LearningStatus, string> = {
  needs_revisit: "revisit",
  review_due: "spaced review due",
  supported: "successful with support",
  building: "still building",
  independent_recent: "recent independent success",
  retained: "retained",
};

export function buildLearnerBrief(states: readonly LearnerSkillState[], limit = 3): string {
  const focused = focusSkillStates(states, limit);
  if (focused.length === 0) return "";
  const items = focused.map((state) => `${state.label}: ${BRIEF_STATUS[state.status]} (${state.evidenceNote})`);
  return `[Learner evidence: ${items.join(" · ")} Use this only when relevant. Follow the student's explicit goal; at most offer one brief retrieval check. These are evidence states, not fixed ability labels.]`;
}
