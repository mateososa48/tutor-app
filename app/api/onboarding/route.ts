import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { sanitizeOnboarding } from "@/lib/onboarding";

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
