"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cloudPath } from "@/lib/cloud-path";
import { useReduce } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";

// What the pet says. Two shapes: a speech bubble with a tail, and a thought
// bubble whose tail is two dots. The bubble grows out of the pet (its
// transform origin sits at the tail), its words arrive one at a time so it
// reads as speech rather than a label appearing, and it resizes smoothly when
// the words change. Thinking is three dots on their own loop.
//
// It is deliberately NOT pixel art: the pet is the character, the bubble is
// the app talking, in the app's own type and hairlines.

export type BubbleKind = "speech" | "thought";
export type BubbleSide = "top" | "right" | "left";

type Props = {
  open: boolean;
  /** The words. Leave it out on a thought bubble for the three dots. */
  text?: string;
  kind?: BubbleKind;
  /** Which side of the pet the bubble sits on. */
  side?: BubbleSide;
  /** Which end of that side the tail sits at. */
  align?: "start" | "end";
  /** How wide the words may run before they wrap. */
  maxWidth?: number;
  /** Px between the bubble and the pet. */
  gap?: number;
  className?: string;
};

// Slightly underdamped, like the pet's own poses: it arrives with a little
// overshoot and settles. Fast enough that a one-word bubble feels instant.
const POP = { type: "spring" as const, stiffness: 460, damping: 26, mass: 0.7 };
const SETTLE = { type: "spring" as const, stiffness: 520, damping: 34, mass: 0.6 };

// Where the bubble sits, and the corner it grows out of.
const PLACE: Record<BubbleSide, (align: "start" | "end", gap: number) => { style: React.CSSProperties; origin: string }> = {
  top: (align, gap) => ({
    style: { bottom: `calc(100% + ${gap}px)`, ...(align === "start" ? { left: 0 } : { right: 0 }) },
    origin: align === "start" ? "12% 100%" : "88% 100%",
  }),
  right: (align, gap) => ({
    style: { left: `calc(100% + ${gap}px)`, ...(align === "start" ? { top: 0 } : { bottom: 0 }) },
    origin: align === "start" ? "0% 24%" : "0% 76%",
  }),
  left: (align, gap) => ({
    style: { right: `calc(100% + ${gap}px)`, ...(align === "start" ? { top: 0 } : { bottom: 0 }) },
    origin: align === "start" ? "100% 24%" : "100% 76%",
  }),
};

