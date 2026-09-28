// POST /api/plan: the planner's one order for the tutor's reply to the
// student's new line (lib/tutor-planner). The Gemini client calls it with
// ?plan=1: before a typed line goes to the tutor, and inside a check_answer
// the tutor makes before speaking to a spoken answer. The key stays on the
// server. It must answer inside the turn, so it gives up after DEADLINE_MS
// and the tutor goes on with the app's own note.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PLANNER_SYSTEM, plannerNote, plannerPrompt, type PlannerTurn } from "@/lib/tutor-planner";

// The small models answer in about 1-2 s; the bigger flash models took 10-37 s
// under load on Sept 27 2026, too slow for a live turn.
const MODELS = (process.env.PLANNER_MODELS || "gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",").map((s) => s.trim()).filter(Boolean);
const DEADLINE_MS = 2_400;
// A student line every few seconds at most; this only stops a runaway client.
const PER_MINUTE = 40;
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ note: null, error: "misconfigured" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const line = text(body.line, 400);
  if (!line.trim()) return NextResponse.json({ note: null });
  const turns: PlannerTurn[] = (Array.isArray(body.turns) ? body.turns : [])
    .slice(-6)
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
    .map((t) => ({ student: text(t.student, 300), tutor: text(t.tutor, 400), tools: Array.isArray(t.tools) ? t.tools.filter((x): x is string => typeof x === "string").slice(0, 8) : [] }));
  const prompt = plannerPrompt({
    grade: text(body.grade, 40) || "a student",
    topic: text(body.topic, 200),
    turns,
    line,
    verdict: text(body.verdict, 400) || null,
    board: text(body.board, 900),
    state: text(body.state, 300) || null,
    reminders: text(body.reminders, 400) || null,
  });

  const started = Date.now();
  for (const model of MODELS) {
    const left = DEADLINE_MS - (Date.now() - started);
    if (left < 300) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), left);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PLANNER_SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 800, thinkingConfig: { thinkingLevel: "low" } },
        }),
        signal: controller.signal,
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
      const note = plannerNote(j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "");
      if (note) return NextResponse.json({ note, model, ms: Date.now() - started });
    } catch {
      /* timed out or failed: the next model, or none */
    } finally {
      clearTimeout(timer);
    }
  }
  return NextResponse.json({ note: null, ms: Date.now() - started });
}
