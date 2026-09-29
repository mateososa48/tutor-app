// POST /api/coach: the coach's order for the tutor's next turn (lib/tutor-coach).
//
// The Gemini client posts the last turns, the board list and the lesson state
// after each tutor turn (only with ?coach=1 until the benchmark A/B decides);
// the reply is one short order, or null. The key stays on the server.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { COACH_SYSTEM, coachNote, coachPrompt, type CoachTurn } from "@/lib/tutor-coach";

const MODEL = process.env.COACH_MODEL || "gemini-3.1-flash-lite";
const TIMEOUT_MS = 4_000;
// A tutor turn every few seconds at most; this only stops a runaway client.
const PER_MINUTE = 30;
const recent = new Map<string, number[]>();

function allowed(userId: string, now: number): boolean {
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= PER_MINUTE) return false;
  hits.push(now);
  recent.set(userId, hits);
  return true;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!allowed(session.user.id, Date.now())) return NextResponse.json({ note: null, error: "rate_limited" }, { status: 429 });
  // Production may carry only the NEXT_PUBLIC_ key, as /api/live-token allows.
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ note: null, error: "misconfigured" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const turns: CoachTurn[] = (Array.isArray(body.turns) ? body.turns : [])
    .slice(-8)
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
    .map((t) => ({ student: text(t.student, 300), tutor: text(t.tutor, 400), tools: Array.isArray(t.tools) ? t.tools.filter((x): x is string => typeof x === "string").slice(0, 8) : [] }));
  if (!turns.length) return NextResponse.json({ note: null });
  const prompt = coachPrompt({
    grade: text(body.grade, 40) || "a student",
    topic: text(body.topic, 200),
    turns,
    board: text(body.board, 900),
    state: text(body.state, 300) || null,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: COACH_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 120 },
      }),
      signal: controller.signal,
    });
    const j = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const reply = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return NextResponse.json({ note: coachNote(reply) });
  } catch {
    return NextResponse.json({ note: null, error: "unavailable" });
  } finally {
    clearTimeout(timer);
  }
}
