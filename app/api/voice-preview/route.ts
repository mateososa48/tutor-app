import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { isTutorVoiceName } from "@/lib/voice-settings";

// Short spoken sample of a tutor voice for the settings page. GPT-Live's
// built-in voices that we offer are also available on the TTS endpoint, which
// is far cheaper than opening a Live session just to hear a line.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "misconfigured" }, { status: 500 });

  let voice = "";
  let text = "";
  try {
    const body = (await req.json()) as { voice?: unknown; text?: unknown };
    voice = typeof body.voice === "string" ? body.voice : "";
    text = typeof body.text === "string" ? body.text.trim().slice(0, 160) : "";
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!isTutorVoiceName(voice) || !text) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const client = new OpenAI({ apiKey });
    const speech = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      instructions: "Speak warmly and naturally, at an unhurried pace, like a patient tutor.",
      response_format: "mp3",
    });
    const bytes = await speech.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    console.error("[voice-preview] failed:", err);
    return NextResponse.json({ error: "preview_failed" }, { status: 502 });
  }
}
