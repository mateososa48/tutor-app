import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { tutorSessions, sessionEvents } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/sessions/[id]/pause — sendBeacon target, accepts text/plain
// Auth not enforced here because sendBeacon can't send auth cookies reliably on pagehide
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;

  const rows = await db.select().from(tutorSessions).where(eq(tutorSessions.id, id)).limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const session = rows[0];
  if (session.status !== "active") {
    return NextResponse.json({ ok: true, noop: true });
  }

  const now = Date.now();
  await db
    .update(tutorSessions)
    .set({ status: "paused", pausedAt: now })
    .where(eq(tutorSessions.id, id));

  const last = await db
    .select({ seq: sessionEvents.seq })
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, id))
    .orderBy(desc(sessionEvents.seq))
    .limit(1);
  const nextSeq = last.length ? last[0].seq + 1 : 1;

  await db.insert(sessionEvents).values({
    sessionId: id,
    seq: nextSeq,
    offsetMs: Math.max(0, now - session.startedAt),
    kind: "session.paused",
    actor: "system",
    payload: {},
  });

  return NextResponse.json({ ok: true });
}
