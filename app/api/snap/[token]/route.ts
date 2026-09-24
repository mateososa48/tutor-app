import { NextRequest, NextResponse } from "next/server";
import { addPhoto, linkByToken, markOpened } from "@/lib/db/phone-links";
import { acceptsPhotos, checkPhoto, isTokenShape, linkState, MAX_PHOTOS, type LinkState } from "@/lib/phone-link";

// POST /api/snap/[token] — the phone's side. Public: the phone is not signed
// in, and the token in the QR code is the only permission it has, which is to
// add photos to the laptop that made it.
//
//   { kind: "open" }                          the page loaded, so the laptop can say "Connected"
//   { kind: "photo", data, width, height }    one JPEG the phone drew, base64
//
// Always answers with where the link stands, so the phone can say why it
// stopped taking photos. Limits are per server instance and in memory, like
// /api/faq: enough to stop a script, not a quota.

type RouteCtx = { params: Promise<{ token: string }> };

const PER_MINUTE = 40;
const hits = new Map<string, number[]>();

function limited(ip: string, now: number): boolean {
  const mine = (hits.get(ip) ?? []).filter((t) => t > now - 60_000);
  if (mine.length >= PER_MINUTE) return true;
  mine.push(now);
  hits.set(ip, mine);
  if (hits.size > 5000) for (const key of [...hits.keys()].slice(0, 1000)) hits.delete(key);
  return false;
}

const NO_STORE = { "Cache-Control": "no-store" };

const STATUS: Record<LinkState, number> = { waiting: 200, connected: 200, full: 409, expired: 410, closed: 410 };

function reply(state: LinkState, uploads: number, extra: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json({ state, uploads, max: MAX_PHOTOS, ...extra }, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const now = Date.now();
  if (limited(ip, now)) return NextResponse.json({ error: "Too many photos at once. Wait a moment and try again." }, { status: 429, headers: NO_STORE });

  const link = isTokenShape(token) ? await linkByToken(token) : null;
  if (!link) return NextResponse.json({ state: "missing", error: "This code doesn't work." }, { status: 404, headers: NO_STORE });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const state = linkState(link, now);

  if (body?.kind === "open") {
    if (!acceptsPhotos(state)) return reply(state, link.uploads);
    const opened = await markOpened(link, now);
    return reply(linkState(opened, now), opened.uploads);
  }

  if (body?.kind !== "photo") return NextResponse.json({ error: "Nothing to do." }, { status: 400, headers: NO_STORE });
  if (!acceptsPhotos(state)) return reply(state, link.uploads, {}, STATUS[state]);

  const checked = checkPhoto(body);
  if (!checked.ok) return reply(state, link.uploads, { error: checked.error }, 400);

  const added = await addPhoto(link, checked.photo, now);
  if (!added.ok) return reply(added.state, link.uploads, {}, STATUS[added.state]);
  const after = linkState({ ...link, openedAt: link.openedAt ?? now, uploads: added.uploads }, now);
  return reply(after, added.uploads);
}
