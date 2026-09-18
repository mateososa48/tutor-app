import { and, asc, eq } from "drizzle-orm";
import { checkAnswer } from "../answer-check";
import { problemFingerprint, projectSkillEvidence, type LearningAttemptEvidence } from "../learning-evidence";
import { resolveSkill, SKILL_CATALOG } from "../skill-catalog";
import { attemptFromVerdict, REMEDIATION_STRATEGIES, TEACHING_MOVE_TYPES } from "../tutor-tools";
import { ATTEMPT_RESULTS, type AttemptResult } from "../tutor-policy";
import type { TeachingMoveEvidence } from "../tutor-runtime";
import { db } from "./client";
import { learnerSkillStates, learningAttempts, teachingMoves } from "./schema";

export type PreparedLearningEvent =
  | { type: "attempt.recorded"; attempt: LearningAttemptEvidence }
  | { type: "teaching_move.recorded"; teachingMove: TeachingMoveEvidence }
  | { type: "evidence.cancelled"; callId: string; occurredAt: number };

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function timestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.round(value))
    : null;
}

function helpLevel(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5 ? value : null;
}

function prepareAttempt(raw: Record<string, unknown>): PreparedLearningEvent | null {
  const attempt = recordOf(raw.attempt);
  if (!attempt) return null;
  const id = text(attempt.id, 160);
  const rawSkill = text(attempt.rawSkill, 120);
  const problem = text(attempt.problem, 300);
  const studentAnswer = text(attempt.studentAnswer, 200);
  const occurredAt = timestamp(attempt.occurredAt);
  const help = helpLevel(attempt.helpLevel);
  if (!id || !rawSkill || !problem || !studentAnswer || occurredAt === null || help === null) return null;
  const check = checkAnswer(problem, studentAnswer);
  const observedKind = typeof attempt.result === "string" && ["slip", "misconception", "guess"].includes(attempt.result) ? attempt.result : undefined;
  const result = attemptFromVerdict(check.verdict, observedKind);
  return {
    type: "attempt.recorded",
    attempt: {
      id,
      ...(text(attempt.callId, 160) ? { callId: text(attempt.callId, 160)! } : {}),
      skillKey: resolveSkill(rawSkill)?.key ?? null,
      rawSkill,
      problem,
      problemFingerprint: problemFingerprint(problem),
      studentAnswer,
      result,
      helpLevel: help,
      occurredAt,
      cancelledAt: timestamp(attempt.cancelledAt),
    },
  };
}

function prepareTeachingMove(raw: Record<string, unknown>): PreparedLearningEvent | null {
  const move = recordOf(raw.teachingMove);
  if (!move) return null;
  const id = text(move.id, 160);
  const rawSkill = text(move.rawSkill, 120);
  const occurredAt = timestamp(move.occurredAt);
  const help = helpLevel(move.helpLevel);
  const moveType = typeof move.move === "string" && (TEACHING_MOVE_TYPES as readonly string[]).includes(move.move) ? move.move as TeachingMoveEvidence["move"] : null;
  const strategy = typeof move.strategy === "string" && (REMEDIATION_STRATEGIES as readonly string[]).includes(move.strategy)
    ? move.strategy as TeachingMoveEvidence["strategy"]
    : null;
  if (!id || !rawSkill || occurredAt === null || help === null || !moveType) return null;
  if (move.strategy !== undefined && move.strategy !== null && strategy === null) return null;
  return {
    type: "teaching_move.recorded",
    teachingMove: {
      id,
      ...(text(move.callId, 160) ? { callId: text(move.callId, 160)! } : {}),
      skillKey: resolveSkill(rawSkill)?.key ?? null,
      rawSkill,
      helpLevel: help,
      move: moveType,
      diagnosis: text(move.diagnosis, 240),
      strategy,
      intent: text(move.intent, 240),
      occurredAt,
      cancelledAt: timestamp(move.cancelledAt),
    },
  };
}

