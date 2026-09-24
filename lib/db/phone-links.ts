import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "./client";
import { phoneLinks, phonePhotos } from "./schema";
import {
  LINK_TTL_MS,
  MAX_PHOTOS,
  PHOTOS_PER_POLL,
  SWEEP_AFTER_MS,
  linkState,
  type LinkState,
  type PhotoPayload,
} from "@/lib/phone-link";

// The database half of sending a photo from a phone (lib/phone-link.ts has
// the rules). The laptop holds the link's id and polls with its sign-in; the
// phone holds only the token, whose SHA-256 is all that is stored.

export type PhoneLink = typeof phoneLinks.$inferSelect;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A new link for this user. Links that ran out over an hour ago are swept first, taking their photos with them. */
export async function createLink(userId: string, now = Date.now()): Promise<{ id: string; token: string; expiresAt: number }> {
  await db.delete(phoneLinks).where(lt(phoneLinks.expiresAt, now - SWEEP_AFTER_MS));
  const token = randomBytes(24).toString("base64url");
  const id = randomUUID();
  const expiresAt = now + LINK_TTL_MS;
  await db.insert(phoneLinks).values({ id, tokenHash: hashToken(token), userId, expiresAt });
  return { id, token, expiresAt };
}

/** The laptop's view: its own link only. */
export async function linkForOwner(id: string, userId: string): Promise<PhoneLink | null> {
  const [row] = await db
    .select()
    .from(phoneLinks)
    .where(and(eq(phoneLinks.id, id), eq(phoneLinks.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** What the phone page needs to render: where the code stands, or "missing" when it opens nothing. */
export async function snapView(token: string, now = Date.now()): Promise<{ state: LinkState | "missing"; expiresAt: number; uploads: number }> {
  const link = await linkByToken(token);
  if (!link) return { state: "missing", expiresAt: 0, uploads: 0 };
  return { state: linkState(link, now), expiresAt: link.expiresAt, uploads: link.uploads };
}

/** The phone's view: whatever the token opens. */
export async function linkByToken(token: string): Promise<PhoneLink | null> {
  const [row] = await db.select().from(phoneLinks).where(eq(phoneLinks.tokenHash, hashToken(token))).limit(1);
  return row ?? null;
}

export type PhonePhoto = { id: number; data: string; width: number; height: number };

/**
 * One poll from the laptop. `after` is the last photo id it has, so photos up
 * to it are deleted here (a lost response is simply asked for again), and the
 * next few are returned in the order they were taken.
 */
export async function pollLink(link: PhoneLink, after: number, now = Date.now()): Promise<{ state: LinkState; expiresAt: number; uploads: number; photos: PhonePhoto[] }> {
  if (after > 0) {
    await db.delete(phonePhotos).where(and(eq(phonePhotos.linkId, link.id), lte(phonePhotos.id, after)));
  }
  const photos = await db
    .select({ id: phonePhotos.id, data: phonePhotos.data, width: phonePhotos.width, height: phonePhotos.height })
    .from(phonePhotos)
    .where(and(eq(phonePhotos.linkId, link.id), gt(phonePhotos.id, after)))
    .orderBy(asc(phonePhotos.id))
    .limit(PHOTOS_PER_POLL);
  return { state: linkState(link, now), expiresAt: link.expiresAt, uploads: link.uploads, photos };
}

/** Done on the laptop: the code stops working and anything not yet collected goes. */
export async function closeLink(id: string, userId: string, now = Date.now()): Promise<boolean> {
  const closed = await db
    .update(phoneLinks)
    .set({ closedAt: now })
    .where(and(eq(phoneLinks.id, id), eq(phoneLinks.userId, userId), isNull(phoneLinks.closedAt)))
    .returning({ id: phoneLinks.id });
  await db.delete(phonePhotos).where(eq(phonePhotos.linkId, id));
  return closed.length > 0;
}

/** The phone opened the page: the laptop can say "Connected". Only the first open counts. */
export async function markOpened(link: PhoneLink, now = Date.now()): Promise<PhoneLink> {
  if (link.openedAt !== null) return link;
  await db
    .update(phoneLinks)
    .set({ openedAt: now })
    .where(and(eq(phoneLinks.id, link.id), isNull(phoneLinks.openedAt)));
  return { ...link, openedAt: now };
}

/**
 * Adds a photo if the link still takes one. The slot is claimed in a single
 * conditional update, so two photos sent at once can never take a link past
 * its limit, and a link that closed or ran out in between refuses cleanly.
 */
export async function addPhoto(link: PhoneLink, photo: PhotoPayload, now = Date.now()): Promise<{ ok: true; uploads: number } | { ok: false; state: LinkState }> {
  const claimed = await db
    .update(phoneLinks)
    .set({ uploads: sql`${phoneLinks.uploads} + 1`, openedAt: link.openedAt ?? now })
    .where(
      and(
        eq(phoneLinks.id, link.id),
        isNull(phoneLinks.closedAt),
        gt(phoneLinks.expiresAt, now),
        lt(phoneLinks.uploads, MAX_PHOTOS),
      ),
    )
    .returning({ uploads: phoneLinks.uploads });
  if (claimed.length === 0) {
    const [fresh] = await db.select().from(phoneLinks).where(eq(phoneLinks.id, link.id)).limit(1);
    return { ok: false, state: fresh ? linkState(fresh, now) : "closed" };
  }
  await db.insert(phonePhotos).values({ linkId: link.id, data: photo.data, width: photo.width, height: photo.height, bytes: photo.bytes });
  return { ok: true, uploads: claimed[0].uploads };
}
