import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { tutorSessions, sessionEvents } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";

type RouteCtx = { params: Promise<{ id: string }> };

// DELETE /api/sessions/[id] — permanently remove a session and its events
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const rows = await db.select({ userId: tutorSessions.userId }).from(tutorSessions).where(eq(tutorSessions.id, id)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rows[0].userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // sessionEvents cascades on delete, but be explicit for clarity
  await db.delete(sessionEvents).where(eq(sessionEvents.sessionId, id));
  await db.delete(tutorSessions).where(eq(tutorSessions.id, id));

  return NextResponse.json({ ok: true });
}

const STALE_MS = 60_000;
const SESSION_STATUSES = new Set(["active", "paused", "ended"]);

// GET /api/sessions/[id] — session + events
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const rows = await db.select().from(tutorSessions).where(eq(tutorSessions.id, id)).limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (rows[0].userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let tutorSession = rows[0];

  // Lazy stale-detect: if active but heartbeat is old, mark paused
  if (tutorSession.status === "active" && Date.now() - tutorSession.lastActiveAt > STALE_MS) {
    const now = Date.now();
    await db
      .update(tutorSessions)
      .set({ status: "paused", pausedAt: now })
      .where(eq(tutorSessions.id, id));
    tutorSession = { ...tutorSession, status: "paused", pausedAt: now };
  }

  const events = await db
    .select()
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, id))
    .orderBy(asc(sessionEvents.seq), asc(sessionEvents.id));

  return NextResponse.json({ session: tutorSession, events });
}

// PATCH /api/sessions/[id] — partial update of status/title/endedAt/durationSec
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const rows = await db.select({ userId: tutorSessions.userId }).from(tutorSessions).where(eq(tutorSessions.id, id)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rows[0].userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  await db.update(tutorSessions).set(patch).where(eq(tutorSessions.id, id));
  return NextResponse.json({ ok: true });
}
