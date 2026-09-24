"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { TutorPet, type PetState } from "@/components/board/TutorPet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useReduce } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";

// The pet saying something in the app: it stands on a soft shadow, and a
// white bubble with a tail points back at it. The composition is the landing
// FAQ's (components/landing/Faq.tsx), which Mateo picked as the reference on
// Sept 22; that file keeps its own copy because the landing is edited in
// another session. Like the FAQ's, the bubble lays out at its final size first
// and only fades the words in where they already sit, so nothing moves
// sideways out of the box.
//
// Three moods: `thinking` (the writing pose and a thought bubble, while the
// words are on their way), `text` (it talks for about as long as the words
// take, then rests), and `puzzled` (something went wrong, said plainly).
// `children` sit under the bubble, for a button that belongs to what it said.

const EASE = [0.22, 1, 0.36, 1] as const;
const POP = { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.7 };
// The pet arrives first; its bubble a beat later.
const BUBBLE_DELAY_MS = 280;

const BUBBLE = "relative rounded-[18px] border border-(--lp-line-strong) bg-white px-5 py-4 text-[16px] leading-[1.6] text-(--lp-ink) sm:text-[17px]";

/* The pet's voice level while it speaks: a soft wobble, not a meter. */
function useTalking(active: boolean) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const t = (performance.now() - start) / 1000;
      setLevel(0.25 + 0.45 * Math.abs(Math.sin(t * 7.3)) * (0.6 + 0.4 * Math.sin(t * 2.1)));
    }, 70);
    return () => {
      window.clearInterval(id);
      setLevel(0);
    };
  }, [active]);
  return active ? level : 0;
}

/* The words, already at their final place, fading up out of a blur in turn. */
function Words({ text }: { text: string }) {
  const reduce = useReduce();
  const parts = text.split(/(\s+)/).map((part, i, all) => ({ part, turn: part.trim() ? all.slice(0, i).filter((x) => x.trim()).length : -1 }));
  const count = parts.filter((p) => p.turn >= 0).length;
  // A long recap still arrives in under a second.
  const step = Math.min(0.03, 0.9 / Math.max(count, 1));
  return (
    <span aria-hidden>
      {parts.map(({ part, turn }, i) => {
        if (turn < 0) return part;
        return (
          <motion.span
            key={i}
            className="inline-block"
            initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)" }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: reduce ? 0.15 : 0.4, delay: reduce ? 0 : (turn + 1) * step, ease: EASE }}
          >
            {part}
          </motion.span>
        );
      })}
    </span>
  );
}

/* A bubble growing out of its tail, toward the pet. */
const enter = (reduce: boolean | null) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, filter: "blur(6px)" },
  animate: reduce ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, filter: "blur(4px)", transition: { duration: 0.18, ease: EASE } },
  transition: reduce ? { duration: 0.15 } : { ...POP, filter: { duration: 0.3, ease: EASE } },
  style: { transformOrigin: "0% 28px" },
});

/** The tail: a small square turned 45°, bordered on the two sides that face out. */
function Tail() {
  return <span aria-hidden className="absolute top-[22px] -left-[6px] size-[11px] rotate-45 border-b border-l border-(--lp-line-strong) bg-white" />;
}

function Speech({ text }: { text: string }) {
  const reduce = useReduce();
  return (
    <motion.div {...enter(reduce)} className={cn(BUBBLE, "w-fit max-w-full [grid-area:1/1]")} role="status" aria-label={text}>
      <Tail />
      <Words text={text} />
    </motion.div>
  );
}

/* A thought on its way: two small circles drifting back to the pet, and the
   label with three dots taking turns. */
function Thought({ label }: { label: string }) {
  const reduce = useReduce();
  return (
    <motion.div {...enter(reduce)} className="relative w-fit [grid-area:1/1]" role="status" aria-label={label}>
      {[
        { size: 6, left: -21, top: 35, delay: 0 },
        { size: 10, left: -13, top: 21, delay: 0.18 },
      ].map((c, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute rounded-full border border-(--lp-line-strong) bg-white"
          style={{ width: c.size, height: c.size, left: c.left, top: c.top }}
          animate={reduce ? undefined : { opacity: [0.35, 1, 0.35], scale: [0.85, 1, 0.85] }}
          transition={reduce ? undefined : { duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: c.delay }}
        />
      ))}
      <div className={cn(BUBBLE, "flex items-center gap-2.5 text-(--lp-ink-2)")}>
        {label}
        <span aria-hidden className="flex gap-1">
          {[0, 1, 2].map((d) => (
            <motion.span
              key={d}
              className="size-1.5 rounded-full bg-(--lp-ink-3)"
              animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
              transition={reduce ? undefined : { duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: d * 0.18 }}
            />
          ))}
        </span>
      </div>
    </motion.div>
  );
}

export function PetSays({
  text,
  thinking,
  puzzled,
  children,
  className,
}: {
  /** What it says. */
  text?: string;
  /** While there is nothing to say yet: the label in its thought bubble. */
  thinking?: string;
  /** Said with a puzzled face: something went wrong. */
  puzzled?: boolean;
  /** Under the bubble, lined up with it: a button that belongs to what was said. */
  children?: ReactNode;
  className?: string;
}) {
  const reduce = useReduce();
  const mobile = useIsMobile();
  const size = mobile ? 64 : 84;
  const [ready, setReady] = useState(false);
  const [talking, setTalking] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), reduce ? 0 : BUBBLE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [reduce]);

  // Talk whenever there are new words, for about as long as they take.
  useEffect(() => {
    if (!ready || !text) return;
    const words = text.split(/\s+/).length;
    const on = window.setTimeout(() => setTalking(true), 0);
    const off = window.setTimeout(() => setTalking(false), Math.min(3200, Math.max(900, words * 90)));
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [ready, text]);

  const level = useTalking(talking && !reduce);
  const state: PetState = !ready ? "arrive" : !text ? "writing" : talking ? "speaking" : puzzled ? "puzzled" : "idle";

  return (
    <div className={cn("flex items-start gap-4 sm:gap-5", className)}>
      <motion.div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.9 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={reduce ? { duration: 0.15 } : { ...POP, delay: 0.08 }}
      >
        {/* A shadow on the ground, so it stands somewhere rather than floats. */}
        <span aria-hidden className="absolute -bottom-1 left-1/2 h-2.5 w-[70%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(18,18,21,0.12),transparent)]" />
        <TutorPet shape="square" state={state} level={level} look={{ x: 0.7, y: 0.25 }} size={size} reduceMotion={!!reduce} />
      </motion.div>
      <div className="min-w-0 flex-1 pt-1">
        {/* The thought and the words share one grid cell, so one can leave
            while the other arrives in the same place. */}
        <div className="grid">
          <AnimatePresence initial={false}>
            {ready && !text && thinking && <Thought key="thought" label={thinking} />}
            {ready && text && <Speech key={`say-${text}`} text={text} />}
          </AnimatePresence>
        </div>
        {children && ready && text && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: reduce ? 0 : 0.35, ease: EASE }} className="mt-3">
            {children}
          </motion.div>
        )}
      </div>
    </div>
  );
}
