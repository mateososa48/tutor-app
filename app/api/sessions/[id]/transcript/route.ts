import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessionEvents } from "@/lib/db/schema";
import { requireSession } from "@/lib/access";
import { mergeUtterances, type TimelineEvent } from "@/lib/session-recording";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/sessions/[id]/transcript — what was said, as whole turns, for the
// session's owner. GET /api/sessions/[id] returns every event including the
// board snapshots, far too much to read a conversation; this reads only the
// transcript fragments and merges them the way the admin replay does.
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const gate = await requireSession(id, "own", { hide: true });
  if ("response" in gate) return gate.response;

  const rows = await db
    .select({ seq: sessionEvents.seq, offsetMs: sessionEvents.offsetMs, clientSeq: sessionEvents.clientSeq, actor: sessionEvents.actor, payload: sessionEvents.payload })
    .from(sessionEvents)
    .where(and(eq(sessionEvents.sessionId, id), eq(sessionEvents.kind, "transcript.entry")))
    .orderBy(asc(sessionEvents.seq));

  const events: TimelineEvent[] = rows.map((r) => ({
    seq: r.seq,
    offsetMs: r.offsetMs,
    cseq: r.clientSeq,
    kind: "transcript.entry",
    actor: r.actor,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));

  const turns = mergeUtterances(events).map((u) => ({ role: u.role, text: u.text, at: u.startMs }));
  return NextResponse.json({ turns }, { headers: { "Cache-Control": "private, max-age=60" } });
}
