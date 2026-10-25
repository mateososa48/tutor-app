import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { AccessToken, AgentDispatchClient, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";
import { labFromRequest } from "@/lib/voice-lab";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { type StudentProfile } from "@/lib/tutor-prompts";
import { buildBrainInstructions } from "@/lib/brain/prompt";
import { intakeInstructions, isSessionLength, type SessionIntake } from "@/lib/session-intake";
import { loadLearningOverview } from "@/lib/learning-overview";

// The LiveKit voice path (branch `livekit`, ?voice=livekit): the same student
// profile, memory, learner brief and intake as /api/live-token, with the
// brain's prompt (lib/brain/prompt), plus a short-lived LiveKit room token for
// this signed-in student. The voice agent (agent/main.ts) is dispatched to
// every new room and asks the browser for this config. `tts` picks the voice
// for an audition (a gateway model id, or "kokoro"); unset, the agent's own.
//
// Locally: `livekit-server --dev` gives ws://127.0.0.1:7880 with devkey/secret.
// LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET point it anywhere else.

export const dynamic = "force-dynamic";

const LIVEKIT_URL = process.env.LIVEKIT_URL || "ws://127.0.0.1:7880";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || (process.env.NODE_ENV === "development" ? "devkey" : "");
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || (process.env.NODE_ENV === "development" ? "secret" : "");
const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || "chalk-tutor";

/** A room's name carries its owner, so only they can send a new agent into it. */
function roomOwner(room: string): string | null {
  return /^chalk-([a-z0-9]{1,12})-[a-z0-9]{8}$/i.exec(room)?.[1] ?? null;
}

function readIntake(value: unknown): SessionIntake | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const languages = ["de", "en", "es", "fr", "it", "pt", "pl", "tr", "uk", "ru", "ar", "zh", "vi"] as const;
  const language = typeof raw.language === "string" && (languages as readonly string[]).includes(raw.language) ? (raw.language as SessionIntake["language"]) : null;
  const topic = typeof raw.topic === "string" ? raw.topic.slice(0, 600) : "";
  const lessonKey = typeof raw.lessonKey === "string" && /^[a-z0-9-]{1,40}$/.test(raw.lessonKey) ? raw.lessonKey : undefined;
  const minutes = isSessionLength(raw.minutes) ? raw.minutes : undefined;
  if (!language && !topic) return null;
  return { topic, language: language ?? "en", fileNames: [], ...(lessonKey ? { lessonKey } : {}), ...(minutes ? { minutes } : {}) };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return NextResponse.json({ error: "misconfigured", detail: "LIVEKIT_API_KEY and LIVEKIT_API_SECRET are not set" }, { status: 500 });
  }

  // The room's agent died mid-lesson: send a new one in (the page hands it the conversation so far).
  const peek = (await req.clone().json().catch(() => null)) as { redispatch?: unknown } | null;
  if (typeof peek?.redispatch === "string") {
    const room = peek.redispatch;
    if (roomOwner(room) !== session.user.id.replace(/[^a-z0-9]/gi, "").slice(0, 12)) return NextResponse.json({ error: "not your room" }, { status: 403 });
    const dispatch = new AgentDispatchClient(LIVEKIT_URL.replace(/^ws/, "http"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    await dispatch.createDispatch(room, AGENT_NAME);
    return NextResponse.json({ ok: true });
  }

  let intake: SessionIntake | null = null;
  let fileCount = 0;
  let ttsModel: string | null = null;
  let lab: ReturnType<typeof labFromRequest> = { stt: null, turns: null, wait: null, brain: null, tts: null };
  try {
    const body = (await req.json()) as { intake?: unknown; fileCount?: unknown } & Record<string, unknown>;
    lab = labFromRequest(body ?? {});
    if (lab.tts) ttsModel = lab.tts === "kokoro" ? "kokoro" : `gateway:${lab.tts}`;
    intake = readIntake(body?.intake);
    fileCount = typeof body?.fileCount === "number" ? Math.max(0, Math.min(20, Math.floor(body.fileCount))) : 0;
  } catch {
    // no body
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
        onboarding: row.onboarding,
      }
    : null;
  const notes = Array.isArray(row?.tutorNotes)
    ? (row!.tutorNotes as unknown[]).filter((n): n is string => typeof n === "string")
    : [];

  const instructions = buildBrainInstructions(profile, notes, {
    learnerBrief: learning.brief,
    session: intake ? intakeInstructions(intake, fileCount) : undefined,
  });

  const room = `chalk-${session.user.id.replace(/[^a-z0-9]/gi, "").slice(0, 12)}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const identity = `student-${session.user.id.slice(0, 12)}-${randomUUID().slice(0, 4)}`;
  // Short-lived: long enough for a lesson and a reconnect, never reusable for another room.
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name: profile?.displayName ?? "Student", ttl: "2h" });
  token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  // The tutor agent joins the room when it is created.
  token.roomConfig = new RoomConfiguration({ agents: [new RoomAgentDispatch({ agentName: AGENT_NAME })] });

  return NextResponse.json({
    url: LIVEKIT_URL,
    token: await token.toJwt(),
    room,
    instructions,
    ttsModel,
    voice: null,
    stt: lab.stt,
    turns: lab.turns,
    wait: lab.wait,
    brain: lab.brain,
    grade: row?.gradeLevel ?? "",
  });
}
