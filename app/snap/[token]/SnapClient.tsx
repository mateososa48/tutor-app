"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Camera, Check, Images, LoaderCircle, RotateCw } from "lucide-react";
import { PetSays } from "@/components/board/PetSays";
import { Wordmark } from "@/components/landing/Wordmark";
import { acceptsPhotos, MAX_PHOTOS, minutesLeft, type LinkState } from "@/lib/phone-link";
import { PhotoReadError, shrinkPhoto, type ShrunkPhoto } from "@/lib/phone-photo";

// The phone's page. One job: get a picture of the student's work onto the
// laptop that showed the QR code. The camera button opens the camera straight
// away (`capture="environment"`), the second picks from the photo library.
// Each photo is shrunk here (lib/phone-photo.ts), then sent one at a time, in
// order, and its thumbnail says where it is: sending, on the laptop, or not
// sent with a way to try again. The pet says the rest, including why the code
// stopped working when it has.

export type SnapState = LinkState | "missing";

type Shot = {
  key: string;
  /** The photo as the phone handed it over, for the thumbnail. */
  preview: string;
  status: "preparing" | "sending" | "sent" | "failed";
  error?: string;
  photo?: ShrunkPhoto;
};

const EASE = [0.16, 1, 0.3, 1] as const;

/** The time, refreshed every few seconds, and 0 until the page is on the phone (the server's clock is not the phone's). */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, everyMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [everyMs]);
  return now;
}

const ENDED: Record<Exclude<SnapState, "waiting" | "connected">, string> = {
  missing: "I don't recognise this code. Make a new one on your laptop and scan that one.",
  expired: "This code has run out. On your laptop, open Files and choose Use your phone to make a new one.",
  closed: "Your laptop closed this code. If there's more to send, make a new one there.",
  full: `That's ${MAX_PHOTOS} photos, the most one code can take. Make a new one on your laptop for more.`,
};

