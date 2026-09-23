"use client";

import { useRef, type ReactNode } from "react";
import { useInView } from "motion/react";
import { cn } from "@/lib/utils";
import { DitherWave } from "./DitherWave";
import { SWIRL } from "./swirl";
import { useReduce } from "./useScript";

// The hero's material carried down the page: a band of the same dithered
// swirl at the hero's own settings (the calm speed, +0.14 lightness), under a
// white wash so ink text reads on it. It runs only while it is on screen and
// stands still under reduced motion. Full-bleed by default; put it inside a
// column and it becomes a tinted surface.
export const HERO_FIELD = { ...SWIRL, waveSpeed: 0.04, waveFrequency: 2.55, waveAmplitude: 0.66, lightness: 0.14 } as const;

export function Band({
  children,
  className,
  wash = 0.5,
  fadeTop = false,
  still = false,
}: {
  children: ReactNode;
  className?: string;
  /** How much of the page background sits over the field, 0 to 1. */
  wash?: number;
  /** Soften the band's top edge into the page. */
  fadeTop?: boolean;
  /** One frame, never animated (a surface inside a card). */
  still?: boolean;
}) {
  const reduce = useReduce();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "160px" });

  return (
    <div ref={ref} className={cn("relative isolate z-[1] overflow-hidden", className)}>
      <div aria-hidden className="absolute inset-0 -z-10">
        <DitherWave {...HERO_FIELD} animate={!reduce && !still && inView} />
        <div className="absolute inset-0" style={{ background: "var(--lp-bg)", opacity: wash }} />
        {fadeTop && (
          <div className="absolute inset-x-0 top-0 h-48" style={{ background: "linear-gradient(to bottom, var(--lp-bg), transparent)" }} />
        )}
      </div>
      {children}
    </div>
  );
}
