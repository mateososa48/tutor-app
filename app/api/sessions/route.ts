import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { tutorSessions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/sessions?limit=20
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  const rows = await db
    .select()
    .from(tutorSessions)
    .where(eq(tutorSessions.userId, session.user.id))
    .orderBy(desc(tutorSessions.startedAt))
    .limit(limit);

  return NextResponse.json(rows);
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
