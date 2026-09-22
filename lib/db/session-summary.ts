import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "./client";
import { learningAttempts, sessionEvents, sessionFrames, tutorSessions, users, userProfiles } from "./schema";
import { buildMarkdownExport, type TimelineEvent } from "../session-recording";
import { EMPTY_STATS, type SessionStats } from "../session-summary";

// Everything the summary worker needs from the database: the counts (which the
// model is never asked for), the session as text, and the small queue the
// sweeper walks.

export const MAX_TRIES = 3;

/** Counts from the deterministic record, so a summary can never get them wrong. */
export async function sessionStats(sessionId: string, durationSec: number): Promise<SessionStats> {
  const [attempts, frames] = await Promise.all([
    db
      .select({ skillKey: learningAttempts.skillKey, result: learningAttempts.result, helpLevel: learningAttempts.helpLevel })
      .from(learningAttempts)
      .where(and(eq(learningAttempts.sessionId, sessionId), sql`${learningAttempts.cancelledAt} is null`)),
    db.select({ n: sql<number>`count(*)::int` }).from(sessionFrames).where(eq(sessionFrames.sessionId, sessionId)),
  ]);

  // "unchecked" counts neither way, the same rule the learner model uses.
  const checked = attempts.filter((a) => a.result !== "unchecked");
  const correct = checked.filter((a) => a.result === "correct");
  const skills = [...new Set(checked.map((a) => a.skillKey).filter((k): k is string => Boolean(k)))];

  return {
    durationSec,
    checked: checked.length,
    correct: correct.length,
    independent: correct.filter((a) => a.helpLevel === 0).length,
    skills,
    pictures: frames[0]?.n ?? 0,
  };
}

/** The session as the markdown the admin replay exports, which is the agent's input. */
export async function sessionAsText(sessionId: string): Promise<string | null> {
  const [row] = await db
    .select({
      id: tutorSessions.id,
      title: tutorSessions.title,
      userId: tutorSessions.userId,
      startedAt: tutorSessions.startedAt,
      durationSec: tutorSessions.durationSec,
      name: users.name,
    })
    .from(tutorSessions)
    .leftJoin(users, eq(users.id, tutorSessions.userId))
    .where(eq(tutorSessions.id, sessionId))
    .limit(1);
  if (!row) return null;

  const events = await db
    .select()
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, sessionId))
    .orderBy(asc(sessionEvents.seq));

  const timeline: TimelineEvent[] = events.map((e) => ({
    kind: e.kind,
    actor: e.actor,
    offsetMs: e.offsetMs,
    seq: e.seq,
    cseq: e.clientSeq,
    payload: (e.payload ?? {}) as Record<string, unknown>,
  }));

  return buildMarkdownExport({
    sessionId: row.id,
    title: row.title,
    studentName: row.name ?? null,
    // The note is about the work, not about who they are.
    studentEmail: null,
    startedAt: row.startedAt,
    durationSec: row.durationSec,
    events: timeline,
    frameUrl: () => "(picture)",
  });
}

export type SummaryJob = {
  id: string;
  userId: string;
  durationSec: number;
  state: string;
  tries: number;
};

export async function summaryJob(sessionId: string): Promise<SummaryJob | null> {
  const [row] = await db
    .select({
      id: tutorSessions.id,
      userId: tutorSessions.userId,
      durationSec: tutorSessions.durationSec,
      state: tutorSessions.summaryState,
      tries: tutorSessions.summaryTries,
    })
    .from(tutorSessions)
    .where(eq(tutorSessions.id, sessionId))
    .limit(1);
  return row ?? null;
}

/** Queues a finished session. Never moves one that is already written. */
export async function queueSummary(sessionId: string): Promise<void> {
  await db
    .update(tutorSessions)
    .set({ summaryState: "pending" })
    .where(and(eq(tutorSessions.id, sessionId), inArray(tutorSessions.summaryState, ["none", "failed"])));
}

export async function storeSummary(sessionId: string, summary: unknown): Promise<void> {
  await db
    .update(tutorSessions)
    .set({ summary, summaryState: "done", summaryError: null })
    .where(eq(tutorSessions.id, sessionId));
}

export async function failSummary(sessionId: string, message: string, tries: number): Promise<void> {
  await db
    .update(tutorSessions)
    .set({
      // Out of tries is final; otherwise it stays queued for the sweeper.
      summaryState: tries >= MAX_TRIES ? "failed" : "pending",
      summaryError: message.slice(0, 300),
      summaryTries: tries,
    })
    .where(eq(tutorSessions.id, sessionId));
}

/** The oldest sessions still waiting, for the sweeper. */
export async function pendingSummaries(limit: number, olderThan: number): Promise<string[]> {
  const rows = await db
    .select({ id: tutorSessions.id })
    .from(tutorSessions)
    .where(
      and(
        eq(tutorSessions.summaryState, "pending"),
        lt(tutorSessions.endedAt, olderThan),
        lt(tutorSessions.summaryTries, MAX_TRIES),
      ),
    )
    .orderBy(asc(tutorSessions.endedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/** The student's first name, for nothing but reading naturally in the note. */
export async function studentFirstName(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ displayName: userProfiles.displayName })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  const name = row?.displayName?.trim().split(/\s+/)[0];
  return name || null;
}

export { EMPTY_STATS };
