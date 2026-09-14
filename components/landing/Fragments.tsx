"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { TranscriptList } from "@/components/session/TranscriptPanel";
import type { TranscriptEntry } from "@/lib/live-types";
import { cn } from "@/lib/utils";
import type { SHOTS } from "./shots.generated";
import { useReduce } from "./useScript";

// Pieces of the real session UI for the tiles: boards photographed off the
// real whiteboard, the dock's status badge, the transcript sheet. Every piece
// takes a `shown` flag so a tile can script it.

const EASE = [0.16, 1, 0.3, 1] as const;
export const T = { duration: 0.5, ease: EASE } as const;

export const rise = (shown: boolean) =>
  shown ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" } : { opacity: 0, y: 10, scale: 0.98, filter: "blur(4px)" };

export type Shot = (typeof SHOTS)[keyof typeof SHOTS];

/* A real board at 2x, written in from the top the way the tutor writes. */
export function BoardShot({
  shot,
  alt,
  width,
  shown = true,
  className,
}: {
  shot: Shot;
  alt: string;
  /** Rendered width in CSS px (the photo is 2x). */
  width: number;
  shown?: boolean;
  className?: string;
}) {
  const reduce = useReduce();
  const on = shown || !!reduce;
  return (
    <div className={cn("w-full overflow-hidden rounded-[12px] border border-(--lp-line) bg-white", className)} style={{ maxWidth: width }}>
      <motion.div
        initial={false}
        animate={{ clipPath: on ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)" }}
        transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1] }}
      >
        <Image src={shot.src} width={shot.width} height={shot.height} alt={alt} sizes={`${width}px`} className="block h-auto w-full" />
      </motion.div>
    </div>
  );
}

/* The transcript sheet, with the app's own list. */
export function Transcript({ entries, shown = true, className }: { entries: TranscriptEntry[]; shown?: boolean; className?: string }) {
  return (
    <motion.div
      initial={false}
      animate={rise(shown)}
      transition={T}
      className={cn("rounded-[18px] border border-(--lp-line-strong) bg-white px-5 py-4 shadow-(--lp-shadow-card)", className)}
    >
      <TranscriptList transcript={entries} />
    </motion.div>
  );
}

export const line = (role: "tutor" | "student", text: string, id = text): TranscriptEntry => ({ id, role, text });
