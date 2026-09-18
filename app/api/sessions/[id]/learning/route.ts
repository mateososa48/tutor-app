import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { loadSessionLearning, prepareLearningEvents, storeLearningEvents } from "@/lib/db/learning";
import { tutorSessions } from "@/lib/db/schema";

type RouteCtx = { params: Promise<{ id: string }> };

const MAX_BATCH = 100;

async function ownedSession(userId: string, sessionId: string): Promise<"owned" | "forbidden" | "missing"> {
  const rows = await db.select({ userId: tutorSessions.userId }).from(tutorSessions).where(eq(tutorSessions.id, sessionId)).limit(1);
  if (rows.length === 0) return "missing";
  return rows[0].userId === userId ? "owned" : "forbidden";
}

function ownershipError(status: "forbidden" | "missing") {
  return NextResponse.json({ error: status === "missing" ? "not found" : "Forbidden" }, { status: status === "missing" ? 404 : 403 });
}

export async function GET(_request: NextRequest, context: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const ownership = await ownedSession(session.user.id, id);
  if (ownership !== "owned") return ownershipError(ownership);
  return NextResponse.json(await loadSessionLearning(session.user.id, id));
}

export async function POST(request: NextRequest, context: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const ownership = await ownedSession(session.user.id, id);
  if (ownership !== "owned") return ownershipError(ownership);

  const body: unknown = await request.json().catch(() => null);
  const values = body && typeof body === "object" && Array.isArray((body as { events?: unknown }).events)
    ? (body as { events: unknown[] }).events.slice(0, MAX_BATCH)
    : [body];
  const events = prepareLearningEvents(values);
  if (events.length === 0) return NextResponse.json({ error: "invalid learning event" }, { status: 400 });
  const stored = await storeLearningEvents(session.user.id, id, events);
  return NextResponse.json({ ok: true, accepted: stored, dropped: values.length - events.length });
}
