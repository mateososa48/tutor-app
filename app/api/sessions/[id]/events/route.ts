import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { tutorSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { appendSessionEvents } from "@/lib/db/session-events";
import { EVENT_ACTORS, RECORDED_EVENT_KINDS } from "@/lib/session-recording";

type RouteCtx = { params: Promise<{ id: string }> };

const EVENT_KINDS = new Set<string>(RECORDED_EVENT_KINDS);
const ACTORS = new Set<string>(EVENT_ACTORS);
const MAX_BATCH = 200;

type Incoming = { kind: string; actor: "student" | "tutor" | "system"; offsetMs: number; payload: Record<string, unknown>; cseq: number | null };

function readEvent(raw: unknown): Incoming | null {
  if (!raw || typeof raw !== "object") return null;
  const { kind, actor, offsetMs, payload, cseq } = raw as Record<string, unknown>;
  if (typeof kind !== "string" || !EVENT_KINDS.has(kind)) return null;
  if (actor !== undefined && (typeof actor !== "string" || !ACTORS.has(actor))) return null;
  return {
    kind,
    actor: (actor ?? "system") as Incoming["actor"],
    offsetMs: typeof offsetMs === "number" && Number.isFinite(offsetMs) ? Math.max(0, Math.min(2_147_000_000, Math.round(offsetMs))) : 0,
    payload: payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {},
    cseq: typeof cseq === "number" && Number.isInteger(cseq) && cseq > 0 && cseq < 2_147_000_000 ? cseq : null,
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

  // One statement numbers and stores the batch, so concurrent requests never share a seq.
  const seq = await appendSessionEvents(id, events);

  return NextResponse.json({ ok: true, seq, stored: events.length, dropped: raws.length - events.length });
}
