import { NextRequest, NextResponse } from "next/server";
import { pendingSummaries } from "@/lib/db/session-summary";

// The sweeper. A session's own tab fires the summary when it ends, but a
// closed laptop, a lost connection or a failed first try would leave it
// waiting forever, so this walks the queue on a schedule (vercel.json).
//
// Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled runs; the
// same header lets the session route accept the calls this makes.

export const maxDuration = 300;

/** A minute of grace, so a session whose own tab is still working is left alone. */
const GRACE_MS = 60_000;
const BATCH = 5;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ids = await pendingSummaries(BATCH, Date.now() - GRACE_MS);
  const origin = new URL(req.url).origin;
  const results: { id: string; ok: boolean }[] = [];

  // One at a time: each is a model call, and the point is to drain the queue
  // eventually, not to finish this run quickly.
  for (const id of ids) {
    try {
      const res = await fetch(`${origin}/api/sessions/${encodeURIComponent(id)}/summary`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
      results.push({ id, ok: res.ok });
    } catch {
      results.push({ id, ok: false });
    }
  }

  return NextResponse.json({ swept: results.length, results });
}
