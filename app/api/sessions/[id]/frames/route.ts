import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessionFrames, tutorSessions } from "@/lib/db/schema";
import { auth } from "@/lib/auth";

type RouteCtx = { params: Promise<{ id: string }> };

const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BASE64 = 2_000_000; // about 1.5 MB of image

function whole(value: unknown, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0;
}

// POST /api/sessions/[id]/frames — store a board picture for the admin replay.
// The same picture (same hash) in one session is stored once.
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const rows = await db.select({ userId: tutorSessions.userId }).from(tutorSessions).where(eq(tutorSessions.id, id)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rows[0].userId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const data = typeof body?.data === "string" ? body.data : "";
  const hash = typeof body?.hash === "string" ? body.hash.slice(0, 80) : "";
  const mime = typeof body?.mime === "string" && MIMES.has(body.mime) ? body.mime : "";
  if (!data || !hash || !mime || data.length > MAX_BASE64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    return NextResponse.json({ error: "invalid picture" }, { status: 400 });
  }

  const existing = await db
    .select({ id: sessionFrames.id })
    .from(sessionFrames)
    .where(and(eq(sessionFrames.sessionId, id), eq(sessionFrames.hash, hash)))
    .limit(1);
  if (existing.length) return NextResponse.json({ frameId: existing[0].id });

  const inserted = await db
    .insert(sessionFrames)
    .values({
      sessionId: id,
      offsetMs: whole(body?.offsetMs, 2_147_000_000),
      hash,
      mime,
      width: whole(body?.width, 20_000),
      height: whole(body?.height, 20_000),
      bytes: Math.floor((data.length * 3) / 4),
      data,
      reason: typeof body?.reason === "string" ? body.reason.slice(0, 40) : "board",
    })
    .onConflictDoNothing()
    .returning({ id: sessionFrames.id });
  if (inserted.length) return NextResponse.json({ frameId: inserted[0].id });

  const raced = await db
    .select({ id: sessionFrames.id })
    .from(sessionFrames)
    .where(and(eq(sessionFrames.sessionId, id), eq(sessionFrames.hash, hash)))
    .limit(1);
  return raced.length ? NextResponse.json({ frameId: raced[0].id }) : NextResponse.json({ error: "not stored" }, { status: 500 });
}
