// POST /api/illustrate: one picture for the board (lib/illustration). The
// planner orders illustrate(what | notice); the live client asks here while the
// tutor says "let me draw that", and the page draws the scene that comes back
// with draw_illustration. The model writes a scene, never SVG: the layout
// engine draws it, and the label guard turns any number the student has not
// seen into "?" so a picture never gives the answer away.
//
// Haiku 5.5 answered in 1.3 s at the median and 2.4 s at worst on 45 calls
// (Oct 17 2026, scripts/illustrate-measure.ts), at about $0.0002 a picture.
// Gemini 3.8 Flash is asked too if Haiku has not answered in 3.5 s.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { illustrate } from "@/lib/illustration/request";

// At most one picture a reply is asked for; this only stops a runaway client.
const PER_MINUTE = 10;
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
  if (!allowed(session.user.id, Date.now())) return NextResponse.json({ scene: null, error: "rate_limited" }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const what = text(body.what, 300);
  if (!what.trim()) return NextResponse.json({ scene: null, error: "nothing_to_draw" }, { status: 400 });
  const conversation = (Array.isArray(body.conversation) ? body.conversation : [])
    .slice(-6)
    .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : {}))
    .filter((l) => l.who === "student" || l.who === "tutor")
    .map((l) => ({ who: l.who as "student" | "tutor", text: text(l.text, 300) }));
  // The request, the recipe, the hedge, the label guard and the render check
  // live in lib/illustration/request.ts, which the bench calls too.
  const r = await illustrate({ grade: text(body.grade, 40), what, notice: text(body.notice, 300), conversation, board: text(body.board, 900) });
  if (!r.ok) return NextResponse.json({ scene: null, ms: r.ms, failures: r.failures });
  const { ok: _ok, failures, ...picture } = r;
  void _ok;
  return NextResponse.json({ ...picture, ...(failures.length ? { failures } : {}) });
}
