import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { buildGeminiInstructions, buildGreetingLine, buildResumeLine, type StudentProfile } from "@/lib/tutor-prompts";
import { intakeInstructions, type SessionIntake } from "@/lib/session-intake";
import { geminiVoiceFor } from "@/lib/voice-settings";
import { loadLearningOverview } from "@/lib/learning-overview";

// Gemini Live fallback. Returns the composed system prompt and voice for the
// signed-in student, plus a one-use ephemeral token so the browser can open
// the Live WebSocket without ever seeing the API key. Send `{ configOnly: true }`
// to get the prompt and voice without minting a token.

export const dynamic = "force-dynamic";

// The intake arrives from the browser, so take only the fields we know and cap
// the free text; everything else is dropped before it can reach the prompt.
function readIntake(value: unknown): SessionIntake | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  const language = pick(raw.language, ["de", "en", "es", "fr", "it", "pt", "pl", "tr", "uk", "ru", "ar", "zh", "vi"] as const);
  const topic = typeof raw.topic === "string" ? raw.topic.slice(0, 600) : "";
  if (!language && !topic) return null;
  return { topic, language: language ?? "en", fileNames: [] };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Prefer the server-only key; the NEXT_PUBLIC_ one is a leftover from the
  // browser-side era that production still carries.
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[live-token] GEMINI_API_KEY is not set");
    return NextResponse.json({ error: "misconfigured", detail: "GEMINI_API_KEY is not set" }, { status: 500 });
  }

  let configOnly = false;
  // What the student answered before the session opened (lib/session-intake).
  let intake: SessionIntake | null = null;
  let fileCount = 0;
  try {
    const body = (await req.json()) as { configOnly?: unknown; intake?: unknown; fileCount?: unknown };
    configOnly = body?.configOnly === true;
    intake = readIntake(body?.intake);
    fileCount = typeof body?.fileCount === "number" ? Math.max(0, Math.min(20, Math.floor(body.fileCount))) : 0;
  } catch {
    // no body: the client is minting a token for a socket
  }

  const [[row], learning] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, session.user.id)).limit(1),
    loadLearningOverview(session.user.id),
  ]);
  const profile: StudentProfile | null = row
    ? {
        displayName: row.displayName,
        gradeLevel: row.gradeLevel,
        learningPrefs: (row.learningPrefs ?? {}) as StudentProfile["learningPrefs"],
        extraContext: row.extraContext,
        voiceName: row.voiceName,
      }
    : null;
  const notes = Array.isArray(row?.tutorNotes)
    ? (row!.tutorNotes as unknown[]).filter((n): n is string => typeof n === "string")
    : [];

  const base = buildGeminiInstructions(profile, notes, { learnerBrief: learning.brief });
  const config = {
    // With an intake, the session's own context and language go last, so they
    // win over the general instructions, and the greeting is dropped: the
    // student's opening message arrives instead (see app/session/[id]/page.tsx).
    instructions: intake ? `${base}\n\n${intakeInstructions(intake, fileCount)}` : base,
    voice: geminiVoiceFor(row?.voiceName),
    greeting: intake ? "" : buildGreetingLine(profile, 0),
    resume: buildResumeLine(profile),
  };
  if (configOnly) return NextResponse.json(config);

  try {
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1alpha" },
    });
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      },
    });
    return NextResponse.json({ token: token.name, ...config });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[live-token] mint failed:", message);
    return NextResponse.json({ error: "token_mint_failed", detail: message.slice(0, 300) }, { status: 502 });
  }
}
