import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { sessionFrames, tutorSessions } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/sessions?limit=20
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  // Named columns: the list keeps working when a column lands in the schema
  // before its SQL has run on the database (event_seq did, Sept 16).
  const rows = await db
    .select({
      id: tutorSessions.id,
      userId: tutorSessions.userId,
      title: tutorSessions.title,
      status: tutorSessions.status,
      startedAt: tutorSessions.startedAt,
      endedAt: tutorSessions.endedAt,
      durationSec: tutorSessions.durationSec,
      lastActiveAt: tutorSessions.lastActiveAt,
      pausedAt: tutorSessions.pausedAt,
      transcript: tutorSessions.transcript,
      summary: tutorSessions.summary,
      createdAt: tutorSessions.createdAt,
    })
    .from(tutorSessions)
    .where(eq(tutorSessions.userId, session.user.id))
    .orderBy(desc(tutorSessions.startedAt))
    .limit(limit);

  // Which of these sessions have a board picture, so the home page only asks
  // for thumbnails that exist (GET /api/sessions/[id]/frames).
  const ids = rows.map((r) => r.id);
  const pictured = ids.length
    ? await db.selectDistinct({ sessionId: sessionFrames.sessionId }).from(sessionFrames).where(inArray(sessionFrames.sessionId, ids))
    : [];
  const hasPicture = new Set(pictured.map((p) => p.sessionId));

  return NextResponse.json(rows.map((r) => ({ ...r, hasPicture: hasPicture.has(r.id) })));
}

// POST /api/sessions — create a new session
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const now = Date.now();
  const id = `session_${now}_${Math.random().toString(36).slice(2, 8)}`;

  await db.insert(tutorSessions).values({
    id,
    userId: session.user.id,
    title: body.title ?? "Session",
    status: "active",
    startedAt: now,
    endedAt: now,
    durationSec: 0,
    lastActiveAt: now,
    transcript: [],
  });

  return NextResponse.json({ id });
}
