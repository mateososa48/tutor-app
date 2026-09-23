import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tutorSessions } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import {
  failSummary,
  MAX_TRIES,
  sessionAsText,
  sessionStats,
  storeSummary,
  summaryJob,
} from "@/lib/db/session-summary";
import { buildSummaryPrompt, parseSummary, readSummary } from "@/lib/session-summary";
import { generateSummary, summaryModelConfigured } from "@/lib/summary-model";

// The note a student reads after a session.
//
//   GET  — the summary and where it is up to, for the session's owner.
//   POST — write it. The owner's browser fires this when a session ends, and
//          the sweeper (app/api/cron/summaries) fires it for the ones where
//          the tab closed first. Either way the work happens here, once.

type RouteCtx = { params: Promise<{ id: string }> };

/** Long enough for one model call on a long session, inside Vercel's ceiling. */
export const maxDuration = 120;

async function owns(id: string): Promise<{ ok: boolean; userId?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  const [row] = await db.select({ userId: tutorSessions.userId }).from(tutorSessions).where(eq(tutorSessions.id, id)).limit(1);
  if (!row) return { ok: false };
  return { ok: row.userId === session.user.id, userId: session.user.id };
}

function internal(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  if (!(await owns(id)).ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [row] = await db
    .select({
      summary: tutorSessions.summary,
      state: tutorSessions.summaryState,
      status: tutorSessions.status,
      title: tutorSessions.title,
      startedAt: tutorSessions.startedAt,
      durationSec: tutorSessions.durationSec,
    })
    .from(tutorSessions)
    .where(eq(tutorSessions.id, id))
    .limit(1);

  // The session's own facts come back whether or not a summary was written,
  // so a failed one still shows when it was and how long it ran.
  return NextResponse.json({
    summary: readSummary(row?.summary),
    state: row?.state ?? "none",
    sessionStatus: row?.status ?? "active",
    // The session's own name, for the heading when no summary could be written.
    title: row?.title ?? "",
    startedAt: row?.startedAt ?? 0,
    durationSec: row?.durationSec ?? 0,
  });
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const byCron = internal(req);
  if (!byCron && !(await owns(id)).ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const job = await summaryJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Already written, or out of tries: nothing to do, and say so plainly rather
  // than spending a model call to find out.
  if (job.state === "done") return NextResponse.json({ ok: true, state: "done" });
  if (job.tries >= MAX_TRIES) return NextResponse.json({ ok: false, state: "failed" }, { status: 409 });
  if (!summaryModelConfigured()) {
    return NextResponse.json({ ok: false, error: "No summary model configured" }, { status: 503 });
  }

  const tries = job.tries + 1;
  try {
    const [stats, text] = await Promise.all([sessionStats(id, job.durationSec), sessionAsText(id)]);
    if (!text) throw new Error("The session has no recording to read");

    const { raw, model } = await generateSummary(buildSummaryPrompt({ stats, transcript: text }));
    const summary = parseSummary(raw, stats, { model });
    if (!summary) throw new Error("The model's answer had no headline or recap");

    await storeSummary(id, summary);
    return NextResponse.json({ ok: true, state: "done", summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await failSummary(id, message, tries);
    console.error("[summary]", id, message);
    return NextResponse.json(
      { ok: false, state: tries >= MAX_TRIES ? "failed" : "pending", error: message },
      { status: 500 },
    );
  }
}
