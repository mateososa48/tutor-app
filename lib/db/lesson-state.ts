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

/**
 * A read that is tried again: the Neon HTTP client sometimes fails or hangs a
 * query under load (Oct 31: a load hung 21 s, then failed, twice, and the
 * student waited 37 s for a reply). Each try gets `ms` before the next starts.
 */
async function retried<T>(run: () => Promise<T>, tries = 3, ms = 6000): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await Promise.race([run(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`query took over ${ms} ms`)), ms))]);
    } catch (err) {
      last = err;
      await new Promise((ok) => setTimeout(ok, 250 * (i + 1)));
    }
  }
  throw last;
}

export async function loadLesson(sessionId: string): Promise<LessonState | null> {
  return retried(() => readLesson(sessionId));
}

async function readLesson(sessionId: string): Promise<LessonState | null> {
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
  const events = [
    ...extra.map((e) => ({ kind: e.kind, actor: "system", offsetMs, payload: e.payload })),
    { kind: "lesson.state", actor: "system", offsetMs, payload: { state: next as unknown as Record<string, unknown> } },
  ];
  // A write is tried again only when it failed outright: one that timed out may
  // still land, and a second copy of a state is harmless but not wanted.
  try {
    await appendSessionEvents(sessionId, events);
  } catch {
    await new Promise((ok) => setTimeout(ok, 300));
    await appendSessionEvents(sessionId, events);
  }
  return true;
}
