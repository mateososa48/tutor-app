"use client";

import katex from "katex";
import { motion, useReducedMotion } from "motion/react";

// Small, honest illustrations of what the product actually renders: the board's
// KaTeX rows, the hand-drawn marks the tutor makes, the graphs it plots, the
// memory notes it keeps. Each one draws itself when it scrolls into view.

function Katex({ latex, className }: { latex: string; className?: string }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: katex.renderToString(latex, { throwOnError: false }) }}
    />
  );
}

function useDraw() {
  const reduce = useReducedMotion();
  return {
    initial: reduce ? false : { pathLength: 0, opacity: 0 },
    whileInView: { pathLength: 1, opacity: 1 },
    viewport: { once: true, amount: 0.5 },
  } as const;
}






/* For the how-it-works cards. */
export function Waveform({ active = true }: { active?: boolean }) {
  const reduce = useReducedMotion();
  const bars = [0.35, 0.6, 1, 0.75, 0.5, 0.9, 0.65, 0.4, 0.8, 0.55, 0.3];
  return (
    <div className="flex h-12 items-center gap-[4px]" aria-hidden>
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-[4px] rounded-full"
          style={{
            height: `${h * 100}%`,
            background: "var(--lp-sky-deep)",
            transformOrigin: "center",
            animation: active && !reduce ? `lp-meter ${0.8 + (i % 4) * 0.15}s ease-in-out ${i * 0.07}s infinite` : "none",
          }}
        />
      ))}
    </div>
  );
}

export function CheckRing() {
  const draw = useDraw();
  return (
    <div className="lp-katex relative w-fit text-(--lp-ink)">
      <Katex latex="x = 6" className="text-[22px]" />
      <svg aria-hidden className="pointer-events-none absolute -top-3 -left-4" width="96" height="48" viewBox="0 0 96 48" fill="none">
        <motion.path
          d="M10 26 C 6 8, 44 2, 66 6 C 92 10, 94 30, 76 40 C 60 48, 20 46, 10 34 C 5 28, 8 22, 16 18"
          stroke="var(--lp-sky-deep)"
          strokeWidth="2"
          strokeLinecap="round"
          {...draw}
          transition={{ duration: 0.7, delay: 0.3, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}
