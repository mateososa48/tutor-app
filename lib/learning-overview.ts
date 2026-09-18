import { eq } from "drizzle-orm";
import {
  DAY_MS,
  buildLearnerBrief,
  focusSkillStates,
  type LearnerSkillState,
  type LearningStatus,
} from "./learning-evidence";
import { SKILL_CATALOG } from "./skill-catalog";
import { db } from "./db/client";
import { learnerSkillStates } from "./db/schema";

export type StoredSkillState = {
  skillKey: string;
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

export type LearningOverview = {
  states: LearnerSkillState[];
  focus: LearnerSkillState[];
  brief: string;
};

const VALID_STATUSES = new Set<LearningStatus>(["building", "supported", "independent_recent", "review_due", "retained", "needs_revisit"]);

export function buildLearningOverview(rows: readonly StoredSkillState[], now = Date.now()): LearningOverview {
  const states: LearnerSkillState[] = [];
  for (const row of rows) {
    const skill = SKILL_CATALOG.find((candidate) => candidate.key === row.skillKey);
    if (!skill || !VALID_STATUSES.has(row.status)) continue;
    const reviewDue = row.status === "independent_recent"
      && row.lastIndependentAt !== null
      && now - row.lastIndependentAt >= DAY_MS;
    states.push({
      skillKey: row.skillKey,
      label: skill.label,
      domain: skill.domain,
      status: reviewDue ? "review_due" : row.status,
      attemptCount: row.attemptCount,
      correctCount: row.correctCount,
      independentCorrectCount: row.independentCorrectCount,
      distinctIndependentProblemCount: row.distinctIndependentProblemCount,
      latestAttemptAt: row.latestAttemptAt,
      lastCorrectAt: row.lastCorrectAt,
      lastIndependentAt: row.lastIndependentAt,
      retainedAt: row.retainedAt,
      effectiveHelpLevel: row.effectiveHelpLevel,
      evidenceNote: reviewDue ? "Previously solved independently; a spaced check is due." : row.evidenceNote,
    });
  }
  const focus = focusSkillStates(states, 3);
  return { states, focus, brief: buildLearnerBrief(states, 3) };
}

export async function loadLearningOverview(userId: string, now = Date.now()): Promise<LearningOverview> {
  try {
    const rows = await db.select().from(learnerSkillStates).where(eq(learnerSkillStates.userId, userId));
    return buildLearningOverview(rows.map((row) => ({
      skillKey: row.skillKey,
      status: row.status as LearningStatus,
      attemptCount: row.attemptCount,
      correctCount: row.correctCount,
      independentCorrectCount: row.independentCorrectCount,
      distinctIndependentProblemCount: row.distinctIndependentProblemCount,
      latestAttemptAt: row.latestAttemptAt,
      lastCorrectAt: row.lastCorrectAt,
      lastIndependentAt: row.lastIndependentAt,
      retainedAt: row.retainedAt,
      effectiveHelpLevel: row.effectiveHelpLevel,
      evidenceNote: row.evidenceNote,
    })), now);
  } catch (error) {
    console.warn("[learning] overview unavailable", error instanceof Error ? error.message : String(error));
    return { states: [], focus: [], brief: "" };
  }
}
