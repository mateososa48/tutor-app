"use client";

import { motion } from "motion/react";
import { Katex, rise, T } from "./Fragments";

// The whiteboard as the product draws it: KaTeX for math, tldraw's handwriting
// face for the tutor's notes, and pen strokes that are actually drawn, with the
// slight overshoot and wobble of a real hand.

const DRAW = (delay = 0, duration = 0.7) => ({
  pathLength: { duration, delay, ease: [0.4, 0, 0.2, 1] as const },
  opacity: { duration: 0.01, delay },
});

export function Stroke({
  d,
  on,
  delay = 0,
  duration = 0.7,
  width = 2.2,
  color = "var(--lp-sky-deep)",
}: {
  d: string;
  on: boolean;
  delay?: number;
  duration?: number;
  width?: number;
  color?: string;
}) {
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={false}
      animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
      transition={DRAW(delay, duration)}
    />
  );
}

/* Wobbly underline drawn under a heading. */
export function Underline({ on, width = 200, className = "" }: { on: boolean; width?: number; className?: string }) {
  return (
    <svg aria-hidden className={`pointer-events-none ${className}`} width={width} height="10" viewBox={`0 0 ${width} 10`} preserveAspectRatio="none">
      <Stroke d={`M2 6 C ${width * 0.2} 2, ${width * 0.4} 9, ${width * 0.6} 5 S ${width * 0.9} 3, ${width - 2} 6`} on={on} width={2.4} />
    </svg>
  );
}

/* A ring around something, closed with a small overlap like a real pen. */
export function Ring({ on, delay = 0, className = "" }: { on: boolean; delay?: number; className?: string }) {
  return (
    <svg aria-hidden className={`pointer-events-none ${className}`} width="128" height="52" viewBox="0 0 128 52" fill="none">
      <Stroke
        d="M14 27 C 8 10, 46 3, 80 5 C 112 7, 126 22, 114 38 C 102 50, 40 51, 18 41 C 6 35, 8 24, 26 18"
        on={on}
        delay={delay}
        duration={0.8}
      />
    </svg>
  );
}

/* Short curved arrow from a note to a step. */
export function Arrow({ on, delay = 0, className = "" }: { on: boolean; delay?: number; className?: string }) {
  return (
    <svg aria-hidden className={`pointer-events-none ${className}`} width="64" height="28" viewBox="0 0 64 28" fill="none">
      <Stroke d="M62 6 C 46 4, 26 8, 8 20" on={on} delay={delay} duration={0.45} />
      <Stroke d="M18 22 L 7 21 L 10 11" on={on} delay={delay + 0.4} duration={0.2} />
    </svg>
  );
}

/* Number line, drawn tick by tick, with the answer marked. */
export function NumberLine({
  on,
  markOn,
  min = 0,
  max = 8,
  mark = 4,
  label,
  width = 260,
}: {
  on: boolean;
  markOn: boolean;
  min?: number;
  max?: number;
  mark?: number;
  label: string;
  width?: number;
}) {
  const pad = 16;
  const span = width - pad * 2;
  const x = (v: number) => pad + ((v - min) / (max - min)) * span;
  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <svg aria-hidden width={width} height="64" viewBox={`0 0 ${width} 64`} fill="none" className="lp-hand">
      <Stroke d={`M${pad - 6} 30 L ${width - pad + 6} 30`} on={on} width={1.8} color="var(--lp-ink)" duration={0.6} />
      {ticks.map((t, i) => (
        <g key={t}>
          <Stroke d={`M${x(t)} 25 L ${x(t)} 35`} on={on} delay={0.15 + i * 0.05} duration={0.15} width={1.6} color="var(--lp-ink)" />
          <motion.text
            x={x(t)}
            y={52}
            textAnchor="middle"
            fontSize="11.5"
            fill="var(--lp-ink-3)"
            style={{ fontFamily: "var(--lp-font-hand)" }}
            initial={false}
            animate={{ opacity: on ? 1 : 0 }}
            transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
          >
            {t}
          </motion.text>
        </g>
      ))}
      <motion.circle
        cx={x(mark)}
        cy={30}
        r={5.5}
        fill="var(--lp-sky-deep)"
        initial={false}
        animate={{ scale: markOn ? 1 : 0, opacity: markOn ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
        style={{ transformOrigin: `${x(mark)}px 30px` }}
      />
      <motion.text
        x={x(mark)}
        y={14}
        textAnchor="middle"
        fontSize="14"
        fontWeight={600}
        fill="var(--lp-sky-deep)"
        style={{ fontFamily: "var(--lp-font-hand)" }}
        initial={false}
        animate={{ opacity: markOn ? 1 : 0, y: markOn ? 0 : 4 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        {label}
      </motion.text>
    </svg>
  );
}

/* tldraw-style sticky note, slightly rotated, in the tutor's hand. */
export function Sticky({ text, on, className = "" }: { text: string; on: boolean; className?: string }) {
  return (
    <motion.div
      initial={false}
      animate={on ? { opacity: 1, y: 0, rotate: -2.5, scale: 1 } : { opacity: 0, y: 10, rotate: -2.5, scale: 0.96 }}
      transition={T}
      className={`lp-hand w-[228px] rounded-md px-4 py-3.5 text-[15px] leading-[1.35] ${className}`}
      style={{
        background: "linear-gradient(180deg, #eaf3ff, #dbeaff)",
        color: "#1a5fb0",
        boxShadow: "0 1px 1px rgba(18,18,21,0.06), 0 10px 22px rgba(29,126,230,0.16)",
        transformOrigin: "center",
      }}
    >
      {text}
    </motion.div>
  );
}

/* One equation row: math in KaTeX, the tutor's note in handwriting. */
export function Row({
  latex,
  note,
  on,
  size = 20,
  noteDelay = 0.25,
  className = "",
}: {
  latex: string;
  note?: string;
  on: boolean;
  size?: number;
  noteDelay?: number;
  className?: string;
}) {
  return (
    <motion.div initial={false} animate={rise(on)} transition={T} className={`flex items-baseline gap-4 ${className}`}>
      <span className="lp-katex" style={{ fontSize: size }}>
        <Katex latex={latex} />
      </span>
      {note && (
        <motion.span
          initial={false}
          animate={{ opacity: on ? 1 : 0, x: on ? 0 : -6 }}
          transition={{ duration: 0.4, delay: on ? noteDelay : 0 }}
          className="lp-hand whitespace-nowrap"
          style={{ fontSize: size * 0.72, color: "var(--lp-sky-deep)" }}
        >
          {note}
        </motion.span>
      )}
    </motion.div>
  );
}

/* Student work is rendered as their own handwriting, in pencil gray. */
export function Attempt({ text, on, className = "" }: { text: string; on: boolean; className?: string }) {
  return (
    <motion.div initial={false} animate={rise(on)} transition={T} className={`relative inline-flex w-fit items-baseline gap-2.5 ${className}`}>
      <span className="lp-hand text-[19px]" style={{ color: "#6a6a75" }}>
        {text}
      </span>
      <span className="rounded px-1.5 py-[1px] text-[10px] font-semibold tracking-[0.06em] uppercase" style={{ background: "var(--lp-gray)", color: "var(--lp-ink-3)" }}>
        you
      </span>
    </motion.div>
  );
}
