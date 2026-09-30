import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import { loadSessionLearning, prepareLearningEvents, storeLearningEvents } from "@/lib/db/learning";

type RouteCtx = { params: Promise<{ id: string }> };

const MAX_BATCH = 100;

export async function GET(_request: NextRequest, context: RouteCtx) {
  const { id } = await context.params;
  const gate = await requireSession(id, "own");
  if ("response" in gate) return gate.response;
  return NextResponse.json(await loadSessionLearning(gate.row.userId, id));
}

// Evidence is filed under the session's own learner, not whoever the device is
// on now, so a switch mid-session never moves Ana's attempts to Leo.
export async function POST(request: NextRequest, context: RouteCtx) {
  const { id } = await context.params;
  const gate = await requireSession(id, "write");
  if ("response" in gate) return gate.response;

  const body: unknown = await request.json().catch(() => null);
  const values = body && typeof body === "object" && Array.isArray((body as { events?: unknown }).events)
    ? (body as { events: unknown[] }).events.slice(0, MAX_BATCH)
    : [body];
  const events = prepareLearningEvents(values);
  if (events.length === 0) return NextResponse.json({ error: "invalid learning event" }, { status: 400 });
  const stored = await storeLearningEvents(gate.row.userId, id, events);
  return NextResponse.json({ ok: true, accepted: stored, dropped: values.length - events.length });
}
