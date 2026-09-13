"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { Highlight } from "@/components/animate-ui/primitives/effects/highlight";
import { Wordmark } from "./Wordmark";

const NAV = [
  ["How it works", "#how-it-works"],
  ["What it does", "#capabilities"],
  ["For parents", "#parents"],
  ["FAQ", "#faq"],
] as const;

// Starts as a plain full-width bar aligned with the page, then condenses into
// a floating glass pill as the page scrolls. One progress value drives every
// property so nothing can drift out of sync.
export function Header() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const raw = useTransform(scrollY, [0, 160], [0, 1]);
  const spring = useSpring(raw, { stiffness: 210, damping: 30, mass: 0.6 });
  const p = reduce ? raw : spring;

  const maxWidth = useTransform(p, (v) => `${1180 - 300 * v}px`);
  const marginTop = useTransform(p, (v) => `${16 * v}px`);
  const height = useTransform(p, (v) => `${72 - 16 * v}px`);
  const borderRadius = useTransform(p, (v) => `${999 * v + 2}px`);
  const background = useTransform(p, (v) => `rgba(255,255,255,${0.78 * v})`);
  const borderColor = useTransform(p, (v) => `rgba(18,18,21,${0.09 * v})`);
  const boxShadow = useTransform(p, (v) => `0 1px 2px rgba(18,18,21,${0.04 * v}), 0 8px 24px rgba(18,18,21,${0.07 * v})`);
  const backdropFilter = useTransform(p, (v) => `blur(${18 * v}px) saturate(${100 + 60 * v}%)`);
  const paddingX = useTransform(p, (v) => `${16 - 6 * v}px`);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4">
      <motion.header
        style={{
          maxWidth,
          marginTop,
          height,
          borderRadius,
          background,
          borderColor,
          boxShadow,
          backdropFilter,
          WebkitBackdropFilter: backdropFilter,
          paddingLeft: paddingX,
          paddingRight: paddingX,
        }}
        className="pointer-events-auto flex w-full items-center justify-between border"
      >
        <Link href="/" aria-label="Chalk home" className="rounded-full">
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className="hidden md:flex md:items-center">
          <Highlight
            hover
            mode="children"
            className="rounded-full bg-(--lp-gray)"
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            itemsClassName="shrink-0"
            style={{ display: "flex", alignItems: "center", gap: 2 }}
          >
            {NAV.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="relative z-10 block rounded-full px-3.5 py-1.5 text-[14px] font-medium text-(--lp-ink-2) transition-colors hover:text-(--lp-ink)"
              >
                {label}
              </a>
            ))}
          </Highlight>
        </nav>

        <div className="flex items-center gap-1">
          <Link
            href="/signin"
            className="hidden h-9 items-center rounded-full px-3.5 text-[14px] font-medium text-(--lp-ink) transition-colors hover:bg-(--lp-gray) sm:inline-flex"
          >
            Sign in
          </Link>
          <Link href="/signin" className="lp-btn lp-btn-sm">
            Try a session free
          </Link>
        </div>
      </motion.header>
    </div>
  );
}
