import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { tutorSessions, sessionEvents } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

type RouteCtx = { params: Promise<{ id: string }> };

const EVENT_KINDS = new Set([
  "transcript.entry",
  "whiteboard.snapshot",
  "board.update.ready",
  "board.update.failed",
  "session.paused",
  "session.resumed",
  "session.ended",
]);
const EVENT_ACTORS = new Set(["student", "tutor", "system"]);

// POST /api/sessions/[id]/events — append an event
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const rows = await db.select({ userId: tutorSessions.userId }).from(tutorSessions).where(eq(tutorSessions.id, id)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rows[0].userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { kind, actor, offsetMs, payload } = body;

  if (typeof kind !== "string" || !EVENT_KINDS.has(kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  if (actor !== undefined && (typeof actor !== "string" || !EVENT_ACTORS.has(actor))) {
    return NextResponse.json({ error: "invalid actor" }, { status: 400 });
  }

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
    offsetMs: typeof offsetMs === "number" ? offsetMs : 0,
    kind,
    actor: actor ?? "system",
    payload: payload && typeof payload === "object" ? payload : {},
  });

  await db
    .update(tutorSessions)
    .set({ lastActiveAt: Date.now() })
    .where(eq(tutorSessions.id, id));

  return NextResponse.json({ ok: true, seq: nextSeq });
}
