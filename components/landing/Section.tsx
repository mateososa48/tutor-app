"use client";

import type { ComponentProps, ReactNode } from "react";
import { MotionConfig, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useReduce } from "./useScript";

// The kit every section below the hero is built from: one container width,
// one section rhythm, one heading pattern (a sentence-case sky label, a
// weight-500 title, a grey lede) and one entrance. Keeping these in a single
// file is what keeps the page reading as one system.

export const EASE = [0.16, 1, 0.3, 1] as const;

/* Motion's own reduced-motion switch for the whole landing: transforms and
   blur stop, opacity still fades. Set once here so no section has to gate it. */
export function LandingMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[1180px] px-5 sm:px-8", className)} {...props} />;
}

/* A section with the page's vertical rhythm (80px, 112px from sm) and, by
   default, a dashed rule across the viewport at its top. */
export function Section({ rule = true, className, ...props }: ComponentProps<"section"> & { rule?: boolean }) {
  return <section className={cn("relative scroll-mt-24 pt-14 pb-20 sm:pt-16 sm:pb-28", rule && "lp-rule", className)} {...props} />;
}

/* The label above a heading: the heading's own face and size, in the blue,
   so a section opens on two display lines, the blue one naming the section and
   the ink one saying the thing. Mateo asked for exactly this on Sept 21 after
   a pill version ("same font and size but in the blue color"). */
export function Label({ className, children }: { className?: string; children: ReactNode }) {
  // Weight set inline: `.lp-title` fixes 500 from outside Tailwind's layers,
  // where a `font-normal` utility on the same element loses the cascade.
  return (
    <p className={cn("lp-title m-0 text-[clamp(2rem,3.8vw,3.125rem)] leading-[1.06] text-(--lp-sky-deep)", className)} style={{ fontWeight: 400 }}>
      {children}
    </p>
  );
}

export function Title({ as: Tag = "h2", className, children }: { as?: "h1" | "h2" | "h3"; className?: string; children: ReactNode }) {
  return <Tag className={cn("lp-title mt-1 text-[clamp(2rem,3.8vw,3.125rem)] leading-[1.06] text-(--lp-ink)", className)}>{children}</Tag>;
}

export function Lede({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("mt-5 max-w-[54ch] text-[1.0625rem] leading-[1.55] text-(--lp-ink-2) sm:text-[1.125rem]", className)}>{children}</p>;
}

/* The entrance: rises 22px out of a light blur, once, when a fifth of it is
   on screen. Under reduced motion only the opacity moves (LandingMotion). */
export function Reveal({
  delay = 0,
  y = 22,
  amount = 0.2,
  className,
  children,
}: {
  delay?: number;
  y?: number;
  amount?: number;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReduce();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.7, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* A caption under a product tile: a bold lead, then the rest in grey. */
export function Caption({ lead, children, className }: { lead: string; children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[15px] leading-[1.55] text-(--lp-ink-2)", className)}>
      <strong className="font-semibold text-(--lp-ink)">{lead}</strong> {children}
    </p>
  );
}
