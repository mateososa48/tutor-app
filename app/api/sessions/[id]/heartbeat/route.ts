import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { tutorSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/sessions/[id]/heartbeat — bumps lastActiveAt
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
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
