import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { tutorSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { appendSessionEvents } from "@/lib/db/session-events";
import { requireSession } from "@/lib/access";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/sessions/[id]/pause — the sendBeacon target when the page hides.
// It used to skip auth on the belief that a beacon can't carry cookies; a
// same-origin beacon does carry them (and proxy.ts already required a signed-in
// token to reach this route), so it checks the session like every other write.
// If a beacon is ever dropped, the stale check in GET /api/sessions/[id]
// pauses the session anyway.
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const gate = await requireSession(id, "write");
  if ("response" in gate) return gate.response;

  if (gate.row.status !== "active") {
    return NextResponse.json({ ok: true, noop: true });
  }

  const now = Date.now();
  await db
    .update(tutorSessions)
    .set({ status: "paused", pausedAt: now })
    .where(eq(tutorSessions.id, id));

  await appendSessionEvents(id, [
    { kind: "session.paused", actor: "system", offsetMs: Math.max(0, now - gate.row.startedAt), payload: {} },
  ], now);

  return NextResponse.json({ ok: true });
}
