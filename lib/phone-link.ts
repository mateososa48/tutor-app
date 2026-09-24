// Sending a photo from a phone into a session on a laptop.
//
// The laptop asks for a link and shows it as a QR code. The link is a random
// token that can do exactly one thing: add photos to the laptop that made it.
// The phone opens it (no sign-in), takes pictures, shrinks each one to a
// 1600px JPEG and posts it; the laptop polls for what has arrived and adds it
// to its files, the same way a dropped photo is added.
//
// This file is pure and safe to import on both sides: limits, the link's
// state, the checks a photo must pass, and the arithmetic. Hashing and the
// database live in lib/db/phone-links.ts.

/** How long a code works. Long enough to find a phone and take a few pictures. */
export const LINK_TTL_MS = 20 * 60_000;
/** Photos one code accepts. A worksheet is a few pages, not a camera roll. */
export const MAX_PHOTOS = 12;
/** The long edge a photo is shrunk to on the phone: what a worksheet page needs, and what our PDF pages use. */
export const PHOTO_MAX_EDGE = 1600;
/** Decoded bytes a photo may be. The phone lowers JPEG quality until it fits. */
export const PHOTO_MAX_BYTES = 1_200_000;
/** How often the laptop asks for new photos while a code is live. */
export const POLL_MS = 1500;
/** Photos returned by one poll. Two at the byte limit stay under Vercel's 4.5 MB response cap. */
export const PHOTOS_PER_POLL = 2;
/** Keep expired links around this long before sweeping them, so a late poll still reads "expired". */
export const SWEEP_AFTER_MS = 60 * 60_000;

export type LinkState = "waiting" | "connected" | "full" | "expired" | "closed";

export type LinkRow = { expiresAt: number; openedAt: number | null; closedAt: number | null; uploads: number };

/** Where a link stands. Closed and expired are final; full still delivers what it has. */
export function linkState(link: LinkRow, now: number): LinkState {
  if (link.closedAt !== null) return "closed";
  if (now >= link.expiresAt) return "expired";
  if (link.uploads >= MAX_PHOTOS) return "full";
  return link.openedAt === null ? "waiting" : "connected";
}

/** Whether the phone may still send a photo. */
export function acceptsPhotos(state: LinkState): boolean {
  return state === "waiting" || state === "connected";
}

/** A token as we mint them: 24 random bytes in base64url. Anything else is not worth a database lookup. */
export function isTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value);
}

/** Minutes left, rounded up, never below zero: "Works for 19 more minutes". */
export function minutesLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 60_000));
}

/** The size to draw a photo at so its long edge is at most `max`, never enlarging. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_EDGE): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Decoded size of a base64 string, without decoding it. */
export function base64Bytes(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

export type PhotoPayload = { data: string; width: number; height: number; bytes: number };

/**
 * What a phone may post. The phone always sends a JPEG it drew itself, so
 * anything that is not one (by its first bytes, not by what it claims) is
 * refused, as is anything larger than the phone would ever make.
 */
export function checkPhoto(body: unknown): { ok: true; photo: PhotoPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "No photo was sent." };
  const b = body as Record<string, unknown>;
  const data = typeof b.data === "string" ? b.data : "";
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { ok: false, error: "That photo didn't come through." };
  // A JPEG starts FF D8 FF, which in base64 is "/9j/".
  if (!data.startsWith("/9j/")) return { ok: false, error: "Only photos can be sent." };
  const bytes = base64Bytes(data);
  if (bytes > PHOTO_MAX_BYTES) return { ok: false, error: "That photo is too big." };
  const width = Number(b.width);
  const height = Number(b.height);
  const edge = (n: number) => Number.isInteger(n) && n >= 16 && n <= PHOTO_MAX_EDGE;
  if (!edge(width) || !edge(height)) return { ok: false, error: "That photo didn't come through." };
  return { ok: true, photo: { data, width, height, bytes } };
}

/** "Phone photo 3.jpg", numbered after the phone photos already in the list. */
export function phonePhotoName(existingNames: readonly string[], offset: number): string {
  const taken = existingNames.filter((n) => /^Phone photo \d+\.jpg$/.test(n)).length;
  return `Phone photo ${taken + offset + 1}.jpg`;
}

// ── Reaching the laptop from the phone in development ─────────────────────

type NetInterface = { family: string | number; address: string; internal: boolean };

/** A private IPv4 address (the kind a home or school network hands out). */
export function isPrivateIPv4(address: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/**
 * The laptop's address on the local network, for a QR code a phone can open
 * during development: a phone cannot reach "localhost". Home networks first
 * (192.168), then 10.x, then 172.16–31.
 */
export function pickLanAddress(interfaces: Record<string, NetInterface[] | undefined>): string | null {
  const candidates: string[] = [];
  for (const list of Object.values(interfaces)) {
    for (const i of list ?? []) {
      const v4 = i.family === "IPv4" || i.family === 4;
      if (v4 && !i.internal && isPrivateIPv4(i.address)) candidates.push(i.address);
    }
  }
  const rank = (a: string) => (a.startsWith("192.168.") ? 0 : a.startsWith("10.") ? 1 : 2);
  return candidates.sort((x, y) => rank(x) - rank(y))[0] ?? null;
}

/** The origin to put in the QR code: the request's own, with "localhost" swapped for the LAN address when there is one. */
export function phoneOrigin(requestOrigin: string, lanAddress: string | null): string {
  const url = new URL(requestOrigin);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1";
  if (local && lanAddress) url.hostname = lanAddress;
  return url.origin;
}

/** Whether a URL can only be opened on this computer, so a phone scanning it would get nowhere. */
export function isLocalOnly(url: string): boolean {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}