/** Validate untrusted browser events and recompute every derivable field server-side. */
export function prepareLearningEvents(raws: readonly unknown[]): PreparedLearningEvent[] {
  const prepared: PreparedLearningEvent[] = [];
  const ids = new Set<string>();
  for (const rawValue of raws) {
    const raw = recordOf(rawValue);
    if (!raw || typeof raw.type !== "string") continue;
    let event: PreparedLearningEvent | null = null;
    if (raw.type === "attempt.recorded") event = prepareAttempt(raw);
    else if (raw.type === "teaching_move.recorded") event = prepareTeachingMove(raw);
    else if (raw.type === "evidence.cancelled") {
      const callId = text(raw.callId, 160);
      const occurredAt = timestamp(raw.occurredAt);
      if (callId && occurredAt !== null) event = { type: "evidence.cancelled", callId, occurredAt };
    }
    if (!event) continue;
    if (event.type !== "evidence.cancelled") {
      const id = event.type === "attempt.recorded" ? event.attempt.id : event.teachingMove.id;
      if (ids.has(id)) continue;
      ids.add(id);
    }
    prepared.push(event);
  }
  return prepared;
}

async function reprojectSkill(userId: string, skillKey: string): Promise<void> {
  const definition = SKILL_CATALOG.find((skill) => skill.key === skillKey);
  if (!definition) return;
  const rows = await db
    .select()
    .from(learningAttempts)
    .where(and(eq(learningAttempts.userId, userId), eq(learningAttempts.skillKey, skillKey)))
    .orderBy(asc(learningAttempts.occurredAt), asc(learningAttempts.id));
  const attempts: LearningAttemptEvidence[] = rows
    .filter((row) => ATTEMPT_RESULTS.includes(row.result as AttemptResult))
    .map((row) => ({
      id: row.id,
      ...(row.callId ? { callId: row.callId } : {}),
      skillKey: row.skillKey,
      rawSkill: row.rawSkill,
      problem: row.problem,
      problemFingerprint: row.problemFingerprint,
      studentAnswer: row.studentAnswer,
      result: row.result as AttemptResult,
      helpLevel: row.helpLevel,
      occurredAt: row.occurredAt,
      cancelledAt: row.cancelledAt,
    }));
  const state = projectSkillEvidence(definition, attempts);
  if (!state) {
    await db.delete(learnerSkillStates).where(and(eq(learnerSkillStates.userId, userId), eq(learnerSkillStates.skillKey, skillKey)));
    return;
  }
  await db.insert(learnerSkillStates).values({
    userId,
    skillKey,
    status: state.status,
    attemptCount: state.attemptCount,
    correctCount: state.correctCount,
    independentCorrectCount: state.independentCorrectCount,
    distinctIndependentProblemCount: state.distinctIndependentProblemCount,
    latestAttemptAt: state.latestAttemptAt,
    lastCorrectAt: state.lastCorrectAt,
    lastIndependentAt: state.lastIndependentAt,
    retainedAt: state.retainedAt,
    effectiveHelpLevel: state.effectiveHelpLevel,
    evidenceNote: state.evidenceNote,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [learnerSkillStates.userId, learnerSkillStates.skillKey],
    set: {
      status: state.status,
      attemptCount: state.attemptCount,
      correctCount: state.correctCount,
      independentCorrectCount: state.independentCorrectCount,
      distinctIndependentProblemCount: state.distinctIndependentProblemCount,
      latestAttemptAt: state.latestAttemptAt,
      lastCorrectAt: state.lastCorrectAt,
      lastIndependentAt: state.lastIndependentAt,
      retainedAt: state.retainedAt,
      effectiveHelpLevel: state.effectiveHelpLevel,
      evidenceNote: state.evidenceNote,
      updatedAt: new Date(),
    },
  });
}

