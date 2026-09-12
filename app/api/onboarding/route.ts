import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { auth } from "@/lib/auth";

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

// PUT /api/onboarding — upsert user profile (create or update)
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { displayName, gradeLevel, learningPrefs, extraContext, voiceName } = body;

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
        // preserve original onboardedAt — don't overwrite on profile edits
        updatedAt: now,
      },
    });

  return NextResponse.json({ ok: true });
}
