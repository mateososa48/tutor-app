// POST /api/illustrate: one picture for the board (lib/illustration). The
// planner orders illustrate(what | notice); the live client asks here while the
// tutor says "let me draw that", and the page draws the scene that comes back
// with draw_illustration. The model writes a scene, never SVG: the layout
// engine draws it, and the label guard turns any number the student has not
// seen into "?" so a picture never gives the answer away.
//
// Haiku 5.5 answered in 1.3 s at the median and 2.4 s at worst on 45 calls
// (Oct 17 2026, scripts/illustrate-measure.ts), at about $0.0002 a picture.
// Gemini 3.8 Flash is asked too if Haiku has not answered by HEDGE_MS.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hedged } from "@/lib/hedge";
import { callCost, callIllustrator } from "@/lib/illustration/model";
import { guardLabels, illustratorPrompt, partNames } from "@/lib/illustration/prompt";
import { parseScene, renderScene } from "@/lib/illustration/scene";

const MODELS = (process.env.ILLUSTRATOR_MODELS || "claude-haiku-5-5,gemini-3.8-flash").split(",").map((s) => s.trim()).filter(Boolean);
// The tutor is talking meanwhile; a picture that comes after its question is
// still useful, but one that comes a whole turn late is confusing.
const DEADLINE_MS = 7_000;
const HEDGE_MS = 3_500;
// At most one picture a problem is asked for; this only stops a runaway client.
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
  const request = { grade: text(body.grade, 40), what, notice: text(body.notice, 300), conversation, board: text(body.board, 900) };
  const prompt = illustratorPrompt(request);
  // Everything the student has had: numbers in it may be labelled, others not.
  const seen = [conversation.map((l) => l.text).join(" "), request.board, request.what, request.notice].join(" ");

  const started = Date.now();
  const failures: string[] = [];
  const won = await hedged(
    MODELS,
    async (model, signal) => {
      try {
        const reply = await callIllustrator(model, prompt, signal);
        if (!reply) {
          failures.push(`${model} no key`);
          return null;
        }
        const scene = parseScene(reply.text);
        if (!scene) {
          failures.push(`${model} unreadable`);
          return null;
        }
        const guarded = guardLabels(scene, seen);
        const drawn = renderScene(guarded.scene);
        // A scene that lays out to nothing is no picture at all.
        if (!drawn.w || !drawn.h || !Object.keys(drawn.parts).length && drawn.problems.length) {
          failures.push(`${model} empty`);
          return null;
        }
        return { scene: guarded.scene, parts: partNames(drawn.parts), withheld: guarded.withheld, problems: drawn.problems, cost: callCost(model, reply.usage) };
      } catch (err) {
        if (!signal.aborted) failures.push(String((err as Error).message).slice(0, 80));
        return null;
      }
    },
    { hedgeMs: HEDGE_MS, deadlineMs: DEADLINE_MS },
  );
  if (!won) return NextResponse.json({ scene: null, ms: Date.now() - started, failures });
  return NextResponse.json({ ...won.value, model: won.model, ms: Date.now() - started, ...(failures.length ? { failures } : {}) });
}