export function SnapClient({ token, initial }: { token: string; initial: { state: SnapState; expiresAt: number; uploads: number } }) {
  const [state, setState] = useState<SnapState>(initial.state);
  const [uploads, setUploads] = useState(initial.uploads);
  const [shots, setShots] = useState<Shot[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const previews = useRef<string[]>([]);
  const seq = useRef(0);
  const now = useNow(10_000);

  // The code runs out on the phone's own clock too, so the page says so
  // without waiting for a refused upload.
  const ran = now > 0 && initial.expiresAt > 0 && now >= initial.expiresAt && acceptsPhotos(state as LinkState);
  const effective: SnapState = ran ? "expired" : state;
  const live = effective === "waiting" || effective === "connected";

  const update = (key: string, patch: Partial<Shot>) => setShots((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  // Tell the laptop someone is here, so it can say "Connected".
  useEffect(() => {
    if (initial.state !== "waiting" && initial.state !== "connected") return;
    fetch(`/api/snap/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "open" }) })
      .then((r) => r.json())
      .then((j: { state?: SnapState }) => j.state && setState(j.state))
      .catch(() => {});
  }, [initial.state, token]);

  // Thumbnails are object URLs of the original photos; give them back when the page goes.
  useEffect(() => {
    const list = previews.current;
    return () => list.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const send = async (key: string, photo: ShrunkPhoto) => {
    update(key, { status: "sending", error: undefined });
    try {
      const res = await fetch(`/api/snap/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "photo", data: photo.data, width: photo.width, height: photo.height }),
      });
      const json = (await res.json().catch(() => ({}))) as { state?: SnapState; uploads?: number; error?: string };
      if (json.state) setState(json.state);
      if (res.ok) {
        if (typeof json.uploads === "number") setUploads(json.uploads);
        update(key, { status: "sent", photo: undefined });
        return;
      }
      const ended = json.state && !acceptsPhotos(json.state as LinkState);
      update(key, { status: "failed", error: ended ? "Not sent" : (json.error ?? "Didn't send"), photo: ended ? undefined : photo });
    } catch {
      update(key, { status: "failed", error: "No connection", photo });
    }
  };

  const process = async (key: string, file: File) => {
    try {
      const photo = await shrinkPhoto(file);
      await send(key, photo);
    } catch (err) {
      update(key, { status: "failed", error: err instanceof PhotoReadError ? "Couldn't read it" : "Didn't send" });
      if (err instanceof PhotoReadError) setNote(err.message);
    }
  };

  const pending = shots.filter((s) => s.status === "preparing" || s.status === "sending").length;
  const sent = shots.filter((s) => s.status === "sent").length;
  const room = Math.max(0, MAX_PHOTOS - uploads - pending);

  const add = (list: FileList | null) => {
    if (!list?.length || !live) return;
    const files = Array.from(list);
    const taking = files.slice(0, room);
    setNote(files.length > taking.length ? (taking.length === 0 ? ENDED.full : `Only ${taking.length} more can go with this code, so I took the first ${taking.length}.`) : null);
    for (const file of taking) {
      seq.current += 1;
      const key = `shot-${seq.current}`;
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      setShots((prev) => [...prev, { key, preview, status: "preparing" }]);
      // One at a time, in the order they were taken, so the laptop gets them in that order too.
      queue.current = queue.current.then(() => process(key, file));
    }
  };

  const retry = (shot: Shot) => {
    if (!shot.photo || !live) return;
    const photo = shot.photo;
    queue.current = queue.current.then(() => send(shot.key, photo));
  };

  // What the pet says.
  const ended = !live ? ENDED[effective as keyof typeof ENDED] : undefined;
  const said =
    ended ??
    (sent === 0 && pending === 0
      ? "Take a picture of your work and I'll put it on your laptop."
      : sent === 0
        ? undefined
        : `${sent === 1 ? "Got it. It's on your laptop now." : `Got ${sent}. They're all on your laptop.`}${pending ? "" : " Anything else?"}`);
  const mins = minutesLeft(initial.expiresAt, now);

  return (
    <MotionConfig reducedMotion="user">
      <main className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col bg-(--lp-bg) px-5 pt-5 pb-8 sm:px-6">
        <header className="flex h-10 items-center justify-between">
          <Wordmark size={18} />
          {live && now > 0 && (
            <span className="text-[13px] text-(--lp-ink-2) tabular-nums">{mins === 1 ? "1 minute left" : `${mins} minutes left`}</span>
          )}
        </header>

        <h1 className="lp-display m-0 mt-8 text-[30px] leading-[1.1] text-balance text-(--lp-ink)">Send a photo to your laptop</h1>

        <PetSays className="mt-6" text={said} thinking={said ? undefined : "Sending it over"} puzzled={!live} />

        {live && (
          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => camera.current?.click()}
              disabled={room === 0}
              className="btn-gloss btn-gloss-lift flex h-[60px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-[16px] text-[17px] font-medium outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) disabled:cursor-default disabled:opacity-50"
            >
              <Camera className="size-5" strokeWidth={2} aria-hidden />
              Take a picture
            </button>
            <button
              type="button"
              onClick={() => library.current?.click()}
              disabled={room === 0}
              className="flex h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-[16px] border border-(--lp-line-strong) bg-(--lp-surface) text-[16px] font-medium text-(--lp-ink) outline-none transition-[background-color,transform] duration-150 hover:bg-(--lp-gray) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) active:scale-[0.98] disabled:cursor-default disabled:opacity-50"
            >
              <Images className="size-[18px]" strokeWidth={2} aria-hidden />
              Choose from your photos
            </button>
            <p className="m-0 mt-1 text-center text-[14px] leading-[1.5] text-balance text-(--lp-ink-2)">Lay the page flat in good light and get the whole problem in.</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {note && (
            <motion.p
              key={note}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE }}
              role="alert"
              className="m-0 mt-4 rounded-[12px] bg-(--lp-gray) px-4 py-3 text-[14px] leading-[1.5] text-(--lp-ink)"
            >
              {note}
            </motion.p>
          )}
        </AnimatePresence>

        {shots.length > 0 && (
          <section className="mt-9" aria-labelledby="sent-heading">
            <div className="flex items-baseline justify-between">
              <h2 id="sent-heading" className="m-0 text-[15px] font-semibold text-(--lp-ink)">
                On your laptop
              </h2>
              <span className="text-[13px] text-(--lp-ink-2) tabular-nums">
                {uploads} of {MAX_PHOTOS}
              </span>
            </div>
            <ul className="m-0 mt-3 grid list-none grid-cols-3 gap-2.5 p-0">
              <AnimatePresence initial={false}>
                {shots.map((shot) => (
                  <motion.li
                    key={shot.key}
                    layout
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="relative aspect-[3/4] overflow-hidden rounded-[14px] border border-(--lp-line) bg-(--lp-gray)"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shot.preview} alt="" className="size-full object-cover" />
                    <ShotStatus shot={shot} onRetry={() => retry(shot)} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        )}

        <p className="m-0 mt-auto pt-10 text-center text-[13px] leading-[1.5] text-(--lp-ink-2)">
          Photos go only to the laptop that showed this code.
        </p>

        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={library}
          type="file"
          accept="image/*"
          multiple
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </main>
    </MotionConfig>
  );
}

/** What each thumbnail says: working on it, on the laptop, or not sent. */
function ShotStatus({ shot, onRetry }: { shot: Shot; onRetry: () => void }) {
  if (shot.status === "sent") {
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ type: "spring", duration: 0.35, bounce: 0 }}
        className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-full bg-(--lp-sky-deep) text-white shadow-[0_2px_6px_rgba(18,18,21,0.25)]"
        role="img"
        aria-label="On your laptop"
      >
        <Check className="size-4" strokeWidth={3} />
      </motion.span>
    );
  }
  if (shot.status === "failed") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-(--lp-ink)/60 px-2 text-center text-white">
        <span className="text-[13px] leading-tight font-medium">{shot.error ?? "Didn't send"}</span>
        {shot.photo && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-medium text-(--lp-ink) outline-none active:scale-[0.97]"
          >
            <RotateCw className="size-3.5" strokeWidth={2.25} aria-hidden />
            Try again
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 grid place-items-center bg-white/55" role="img" aria-label="Sending">
      <span className="grid size-9 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(18,18,21,0.18)]">
        <LoaderCircle className="size-4.5 animate-spin text-(--lp-sky-deep) motion-reduce:animate-none" strokeWidth={2.25} />
      </span>
    </div>
  );
}
