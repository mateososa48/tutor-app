// The engine's lesson state, kept as session events (Oct 31 2026, Plan B B8).
// Plan B asked for a lesson_state column with compare-and-set. Preview and
// production share one Neon database, so a new column means a production
// migration before anyone can try the engine; an event per revision needs
// none, and the recorder's replay already reads the session's events. The
// newest "lesson.state" event is the state; its revision is checked before a
// write, so a second tab cannot silently overwrite the first.

import { and, desc, eq } from "drizzle-orm";
import { db } from "./client";
import { sessionEvents } from "./schema";
import { appendSessionEvents } from "./session-events";
import type { LessonState } from "../lesson/types";

export async function loadLesson(sessionId: string): Promise<LessonState | null> {
  const [row] = await db
    .select({ payload: sessionEvents.payload })
    .from(sessionEvents)
    .where(and(eq(sessionEvents.sessionId, sessionId), eq(sessionEvents.kind, "lesson.state")))
    .orderBy(desc(sessionEvents.seq))
    .limit(1);
  const state = (row?.payload as { state?: LessonState } | undefined)?.state;
  return state && state.v === 1 ? state : null;
}

/**
 * Save a new revision. Refused (false) when the stored revision is not the one
 * this write started from: another request moved the lesson on.
 */
export async function saveLesson(sessionId: string, expected: number | null, next: LessonState, extra: Array<{ kind: string; payload: Record<string, unknown> }> = [], offsetMs = 0): Promise<boolean> {
  if (expected !== null) {
    const now = await loadLesson(sessionId);
    if (now && now.revision !== expected) return false;
  }
  await appendSessionEvents(sessionId, [
    ...extra.map((e) => ({ kind: e.kind, actor: "system", offsetMs, payload: e.payload })),
    { kind: "lesson.state", actor: "system", offsetMs, payload: { state: next as unknown as Record<string, unknown> } },
  ]);
  return true;
}
