import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { learnerSkillStates, learningAttempts, tutorSessions, userProfiles } from "@/lib/db/schema";

// GET /api/account/export — everything Chalk keeps about the signed-in
// student, as one JSON file (Privacy & data, Oct 2026): the profile, what the
// tutor remembers, every session with its transcript and summary, every
// checked answer, and the skills they add up to. Board pictures and the
// technical event log are left out to keep the file readable; the pictures
// can be seen on each session's summary page.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  const sessions = await db
    .select({
      id: tutorSessions.id,
      title: tutorSessions.title,
      status: tutorSessions.status,
      startedAt: tutorSessions.startedAt,
      endedAt: tutorSessions.endedAt,
      durationSec: tutorSessions.durationSec,
      transcript: tutorSessions.transcript,
      summary: tutorSessions.summary,
    })
    .from(tutorSessions)
    .where(eq(tutorSessions.userId, userId))
    .orderBy(desc(tutorSessions.startedAt));
  const attempts = await db
    .select({
      sessionId: learningAttempts.sessionId,
      skill: learningAttempts.rawSkill,
      problem: learningAttempts.problem,
      answer: learningAttempts.studentAnswer,
      result: learningAttempts.result,
      helpLevel: learningAttempts.helpLevel,
      at: learningAttempts.occurredAt,
    })
    .from(learningAttempts)
    .where(eq(learningAttempts.userId, userId))
    .orderBy(asc(learningAttempts.occurredAt));
  const skills = await db
    .select({
      skill: learnerSkillStates.skillKey,
      status: learnerSkillStates.status,
      attempts: learnerSkillStates.attemptCount,
      correct: learnerSkillStates.correctCount,
      correctWithNoHelp: learnerSkillStates.independentCorrectCount,
      lastPractised: learnerSkillStates.latestAttemptAt,
    })
    .from(learnerSkillStates)
    .where(eq(learnerSkillStates.userId, userId));

  const body = {
    exportedAt: new Date().toISOString(),
    account: { name: session.user?.name ?? null, email: session.user?.email ?? null },
    profile: profile
      ? {
          name: profile.displayName,
          grade: profile.gradeLevel,
          workingOn: profile.extraContext,
          teachingPreferences: profile.learningPrefs,
          voice: profile.voiceName,
          onboarding: profile.onboarding,
        }
      : null,
    tutorMemory: profile?.tutorNotes ?? [],
    sessions,
    checkedAnswers: attempts,
    skills,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="chalk-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
