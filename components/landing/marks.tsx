"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useReduce } from "./useScript";

// The tutor's pen, as page marks. A stroke drawn behind a word rather than a
// border under it, so it repeats on every wrapped line and can be drawn on.

/* A hand-drawn stroke as a background image. `box-decoration-break: clone`
   gives every wrapped line its own copy, and the width can be animated up from
   zero. Built here rather than in globals.css so the encoding stays readable
   and the page picks it up without a stylesheet rebuild. */
export const stroke = (d: string, color: string, width: number, viewBox: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}' preserveAspectRatio='none'><path d='${d}' fill='none' stroke='${color}' stroke-width='${width}' stroke-linecap='round'/></svg>`,
  )}")`;

export const CLONE = "[-webkit-box-decoration-break:clone] [box-decoration-break:clone]";

// The header's nav scribble: the shape the tutor underlines with.
const SCRIBBLE_D = "M1 6 C 12 2.5, 22 8.5, 34 5 S 56 2.5, 68 5.5 S 88 8, 99 4.5";
const SCRIBBLE = stroke(SCRIBBLE_D, "#3d9cff", 2.8, "0 0 100 10");

/** One word, underlined in the sky pen. The stroke draws itself once the line
    is on screen; reduced motion gets it finished and still. */
export function Squiggle({ children, height = "10px", delay = 0.3, className }: { children: ReactNode; height?: string; delay?: number; className?: string }) {
  const reduce = useReduce();
  const base = { backgroundImage: SCRIBBLE, backgroundRepeat: "no-repeat", backgroundPosition: "left bottom" };
  const cls = cn(CLONE, "pb-[0.1em]", className);

  if (reduce) {
    return (
      <span className={cls} style={{ ...base, backgroundSize: `100% ${height}` }}>
        {children}
      </span>
    );
  }
  return (
    <motion.span
      className={cls}
      style={base}
      initial={{ backgroundSize: `0% ${height}` }}
      whileInView={{ backgroundSize: `100% ${height}` }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.7, delay, ease: [0.37, 0, 0.3, 1] }}
    >
      {children}
    </motion.span>
  );
}
