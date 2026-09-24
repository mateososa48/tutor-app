import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { closeLink, linkForOwner, pollLink } from "@/lib/db/phone-links";

type RouteCtx = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "no-store" };

// GET /api/phone-links/[id]?after=<last photo id> — the laptop's poll: where
//   the code stands, and the next photos the phone has sent. Photos up to
//   `after` are the ones the laptop already has, and are deleted.
// DELETE /api/phone-links/[id] — Done: the code stops working.
//
// Both only for the signed-in owner; anyone else gets a 404, as if the link
// did not exist.

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const link = await linkForOwner(id, session.user.id);
  if (!link) return NextResponse.json({ error: "not found" }, { status: 404 });

  const raw = Number(req.nextUrl.searchParams.get("after"));
  const after = Number.isInteger(raw) && raw > 0 ? raw : 0;
  return NextResponse.json(await pollLink(link, after), { headers: NO_STORE });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await closeLink(id, session.user.id);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
