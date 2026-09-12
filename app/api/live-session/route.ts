import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { LiveCreateParams, InitialItem, BuiltInVoice } from "openai/resources/live/live";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { WHITEBOARD_FUNCTION_TOOLS } from "@/lib/whiteboard-tools";
import {
  buildBackendInstructions,
  buildGreetingLine,
  buildResumeLine,
  buildVoiceInstructions,
  type StudentProfile,
} from "@/lib/tutor-prompts";
import { DEFAULT_TUTOR_VOICE, isTutorVoiceName } from "@/lib/voice-settings";

// Creates a GPT-Live WebRTC session for the signed-in student.
//
// The browser sends its SDP offer; we compose the two prompts (voice model +
// teaching backend) from the student's profile and memory notes, register the
// whiteboard tools with the Responses backend, and return the SDP answer.
// The OpenAI API key never leaves this route.

export const dynamic = "force-dynamic";

const BACKEND_MODEL = process.env.OPENAI_TUTOR_BACKEND_MODEL ?? "gpt-5.6-terra";
const REASONING_EFFORT = (process.env.OPENAI_TUTOR_REASONING_EFFORT ?? "low") as
  | "none" | "minimal" | "low" | "medium" | "high";
const MAX_HISTORY_TURNS = 24;
const MAX_TURN_CHARS = 600;

// Events the (untrusted) browser may send over the data channel. Everything
// else — changing the backend prompt, swapping tools — is refused server-side.
const ALLOWED_CLIENT_EVENTS = [
  "session.input_audio.mute",
  "session.input_audio.unmute",
  "session.instructions.append",
  "session.thinking.append",
  "session.commentary.append",
  "response.item.create",
  "response.create",
  "session.close",
];

type Body = {
  sdp?: string;
  mode?: "new" | "resume";
  history?: { role?: string; text?: string }[];
  boardSummary?: string;
  sessionTitle?: string;
  fileNames?: string[];
};

function buildResumeInput(
  history: Body["history"],
  boardSummary: string,
  sessionTitle: string,
): InitialItem[] {
  const items: InitialItem[] = [];
  const lines = [
    "Session event: resumed. The app reconnected to a tutoring session already in progress.",
    sessionTitle && sessionTitle !== "Session" ? `Session label: "${sessionTitle}" (a label, not proof of the exact problem).` : "",
    boardSummary ? `Whiteboard right now: ${boardSummary}` : "The whiteboard summary is unavailable.",
    "Orient briefly, ask whether to continue, and never invent board content.",
  ].filter(Boolean);
  items.push({
    type: "message",
    role: "developer",
    content: [{ type: "input_text", text: lines.join(" ") }],
  });
  for (const turn of (history ?? []).slice(-MAX_HISTORY_TURNS)) {
    const text = typeof turn.text === "string" ? turn.text.trim().slice(0, MAX_TURN_CHARS) : "";
    if (!text) continue;
    if (turn.role === "student") {
      items.push({ type: "message", role: "user", content: [{ type: "input_text", text }] });
    } else if (turn.role === "tutor") {
      items.push({ type: "message", role: "assistant", content: [{ type: "output_text", text }] });
    }
  }
  return items;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[live-session] OPENAI_API_KEY is not set");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.sdp !== "string" || !body.sdp.includes("v=0")) {
    return NextResponse.json({ error: "missing_sdp" }, { status: 400 });
  }
  const mode = body.mode === "resume" ? "resume" : "new";

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
  const voice: BuiltInVoice = isTutorVoiceName(row?.voiceName) ? row!.voiceName as BuiltInVoice : DEFAULT_TUTOR_VOICE;

  const sessionConfig: LiveCreateParams["session"] = {
    model: "gpt-live-1",
    instructions: buildVoiceInstructions(profile),
    audio: { output: { voice } },
    client: { data_channel: { allowed_client_events: ALLOWED_CLIENT_EVENTS } },
    delegation: {
      type: "responses",
      responses: {
        model: BACKEND_MODEL,
        instructions: buildBackendInstructions(profile, notes),
        tools: WHITEBOARD_FUNCTION_TOOLS,
        tool_choice: "auto",
        parallel_tool_calls: false,
        reasoning: { effort: REASONING_EFFORT },
        text: { verbosity: "low" },
        max_output_tokens: 2000,
      },
    },
    store: false,
  };
  if (mode === "resume") {
    sessionConfig.input = buildResumeInput(
      body.history,
      typeof body.boardSummary === "string" ? body.boardSummary.slice(0, 1200) : "",
      typeof body.sessionTitle === "string" ? body.sessionTitle : "",
    );
  }

  try {
    const client = new OpenAI({ apiKey });
    const result = await client.live.create({
      session: sessionConfig,
      transport: { type: "webrtc", sdp: body.sdp },
    });
    const fileCount = Array.isArray(body.fileNames) ? body.fileNames.length : 0;
    return NextResponse.json({
      sessionId: result.session.id,
      sdp: result.transport.sdp,
      notes,
      voice,
      backendModel: BACKEND_MODEL,
      greeting: buildGreetingLine(profile, fileCount),
      resume: buildResumeLine(profile),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[live-session] create failed:", message);
    return NextResponse.json({ error: "session_create_failed", detail: message.slice(0, 300) }, { status: 502 });
  }
}
