import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
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

// GET /api/sessions/[id]/frames — a board picture of the student's own
// session, as an image. With no query, the newest one (the home page's
// thumbnails); with ?frame=<id>, that picture, which is how the summary page
// shows one board per problem (the ids come from /boards). 404 when there is
// no such picture, so the page shows a placeholder.
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const rows = await db.select({ userId: tutorSessions.userId }).from(tutorSessions).where(eq(tutorSessions.id, id)).limit(1);
  if (rows.length === 0 || rows[0].userId !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // The frame id is scoped to the session, so one student can never name
  // another's picture.
  const wanted = Number(req.nextUrl.searchParams.get("frame"));
  const which = Number.isInteger(wanted) && wanted > 0 ? and(eq(sessionFrames.sessionId, id), eq(sessionFrames.id, wanted)) : eq(sessionFrames.sessionId, id);

  const [frame] = await db
    .select({ data: sessionFrames.data, mime: sessionFrames.mime })
    .from(sessionFrames)
    .where(which)
    .orderBy(desc(sessionFrames.offsetMs))
    .limit(1);
  if (!frame) return NextResponse.json({ error: "no picture" }, { status: 404 });

  return new NextResponse(new Uint8Array(Buffer.from(frame.data, "base64")), {
    // A picture never changes once recorded, so a named one can be kept longer.
    headers: { "Content-Type": frame.mime, "Cache-Control": wanted > 0 ? "private, max-age=86400, immutable" : "private, max-age=300" },
  });
}