export async function storeLearningEvents(userId: string, sessionId: string, events: readonly PreparedLearningEvent[]): Promise<number> {
  const affectedSkills = new Set<string>();
  let stored = 0;
  for (const event of events) {
    if (event.type === "attempt.recorded") {
      const attempt = event.attempt;
      await db.insert(learningAttempts).values({
        id: attempt.id,
        sessionId,
        userId,
        callId: attempt.callId ?? null,
        skillKey: attempt.skillKey,
        rawSkill: attempt.rawSkill,
        problem: attempt.problem,
        problemFingerprint: attempt.problemFingerprint,
        studentAnswer: attempt.studentAnswer,
        result: attempt.result,
        helpLevel: attempt.helpLevel,
        occurredAt: attempt.occurredAt,
        cancelledAt: attempt.cancelledAt,
      }).onConflictDoNothing();
      if (attempt.skillKey) affectedSkills.add(attempt.skillKey);
      stored += 1;
    } else if (event.type === "teaching_move.recorded") {
      const move = event.teachingMove;
      await db.insert(teachingMoves).values({
        id: move.id,
        sessionId,
        userId,
        callId: move.callId ?? null,
        skillKey: move.skillKey,
        rawSkill: move.rawSkill,
        helpLevel: move.helpLevel,
        move: move.move,
        diagnosis: move.diagnosis,
        strategy: move.strategy,
        intent: move.intent,
        occurredAt: move.occurredAt,
        cancelledAt: move.cancelledAt,
      }).onConflictDoNothing();
      stored += 1;
    } else {
      const attemptsToCancel = await db.select({ skillKey: learningAttempts.skillKey }).from(learningAttempts)
        .where(and(eq(learningAttempts.sessionId, sessionId), eq(learningAttempts.userId, userId), eq(learningAttempts.callId, event.callId)));
      for (const row of attemptsToCancel) if (row.skillKey) affectedSkills.add(row.skillKey);
      await db.update(learningAttempts).set({ cancelledAt: event.occurredAt })
        .where(and(eq(learningAttempts.sessionId, sessionId), eq(learningAttempts.userId, userId), eq(learningAttempts.callId, event.callId)));
      await db.update(teachingMoves).set({ cancelledAt: event.occurredAt })
        .where(and(eq(teachingMoves.sessionId, sessionId), eq(teachingMoves.userId, userId), eq(teachingMoves.callId, event.callId)));
      stored += 1;
    }
  }
  await Promise.all([...affectedSkills].map((skillKey) => reprojectSkill(userId, skillKey)));
  return stored;
}

export async function loadSessionLearning(userId: string, sessionId: string): Promise<{ attempts: LearningAttemptEvidence[]; teachingMoves: TeachingMoveEvidence[] }> {
  const [attemptRows, moveRows] = await Promise.all([
    db.select().from(learningAttempts).where(and(eq(learningAttempts.userId, userId), eq(learningAttempts.sessionId, sessionId))).orderBy(asc(learningAttempts.occurredAt), asc(learningAttempts.id)),
    db.select().from(teachingMoves).where(and(eq(teachingMoves.userId, userId), eq(teachingMoves.sessionId, sessionId))).orderBy(asc(teachingMoves.occurredAt), asc(teachingMoves.id)),
  ]);
  return {
    attempts: attemptRows.map((row) => ({
      id: row.id,
      ...(row.callId ? { callId: row.callId } : {}),
      skillKey: row.skillKey,
      rawSkill: row.rawSkill,
      problem: row.problem,
      problemFingerprint: row.problemFingerprint,
      studentAnswer: row.studentAnswer,
      result: row.result as AttemptResult,
      helpLevel: row.helpLevel,
      occurredAt: row.occurredAt,
      cancelledAt: row.cancelledAt,
    })),
    teachingMoves: moveRows.map((row) => ({
      id: row.id,
      ...(row.callId ? { callId: row.callId } : {}),
      skillKey: row.skillKey,
      rawSkill: row.rawSkill,
      helpLevel: row.helpLevel,
      move: row.move as TeachingMoveEvidence["move"],
      diagnosis: row.diagnosis,
      strategy: row.strategy as TeachingMoveEvidence["strategy"],
      intent: row.intent,
      occurredAt: row.occurredAt,
      cancelledAt: row.cancelledAt,
    })),
  };
}

