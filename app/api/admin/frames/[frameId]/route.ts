import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessionFrames } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/admin";

type RouteCtx = { params: Promise<{ frameId: string }> };

// GET /api/admin/frames/[frameId] — a recorded board picture. Admin only; anyone else gets a 404.
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  if (!(await getAdminSession())) return new NextResponse("Not found", { status: 404 });
  const { frameId } = await ctx.params;
  const id = Number(frameId);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Not found", { status: 404 });
  const [row] = await db.select({ data: sessionFrames.data, mime: sessionFrames.mime }).from(sessionFrames).where(eq(sessionFrames.id, id)).limit(1);
  if (!row) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(row.data, "base64")), {
    headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
