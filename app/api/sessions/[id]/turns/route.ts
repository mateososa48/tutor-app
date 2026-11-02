import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/access";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { loadLesson, saveLesson } from "@/lib/db/lesson-state";
import { runTurn, type Planner } from "@/lib/lesson/engine";
import { callPlanModel } from "@/lib/lesson/provider";
import { createLesson } from "@/lib/lesson/state";
import { resolveRef } from "@/lib/lesson/compile";
import { extractSourceProblems, namedProblem, type SourceFile } from "@/lib/lesson/source";
import type { LessonState, StudentInput } from "@/lib/lesson/types";

// One committed student line through the tutoring engine (Oct 31 2026, Plan B
// B8). The first line is the intake: it creates the lesson, reads the uploaded
// worksheet into problems once, and plans the opening. Every later line loads
// the lesson, runs one turn and saves it if no other request moved the lesson
// on meanwhile (409 otherwise; the client sends the line again).

export const maxDuration = 60;

type Body = {
  text?: unknown;
  source?: unknown;
  inputId?: unknown;
  files?: unknown;
  offsetMs?: unknown;
  model?: unknown;
};

// In development a session may pick its planner, to compare models on the same cases.
const DEV_MODELS = new Set(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-sonnet-5-5@low", "claude-haiku-5-5@medium", "claude-opus-5-5@low", "claude-opus-5-5+fast", "claude-opus-5-5@low+fast"]);

const MAX_TEXT = 1200;
const MAX_FILE_B64 = 6_000_000;

function readFiles(raw: unknown): SourceFile[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 4)
    .map((f) => f as Partial<SourceFile>)
    .filter((f) => typeof f.base64 === "string" && f.base64.length < MAX_FILE_B64 && typeof f.mimeType === "string")
    .map((f) => ({ label: String(f.label ?? "File 1").slice(0, 40), name: String(f.name ?? "file").slice(0, 120), mimeType: f.mimeType!, base64: f.base64! }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireSession(id, "write");
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => ({}))) as Body;
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  const source = body.source === "intake" || body.source === "spoken" ? body.source : "typed";
  if (!text) return NextResponse.json({ error: "empty line" }, { status: 400 });
  const offsetMs = typeof body.offsetMs === "number" && Number.isFinite(body.offsetMs) ? Math.max(0, Math.round(body.offsetMs)) : 0;

  const stored = await loadLesson(id);
  let lesson: LessonState;
  const extra: Array<{ kind: string; payload: Record<string, unknown> }> = [];
  if (stored) lesson = stored;
  else {
    const [profile] = await db.select({ grade: userProfiles.gradeLevel }).from(userProfiles).where(eq(userProfiles.userId, gate.row.userId)).limit(1);
    const files = readFiles(body.files);
    let problems: Awaited<ReturnType<typeof extractSourceProblems>> = [];
    if (files.length) {
      const t0 = Date.now();
      try {
        problems = await extractSourceProblems(files, AbortSignal.timeout(20_000));
        extra.push({ kind: "lesson.source", payload: { ms: Date.now() - t0, problems: problems.map((p) => ({ id: p.id, statement: p.statement, math: p.math, givens: p.givens })) } });
      } catch (err) {
        extra.push({ kind: "lesson.source", payload: { ms: Date.now() - t0, error: (err as Error).message.slice(0, 200) } });
      }
    }
    // With a worksheet, the problem is the one they named; with one problem, that one; else they pick.
    const picked = problems.length ? namedProblem(text, problems, false, { current: null }) ?? (problems.length === 1 ? problems[0].id : null) : undefined;
    lesson = createLesson({ intake: text, grade: profile?.grade || undefined, ...(files.length ? { uploads: files.length } : {}), ...(problems.length ? { problems, current: picked ?? null } : {}) });
  }

  // A later line that names another problem on the sheet moves to it.
  if (stored && lesson.problems.length > 1) {
    const named = namedProblem(text, lesson.problems, lesson.current === null, { current: lesson.current });
    if (named && named !== lesson.current) lesson = { ...lesson, current: named, problems: lesson.problems.map((p) => (p.id === lesson.current && p.status === "open" ? { ...p, status: "set_aside" as const } : p.id === named ? { ...p, status: "open" as const } : p)) };
  }

  const input: StudentInput = { id: typeof body.inputId === "string" ? body.inputId.slice(0, 40) : `u${lesson.turns + 1}`, source, text, at: Date.now() };
  const devModel = process.env.NODE_ENV !== "production" && typeof body.model === "string" && DEV_MODELS.has(body.model) ? body.model : null;
  const planner: Planner | undefined = devModel ? (system, messages, onPartial) => callPlanModel(devModel, system, messages, undefined, onPartial) : undefined;
  const turn = async (onEarly?: (text: string) => void): Promise<{ status: number; body: Record<string, unknown> }> => {
    const result = await runTurn(lesson, input, { turnId: `t${lesson.turns + 1}`, ...(planner ? { planner } : {}), ...(onEarly ? { onEarly } : {}) });
    const log = result.log;
    extra.push({
      kind: "lesson.turn",
      payload: {
        turnId: result.turnId,
        input,
        speech: result.speech,
        ops: result.ops.map((o) => ({ opId: o.opId, type: o.type, ...(o.type === "mark" ? { ref: o.ref, how: o.how } : o.type === "heading" ? { title: o.title } : o.type === "tool" || o.type === "illustrate" ? { sid: o.sid, label: o.label } : { sid: o.sid, kind: o.kind, label: o.label }) })),
        model: log.model,
        ms: log.ms,
        calls: log.calls,
        issues: log.issues,
        fixes: log.fixes,
        fallback: log.fallback,
        move: log.move,
        firstTokenMs: log.firstTokenMs,
        earlyMs: log.earlyMs,
        usage: log.usage,
        verdict: log.assessment.answer?.verdict ?? null,
        final: log.assessment.final,
        claims: log.assessment.claims.map((c) => ({ text: c.text, verdict: c.verdict, correct: c.correct })),
        signals: log.assessment.signals,
      },
    });
    const saved = await saveLesson(id, stored ? stored.revision : null, result.state, extra, offsetMs);
    if (!saved) return { status: 409, body: { error: "the lesson moved on; send the line again" } };
    // Needs as board ids the page knows ("work:P1.L2"), and what is already on it.
    const speech = result.speech.map((seg) => ({ ...seg, needs: seg.needs.map((n) => { const hit = resolveRef(result.state, [], n); return hit ? `${hit.obj.sid}${hit.part ? `.${hit.part}` : ""}` : n; }) }));
    const items = Object.fromEntries(result.state.board.filter((b) => b.itemId).map((b) => [b.sid, b.itemId!]));
    return {
      status: 200,
      body: { turnId: result.turnId, speech, items, ops: result.ops, close: result.state.closing, revision: result.state.revision, log: { model: log.model, ms: log.ms, calls: log.calls, fallback: log.fallback, move: log.move, issues: log.issues.length, firstTokenMs: log.firstTokenMs, earlyMs: log.earlyMs } },
    };
  };

  // Streamed: the first sentence goes out the moment it is safe to say, then
  // the whole turn (one JSON object a line).
  if ((req.headers.get("accept") ?? "").includes("application/x-ndjson")) {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: Record<string, unknown>) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        try {
          const out = await turn((early) => send({ type: "early", text: early }));
          send({ type: out.status === 200 ? "turn" : "error", status: out.status, ...out.body });
        } catch (err) {
          send({ type: "error", status: 500, error: (err as Error).message.slice(0, 200) });
        }
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
  }
  const out = await turn();
  return NextResponse.json(out.body, { status: out.status });
}
