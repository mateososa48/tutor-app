import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessionEvents, sessionFrames, tutorSessions } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { problemBoards } from "@/lib/session-boards";
import type { TimelineEvent } from "@/lib/session-recording";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/sessions/[id]/boards — one board per problem, in order, for the
// session's owner. Each names the frame to fetch from
// /api/sessions/[id]/frames?frame=<id>; the pictures themselves stay out of
// this response, since a session can hold forty of them.
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const [row] = await db.select({ userId: tutorSessions.userId, title: tutorSessions.title }).from(tutorSessions).where(eq(tutorSessions.id, id)).limit(1);
  if (!row || row.userId !== session.user.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [calls, frames] = await Promise.all([
    db
      .select({ seq: sessionEvents.seq, offsetMs: sessionEvents.offsetMs, clientSeq: sessionEvents.clientSeq, payload: sessionEvents.payload })
      .from(sessionEvents)
      .where(and(eq(sessionEvents.sessionId, id), eq(sessionEvents.kind, "tool.call")))
      .orderBy(asc(sessionEvents.seq)),
    db
      .select({ id: sessionFrames.id, offsetMs: sessionFrames.offsetMs, reason: sessionFrames.reason, width: sessionFrames.width, height: sessionFrames.height })
      .from(sessionFrames)
      .where(eq(sessionFrames.sessionId, id))
      .orderBy(asc(sessionFrames.offsetMs)),
  ]);

  const events: TimelineEvent[] = calls.map((c) => ({
    seq: c.seq,
    offsetMs: c.offsetMs,
    cseq: c.clientSeq,
    kind: "tool.call",
    actor: "tutor",
    payload: (c.payload ?? {}) as Record<string, unknown>,
  }));

  return NextResponse.json(
    { boards: problemBoards(events, frames, row.title || "Your session") },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
