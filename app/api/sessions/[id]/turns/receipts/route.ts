import { NextResponse } from "next/server";
import { requireSession } from "@/lib/access";
import { loadLesson, saveLesson } from "@/lib/db/lesson-state";
import { applyReceipts } from "@/lib/lesson/state";
import type { BoardReceipt } from "@/lib/lesson/types";

// What the board actually did with a turn's ops (Oct 31 2026, Plan B B7). The
// lesson's board is what was applied, not what was planned: a drawing that
// failed is not a thing the next turn can point at.

const STATUSES = new Set(["applied", "unchanged", "blocked", "partial", "failed"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireSession(id, "write");
  if ("response" in gate) return gate.response;
  const body = (await req.json().catch(() => ({}))) as { turnId?: unknown; receipts?: unknown };
  if (typeof body.turnId !== "string" || !Array.isArray(body.receipts)) return NextResponse.json({ error: "turnId and receipts" }, { status: 400 });
  const receipts: BoardReceipt[] = body.receipts.slice(0, 40).flatMap((r) => {
    const o = r as Partial<BoardReceipt>;
    if (typeof o.opId !== "string" || !STATUSES.has(String(o.status))) return [];
    return [{ opId: o.opId.slice(0, 60), status: o.status as BoardReceipt["status"], ...(typeof o.itemId === "string" ? { itemId: o.itemId.slice(0, 20) } : {}), ...(Array.isArray(o.parts) ? { parts: o.parts.filter((p): p is string => typeof p === "string").slice(0, 80) } : {}), ...(typeof o.issue === "string" ? { issue: o.issue.slice(0, 200) } : {}), at: Date.now() }];
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const lesson = await loadLesson(id);
    if (!lesson) return NextResponse.json({ error: "no lesson" }, { status: 404 });
    if (lesson.pending?.turnId !== body.turnId) return NextResponse.json({ ok: true, stale: true, revision: lesson.revision });
    const next = applyReceipts(lesson, body.turnId, receipts);
    const failed = receipts.filter((r) => r.status === "failed" || r.status === "blocked");
    if (await saveLesson(id, lesson.revision, next, [{ kind: "lesson.receipts", payload: { turnId: body.turnId, receipts, failed: failed.length } }])) return NextResponse.json({ ok: true, revision: next.revision });
  }
  return NextResponse.json({ error: "busy" }, { status: 409 });
}
