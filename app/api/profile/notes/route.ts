import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";

// Durable tutor memory: short facts the teaching backend records with the
// remember_about_student tool. Loaded into the backend prompt at the start of
// every session (app/api/live-session), so what clicked last week is known
// this week.

export const dynamic = "force-dynamic";

const MAX_NOTES = 40;
const MAX_NOTE_CHARS = 240;

function readNotes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((n): n is string => typeof n === "string") : [];
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [row] = await db
    .select({ tutorNotes: userProfiles.tutorNotes })
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);
  return NextResponse.json({ notes: readNotes(row?.tutorNotes) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let note = "";
  try {
    const body = (await req.json()) as { note?: unknown };
    note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE_CHARS) : "";
  } catch {
    note = "";
  }
  if (!note) return NextResponse.json({ error: "missing_note" }, { status: 400 });

  const [row] = await db
    .select({ tutorNotes: userProfiles.tutorNotes })
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);
  const existing = readNotes(row?.tutorNotes);
  const notes = existing.includes(note) ? existing : [...existing, note].slice(-MAX_NOTES);

  const now = new Date();
  await db
    .insert(userProfiles)
    .values({ userId: session.user.id, tutorNotes: notes, updatedAt: now })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { tutorNotes: notes, updatedAt: now },
    });

  return NextResponse.json({ notes });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await db
    .update(userProfiles)
    .set({ tutorNotes: [], updatedAt: new Date() })
    .where(eq(userProfiles.userId, session.user.id));
  return NextResponse.json({ notes: [] });
}
