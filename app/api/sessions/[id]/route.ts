import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { tutorSessions, sessionEvents } from "@/lib/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { requireSession } from "@/lib/access";
import { reprojectSkills, skillsInSession } from "@/lib/db/learning";

type RouteCtx = { params: Promise<{ id: string }> };

// DELETE /api/sessions/[id] — permanently remove a session and everything
// recorded in it (events, pictures and attempts cascade), then recompute the
// skills its attempts counted toward, so deleted work stops showing as
// progress.
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const gate = await requireSession(id, "own");
  if ("response" in gate) return gate.response;

  const skills = await skillsInSession(id);
  await db.delete(tutorSessions).where(eq(tutorSessions.id, id));
  await reprojectSkills(gate.row.userId, skills);

  return NextResponse.json({ ok: true });
}

const STALE_MS = 60_000;
const SESSION_STATUSES = new Set(["active", "paused", "ended"]);

/**
 * A session still marked active whose heartbeat stopped a minute ago was left
 * without an end (a closed tab, a crash): the student reopening it finds it
 * paused. Only the student's own read does this; anyone else reading a
 * session (a parent, later) must never change it.
 */
async function settleStale<T extends { status: string; lastActiveAt: number; pausedAt: number | null }>(id: string, row: T): Promise<T> {
  if (row.status !== "active" || Date.now() - row.lastActiveAt <= STALE_MS) return row;
  const now = Date.now();
  await db.update(tutorSessions).set({ status: "paused", pausedAt: now }).where(eq(tutorSessions.id, id));
  return { ...row, status: "paused", pausedAt: now };
}

// GET /api/sessions/[id] — session + events, for the student it belongs to.
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const gate = await requireSession(id, "own");
  if ("response" in gate) return gate.response;

  const [row] = await db.select().from(tutorSessions).where(eq(tutorSessions.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const tutorSession = await settleStale(id, row);

  const events = await db
    .select()
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, id))
    .orderBy(asc(sessionEvents.seq), asc(sessionEvents.id));

  return NextResponse.json({ session: tutorSession, events });
}

// PATCH /api/sessions/[id] — partial update of status/title/endedAt/durationSec.
// A running session's own page sends these, so it may finish even after the
// device switched to another profile ("write").
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const gate = await requireSession(id, "write");
  if ("response" in gate) return gate.response;

  const body = await req.json();

  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string") {
    if (!SESSION_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.endedAt === "number") patch.endedAt = body.endedAt;
  if (typeof body.durationSec === "number") patch.durationSec = body.durationSec;
  if (Array.isArray(body.transcript)) patch.transcript = body.transcript;

  if (body.status === "active") {
    patch.lastActiveAt = Date.now();
    patch.pausedAt = null;
  }
  if (body.status === "paused") {
    patch.pausedAt = Date.now();
  }
  // Ending queues the summary here rather than in the browser, so a closed
  // tab still leaves the job for the sweeper (app/api/cron/summaries).
  if (body.status === "ended") {
    patch.summaryState = sql`case when ${tutorSessions.summaryState} = 'done' then 'done' else 'pending' end`;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  await db.update(tutorSessions).set(patch).where(eq(tutorSessions.id, id));
  return NextResponse.json({ ok: true });
}
