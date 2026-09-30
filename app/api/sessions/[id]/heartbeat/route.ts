import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { tutorSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/access";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/sessions/[id]/heartbeat — bumps lastActiveAt. Until Sept 30 it
// checked only that someone was signed in, so any account could keep any
// session "active" or rewrite its length.
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const gate = await requireSession(id, "write");
  if ("response" in gate) return gate.response;

  let durationSec: number | undefined;
  try {
    const body = await req.json();
    if (typeof body.durationSec === "number") durationSec = body.durationSec;
  } catch {}

  const patch: Record<string, unknown> = { lastActiveAt: Date.now() };
  if (durationSec !== undefined) patch.durationSec = durationSec;

  await db.update(tutorSessions).set(patch).where(eq(tutorSessions.id, id));
  return NextResponse.json({ ok: true });
}
