"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UploadedFile } from "@/lib/file-processor";
import { acceptsPhotos, isLocalOnly, PHOTOS_PER_POLL, phonePhotoName, POLL_MS, type LinkState } from "@/lib/phone-link";

// The laptop's half of "Use your phone" (lib/phone-link.ts has the rules).
// `open` asks the server for a code, then this polls it: each poll hands back
// the photos taken since the last one, which become ordinary files through
// the same `onAddFiles` a picked file goes through, so in a session they reach
// the tutor the same way. Polling stops once the code can take no more photos
// and nothing is left to collect. Closing (Done, or the screen going away)
// collects anything still waiting and then ends the code, so the phone says so.

export type PhoneLinkPhase = "idle" | "creating" | "live" | "error";

export type PhoneLink = {
  phase: PhoneLinkPhase;
  /** The address in the QR code. */
  url: string | null;
  expiresAt: number;
  state: LinkState;
  /** Photos this code has delivered to the laptop. */
  received: number;
  /** A phone could not open this address (development without a network address). */
  localOnly: boolean;
  open: () => void;
  /**
   * Ends the code after collecting whatever is still on its way. The photos
   * collected are added as usual, and also returned, for a screen that is
   * about to go away (the intake's Start) and passes them on itself.
   */
  close: (options?: { add?: boolean }) => Promise<UploadedFile[]>;
};

type PollReply = {
  state: LinkState;
  expiresAt: number;
  uploads: number;
  photos: { id: number; data: string; width: number; height: number }[];
};

const BACKOFF_MAX_MS = 8000;

export function usePhoneLink(files: UploadedFile[], onAddFiles: (files: UploadedFile[]) => void): PhoneLink {
  const [phase, setPhase] = useState<PhoneLinkPhase>("idle");
  const [link, setLink] = useState<{ id: string; url: string; expiresAt: number } | null>(null);
  const [state, setState] = useState<LinkState>("waiting");
  const [received, setReceived] = useState(0);

  // The newest list and callback, read when photos arrive rather than when
  // polling started. The list is synced only when it changes, so a render that
  // still shows the old list cannot undo photos counted a moment ago.
  const filesRef = useRef(files);
  const addRef = useRef(onAddFiles);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => {
    addRef.current = onAddFiles;
  }, [onAddFiles]);

  // The id of the photo last collected: the next poll acknowledges it, and the server deletes it.
  const cursor = useRef(0);
  // Bumped by every open and close, so a reply to an older code is ignored.
  const generation = useRef(0);

  const deliver = useCallback((photos: PollReply["photos"], add = true): UploadedFile[] => {
    if (photos.length === 0) return [];
    const existing = filesRef.current;
    const names = existing.map((f) => f.name);
    const entries: UploadedFile[] = photos.map((p, i) => ({
      id: `phone-${p.id}`,
      label: `File ${existing.length + i + 1}`,
      name: phonePhotoName(names, i),
      mimeType: "image/jpeg",
      base64: p.data,
    }));
    cursor.current = photos[photos.length - 1].id;
    // Counted here, so a second delivery in the same tick numbers after this one.
    filesRef.current = [...existing, ...entries];
    if (add) addRef.current(entries);
    setReceived((n) => n + entries.length);
    return entries;
  }, []);

  const poll = useCallback(async (id: string): Promise<PollReply | "gone" | null> => {
    try {
      const res = await fetch(`/api/phone-links/${id}?after=${cursor.current}`, { cache: "no-store" });
      if (res.status === 404) return "gone";
      if (!res.ok) return null;
      return (await res.json()) as PollReply;
    } catch {
      return null;
    }
  }, []);

  const open = useCallback(() => {
    const gen = ++generation.current;
    cursor.current = 0;
    setPhase("creating");
    setState("waiting");
    setReceived(0);
    setLink(null);
    fetch("/api/phone-links", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as { id: string; url: string; expiresAt: number };
      })
      .then((made) => {
        if (gen !== generation.current) {
          // Closed while the code was being made: end it straight away.
          void fetch(`/api/phone-links/${made.id}`, { method: "DELETE", keepalive: true }).catch(() => {});
          return;
        }
        setLink(made);
        setPhase("live");
      })
      .catch(() => {
        if (gen === generation.current) setPhase("error");
      });
  }, []);

  // The poll loop, one request at a time, for as long as there can be photos.
  useEffect(() => {
    if (phase !== "live" || !link) return;
    const gen = generation.current;
    let timer: number | undefined;
    let failures = 0;
    let stopped = false;

    const tick = async () => {
      const reply = await poll(link.id);
      if (stopped || gen !== generation.current) return;
      if (reply === "gone") {
        setState("closed");
        return;
      }
      if (!reply) {
        failures += 1;
        timer = window.setTimeout(tick, Math.min(BACKOFF_MAX_MS, POLL_MS * 2 ** failures));
        return;
      }
      failures = 0;
      deliver(reply.photos);
      setState(reply.state);
      const more = reply.photos.length === PHOTOS_PER_POLL;
      // A code that ended can still hold photos sent just before; stop once it is empty.
      if (!acceptsPhotos(reply.state) && reply.photos.length === 0) return;
      const wait = more ? 120 : document.hidden ? POLL_MS * 3 : POLL_MS;
      timer = window.setTimeout(tick, wait);
    };

    timer = window.setTimeout(tick, 0);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [phase, link, poll, deliver]);

  // Done: collect what is still waiting, then end the code so the phone says so.
  const close = useCallback(
    async ({ add = true }: { add?: boolean } = {}): Promise<UploadedFile[]> => {
      const current = link;
      generation.current += 1;
      setPhase("idle");
      setLink(null);
      if (!current) return [];
      const collected: UploadedFile[] = [];
      // At most MAX_PHOTOS can be waiting, PHOTOS_PER_POLL at a time.
      for (let i = 0; i < 8; i += 1) {
        const reply = await poll(current.id);
        if (!reply || reply === "gone") break;
        collected.push(...deliver(reply.photos, add));
        if (reply.photos.length < PHOTOS_PER_POLL) break;
      }
      await fetch(`/api/phone-links/${current.id}`, { method: "DELETE", keepalive: true }).catch(() => {});
      return collected;
    },
    [link, poll, deliver],
  );

  // The screen going away ends the code too. Nothing can be collected then,
  // so this only tells the phone; the intake closes it on Start instead.
  const liveId = useRef<string | null>(null);
  useEffect(() => {
    liveId.current = phase === "live" && link ? link.id : null;
  }, [phase, link]);
  useEffect(
    () => () => {
      generation.current += 1;
      const id = liveId.current;
      if (id) void fetch(`/api/phone-links/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
    },
    [],
  );

  return {
    phase,
    url: link?.url ?? null,
    expiresAt: link?.expiresAt ?? 0,
    state,
    received,
    localOnly: link ? isLocalOnly(link.url) : false,
    open,
    close,
  };
}
