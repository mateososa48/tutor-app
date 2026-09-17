import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { tutorSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { appendSessionEvents } from "@/lib/db/session-events";

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

  await appendSessionEvents(id, [
    { kind: "session.paused", actor: "system", offsetMs: Math.max(0, now - session.startedAt), payload: {} },
  ], now);

  return NextResponse.json({ ok: true });
}
