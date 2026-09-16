import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { tutorSessions, sessionEvents } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { EVENT_ACTORS, RECORDED_EVENT_KINDS } from "@/lib/session-recording";

type RouteCtx = { params: Promise<{ id: string }> };

const EVENT_KINDS = new Set<string>(RECORDED_EVENT_KINDS);
const ACTORS = new Set<string>(EVENT_ACTORS);
const MAX_BATCH = 200;

type Incoming = { kind: string; actor: "student" | "tutor" | "system"; offsetMs: number; payload: Record<string, unknown> };

function readEvent(raw: unknown): Incoming | null {
  if (!raw || typeof raw !== "object") return null;
  const { kind, actor, offsetMs, payload } = raw as Record<string, unknown>;
  if (typeof kind !== "string" || !EVENT_KINDS.has(kind)) return null;
  if (actor !== undefined && (typeof actor !== "string" || !ACTORS.has(actor))) return null;
  return {
    kind,
    actor: (actor ?? "system") as Incoming["actor"],
    offsetMs: typeof offsetMs === "number" && Number.isFinite(offsetMs) ? Math.max(0, Math.min(2_147_000_000, Math.round(offsetMs))) : 0,
    payload: payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {},
  };
}

// POST /api/sessions/[id]/events — append one event, or a batch: { events: [...] }
// (the session recorder sends batches; see lib/session-recorder.ts).
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const rows = await db.select({ userId: tutorSessions.userId }).from(tutorSessions).where(eq(tutorSessions.id, id)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rows[0].userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  const isBatch = Boolean(body && typeof body === "object" && Array.isArray((body as { events?: unknown }).events));
  const raws: unknown[] = isBatch ? (body as { events: unknown[] }).events.slice(0, MAX_BATCH) : [body];
  const events = raws.map(readEvent).filter((e): e is Incoming => e !== null);
  if (events.length === 0) {
    return NextResponse.json({ error: "invalid event" }, { status: 400 });
  }

  const last = await db
    .select({ seq: sessionEvents.seq })
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, id))
    .orderBy(desc(sessionEvents.seq))
    .limit(1);
  const nextSeq = last.length ? last[0].seq + 1 : 1;

  await db.insert(sessionEvents).values(
    events.map((e, i) => ({
      sessionId: id,
      seq: nextSeq + i,
      offsetMs: e.offsetMs,
      kind: e.kind,
      actor: e.actor,
      payload: e.payload,
    })),
  );

  await db
    .update(tutorSessions)
    .set({ lastActiveAt: Date.now() })
    .where(eq(tutorSessions.id, id));

  return NextResponse.json({ ok: true, seq: nextSeq + events.length - 1, stored: events.length, dropped: raws.length - events.length });
}
