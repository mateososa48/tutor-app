import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { sanitizeInterests, sanitizeOnboarding } from "@/lib/onboarding";

// GET /api/onboarding — fetch current user's profile
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);

  return NextResponse.json(profile ?? null);
}

// PUT /api/onboarding — upsert user profile (create or update). Onboarding
// sends the name, the grade and the onboarding record; the settings page
// sends everything but that record, and must not erase it, so `onboarding`
// is only written when the body carries one.
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { displayName, gradeLevel, learningPrefs, extraContext, voiceName, onboarding } = body;

  const record = onboarding === undefined ? undefined : sanitizeOnboarding(onboarding);
  if (onboarding !== undefined && !record) {
    return NextResponse.json({ error: "Bad onboarding record" }, { status: 400 });
  }

  const now = new Date();

  await db
    .insert(userProfiles)
    .values({
      userId: session.user.id,
      displayName: displayName ?? null,
      gradeLevel: gradeLevel ?? null,
      learningPrefs: learningPrefs ?? {},
      extraContext: extraContext ?? null,
      voiceName: voiceName ?? "marin",
      onboarding: record ?? {},
      onboardedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: {
        displayName: displayName ?? null,
        gradeLevel: gradeLevel ?? null,
        learningPrefs: learningPrefs ?? {},
        extraContext: extraContext ?? null,
        voiceName: voiceName ?? "marin",
        ...(record ? { onboarding: record } : {}),
        // preserve original onboardedAt — don't overwrite on profile edits
        updatedAt: now,
      },
    });

  return NextResponse.json({ ok: true });
}

// PATCH /api/onboarding — merge into the onboarding record without touching
// the rest of the profile. /welcome uses it for interests. A profile from
// before the record existed (onboarding = {}) is treated as a student's.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  if (!("interests" in body)) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  const [row] = await db
    .select({ onboarding: userProfiles.onboarding })
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "No profile yet" }, { status: 404 });
  }

  const current = sanitizeOnboarding(row.onboarding) ?? { by: "student" as const };
  const interests = sanitizeInterests(body.interests);
  const next = { ...current, ...(interests.length ? { interests } : {}) };
  if (!interests.length) delete next.interests;

  await db
    .update(userProfiles)
    .set({ onboarding: next, updatedAt: new Date() })
    .where(eq(userProfiles.userId, session.user.id));

  return NextResponse.json({ ok: true, onboarding: next });
}
