import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { loadAdminSession } from "@/lib/admin-data";
import { analyzeSession, buildMarkdownExport } from "@/lib/session-recording";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/admin/sessions/[id]/export?format=md|json — a session as a readable
// Markdown timeline (for reading closely) or as JSON with every event. Admin only.
export async function GET(req: NextRequest, ctx: RouteCtx) {
  if (!(await getAdminSession())) return new NextResponse("Not found", { status: 404 });
  const { id } = await ctx.params;
  const data = await loadAdminSession(id);
  if (!data) return new NextResponse("Not found", { status: 404 });

  const frameUrl = (frameId: number) => `${req.nextUrl.origin}/api/admin/frames/${frameId}`;
  const filename = `session-${id.replace(/[^A-Za-z0-9_-]/g, "")}`;

  if (req.nextUrl.searchParams.get("format") === "json") {
    const body = JSON.stringify(
      {
        session: data.session,
        analysis: analyzeSession(data.events, data.session.durationSec * 1000),
        frames: data.frames.map((f) => ({ ...f, url: frameUrl(f.id) })),
        events: data.events,
      },
      null,
      2,
    );
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.json"` },
    });
  }

  const markdown = buildMarkdownExport({
    sessionId: data.session.id,
    title: data.session.title,
    studentName: data.session.userName,
    studentEmail: data.session.userEmail,
    startedAt: data.session.startedAt,
    durationSec: data.session.durationSec,
    events: data.events,
    frameUrl,
  });
  return new NextResponse(markdown, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.md"` },
  });
}