export function PetBubble({
  open,
  text,
  kind = "speech",
  side = "top",
  align = "start",
  maxWidth = 210,
  gap = 8,
  className,
}: Props) {
  const reduce = useReduce();
  const still = reduce === true;
  const place = PLACE[side](align, gap);
  const thinking = kind === "thought" && !text;
  const cloud = kind === "thought";

  // The cloud is drawn for the size the bubble actually ends up, so its puffs
  // are the same size in a two-word bubble and a two-line one. Measured in a
  // ResizeObserver rather than an effect body: it runs after layout and
  // before paint, so the shape is there on the first frame.
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || !cloud) return;
    const ro = new ResizeObserver(() => setBox({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [cloud]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="bubble"
          layout
          role="status"
          aria-live="polite"
          aria-label={thinking ? "Thinking" : text}
          initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.82, y: side === "top" ? 6 : 0, x: side === "right" ? -6 : side === "left" ? 6 : 0, filter: "blur(4px)" }}
          animate={still ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, x: 0, filter: "blur(0px)" }}
          exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.94, filter: "blur(2px)" }}
          transition={still ? { duration: 0.12 } : { ...POP, filter: { duration: 0.18 }, layout: SETTLE }}
          ref={boxRef}
          style={{ ...place.style, transformOrigin: place.origin, maxWidth }}
          className={cn(
            "pointer-events-none absolute z-10 w-max",
            "text-[13.5px] leading-[1.35] text-(--lp-ink)",
            cloud
              ? "px-5 py-4"
              : "rounded-[14px] border border-(--lp-line-strong) bg-white px-3 py-2 shadow-[0_1px_2px_rgba(18,18,21,0.05),0_8px_20px_rgba(18,18,21,0.07)]",
            className,
          )}
        >
          {cloud && <Cloud box={box} />}
          <span className="relative block">{thinking ? <Dots still={still} /> : <Words text={text ?? ""} still={still} />}</span>
          {kind === "speech" ? <Tail side={side} align={align} /> : <ThoughtTail side={side} align={align} still={still} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// The cloud itself: one path, filled white with a hair of shading toward the
// bottom so it has a little volume, the hairline drawn on the shape rather
// than around a box, and a shadow that follows the puffs.
function Cloud({ box }: { box: { w: number; h: number } | null }) {
  const id = useId();
  if (!box || box.w < 4 || box.h < 4) return null;
  const d = cloudPath(box.w, box.h);
  if (!d) return null;
  return (
    <svg
      aria-hidden
      width={box.w}
      height={box.h}
      viewBox={`0 0 ${box.w} ${box.h}`}
      className="absolute inset-0"
      style={{ filter: "drop-shadow(0 1px 1px rgba(18,18,21,0.05)) drop-shadow(0 8px 16px rgba(18,18,21,0.07))" }}
    >
      <defs>
        <linearGradient id={`cloud-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f2f4f7" />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#cloud-${id})`} stroke="rgba(18,18,21,0.14)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// The words arrive one at a time, quickly, so a sentence reads as spoken. A
// long line speeds up rather than dragging: the whole reveal stays under
// about half a second. The text is on the wrapper for screen readers, so the
// pieces are hidden from them.
function Words({ text, still }: { text: string; still: boolean }) {
  // Split into words and spaces, and number the words: the spaces are not
  // animated, so they must not take a turn.
  const pieces: { piece: string; turn: number }[] = [];
  let turns = 0;
  for (const piece of text.split(/(\s+)/)) {
    const word = Boolean(piece.trim());
    pieces.push({ piece, turn: word ? turns : -1 });
    if (word) turns += 1;
  }
  const step = Math.min(0.05, 0.5 / Math.max(turns, 1));

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={text}
        aria-hidden
        layout="position"
        className="block"
        initial={{ opacity: 1 }}
        exit={still ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(3px)", transition: { duration: 0.14 } }}
      >
        {pieces.map(({ piece, turn }, i) => {
          if (turn < 0) return <span key={i}>{piece}</span>;
          const delay = still ? 0 : turn * step;
          return (
            <motion.span
              key={i}
              className="inline-block"
              initial={still ? { opacity: 0 } : { opacity: 0, y: 5, filter: "blur(3px)" }}
              animate={still ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={still ? { duration: 0.12, delay } : { ...POP, delay, filter: { duration: 0.16, delay } }}
            >
              {piece}
            </motion.span>
          );
        })}
      </motion.span>
    </AnimatePresence>
  );
}

// Three dots on a loop, each a beat behind the last. Under reduced motion
// they hold still at three depths instead of bouncing.
function Dots({ still }: { still: boolean }) {
  return (
    <span className="flex h-[19px] items-center gap-[5px] px-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-[5px] rounded-full bg-(--lp-ink-2)"
          initial={still ? { opacity: 0.3 + i * 0.22 } : { opacity: 0.3, y: 0 }}
          animate={still ? { opacity: 0.3 + i * 0.22 } : { opacity: [0.3, 1, 0.3], y: [0, -3.5, 0] }}
          transition={still ? undefined : { duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.14 }}
        />
      ))}
    </span>
  );
}

// The speech tail: a square turned 45 degrees with two of its sides showing,
// so the hairline runs on unbroken around the corner.
const TAIL: Record<BubbleSide, (align: "start" | "end") => string> = {
  top: (align) => cn("-bottom-[5px] border-r border-b", align === "start" ? "left-3.5" : "right-3.5"),
  right: (align) => cn("-left-[5px] border-b border-l", align === "start" ? "top-3.5" : "bottom-3.5"),
  left: (align) => cn("-right-[5px] border-t border-r", align === "start" ? "top-3.5" : "bottom-3.5"),
};

function Tail({ side, align }: { side: BubbleSide; align: "start" | "end" }) {
  return <span aria-hidden className={cn("absolute size-[9px] rotate-45 rounded-[1.5px] border-(--lp-line-strong) bg-white", TAIL[side](align))} />;
}

// The thought tail: two dots stepping back toward the pet, which pop in after
// the bubble and then breathe.
const THOUGHT: Record<BubbleSide, (align: "start" | "end") => [string, string]> = {
  top: (align) => [cn("-bottom-[9px]", align === "start" ? "left-3" : "right-3"), cn("-bottom-[17px]", align === "start" ? "left-1.5" : "right-1.5")],
  right: (align) => [cn("-left-[9px]", align === "start" ? "top-3" : "bottom-3"), cn("-left-[17px]", align === "start" ? "top-1.5" : "bottom-1.5")],
  left: (align) => [cn("-right-[9px]", align === "start" ? "top-3" : "bottom-3"), cn("-right-[17px]", align === "start" ? "top-1.5" : "bottom-1.5")],
};

function ThoughtTail({ side, align, still }: { side: BubbleSide; align: "start" | "end"; still: boolean }) {
  const [near, far] = THOUGHT[side](align);
  return (
    <>
      {[near, far].map((at, i) => (
        <motion.span
          key={at}
          aria-hidden
          className={cn("absolute rounded-full border border-(--lp-line-strong) bg-white", i === 0 ? "size-[8px]" : "size-[5px]", at)}
          initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
          animate={still ? { opacity: 1 } : { opacity: 1, scale: [0.3, 1.12, 1] }}
          transition={still ? { duration: 0.12 } : { duration: 0.34, delay: 0.06 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </>
  );
}
