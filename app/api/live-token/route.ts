import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { buildGeminiInstructions, buildGreetingLine, buildResumeLine, type StudentProfile } from "@/lib/tutor-prompts";
import { geminiVoiceFor } from "@/lib/voice-settings";

// Gemini Live fallback. Returns the composed system prompt and voice for the
// signed-in student, plus a one-use ephemeral token so the browser can open
// the Live WebSocket without ever seeing the API key. Send `{ configOnly: true }`
// to get the prompt and voice without minting a token.

export const dynamic = "force-dynamic";

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
  try {
    const body = (await req.json()) as { configOnly?: unknown };
    configOnly = body?.configOnly === true;
  } catch {
    // no body: the client is minting a token for a socket
  }

  const [row] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);
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

  const config = {
    instructions: buildGeminiInstructions(profile, notes),
    voice: geminiVoiceFor(row?.voiceName),
    greeting: buildGreetingLine(profile, 0),
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
