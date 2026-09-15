"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Wordmark } from "./Wordmark";
import { useReduce } from "./useScript";

const NAV = [
  ["How it works", "#how-it-works"],
  ["What it does", "#capabilities"],
  ["For parents", "#parents"],
  ["FAQ", "#faq"],
] as const;

// Matches the `sm` breakpoint so the bar state lines up with the page
// container's padding (20px on phones, 32px from sm up).
function useIsSm() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 640px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 640px)").matches,
    () => true,
  );
}

// A nav link whose sky pen stroke draws itself underneath on hover, left to
// right (`.nav-link` / `.nav-scribble` in globals.css).
function NavLink({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      className="nav-link relative block rounded-[8px] px-3 py-1.5 text-[14px] font-medium text-(--lp-ink) outline-none"
    >
      {label}
      <svg
        aria-hidden
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        className="pointer-events-none absolute bottom-0 left-2.5 h-[7px] w-[calc(100%-20px)] overflow-visible"
      >
        <path className="nav-scribble" pathLength={1} d="M1 6 C 12 2.5, 22 8.5, 34 5 S 56 2.5, 68 5.5 S 88 8, 99 4.5" />
      </svg>
    </a>
  );
}

// Two states, one progress value. At the top: a slim full-width bar whose
// content sits on the page's text edge. Scrolled: a floating liquid-glass
// rectangle (reference: references/Screenshot 2026-09-14 at 3.45.11 PM.png),
// kept rectangular rather than a pill. The glass is a web approximation:
// backdrop blur and saturation, a white edge, an inner top light, a sheen and
// a soft shadow. The CTA sits 6px in from the edge, so the corner radius is
// the button's 10px plus 6px.
export function Header() {
  const reduce = useReduce();
  const isSm = useIsSm();
  const { scrollY } = useScroll();
  const raw = useTransform(scrollY, [0, 140], [0, 1]);
  const spring = useSpring(raw, { stiffness: 230, damping: 32, mass: 0.6 });
  const p = reduce ? raw : spring;

  const gutter = isSm ? 32 : 20; // page container padding at this breakpoint
  const wrapperPad = useTransform(p, (v) => `${16 * v}px`);
  const maxWidth = useTransform(p, (v) => `${1180 - 260 * v}px`);
  const marginTop = useTransform(p, (v) => `${12 * v}px`);
  const height = useTransform(p, (v) => `${60 - 12 * v}px`);
  const paddingLeft = useTransform(p, (v) => `${gutter - (gutter - 14) * v}px`);
  const paddingRight = useTransform(p, (v) => `${gutter - (gutter - 6) * v}px`);
  const borderRadius = useTransform(p, (v) => `${16 * v}px`);
  const background = useTransform(
    p,
    (v) => `linear-gradient(180deg, rgba(255,255,255,${0.72 * v}) 0%, rgba(255,255,255,${0.5 * v}) 100%)`,
  );
  const borderColor = useTransform(p, (v) => `rgba(255,255,255,${0.75 * v})`);
  const boxShadow = useTransform(
    p,
    (v) =>
      `inset 0 1px 0 rgba(255,255,255,${0.95 * v}), inset 0 -1px 0 rgba(255,255,255,${0.35 * v}), 0 0 0 1px rgba(18,18,21,${0.07 * v}), 0 6px 12px rgba(18,18,21,${0.06 * v}), 0 1px 2px rgba(18,18,21,${0.05 * v})`,
  );
  const backdropFilter = useTransform(p, (v) => `blur(${20 * v}px) saturate(${100 + 80 * v}%)`);
  const sheen = useTransform(p, (v) => v);

  return (
    <motion.div style={{ paddingLeft: wrapperPad, paddingRight: wrapperPad }} className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center">
      <motion.header
        style={{
          maxWidth,
          marginTop,
          height,
          paddingLeft,
          paddingRight,
          borderRadius,
          background,
          borderColor,
          boxShadow,
          backdropFilter,
          WebkitBackdropFilter: backdropFilter,
        }}
        className="pointer-events-auto relative grid w-full grid-cols-[1fr_auto] items-center border md:grid-cols-[1fr_auto_1fr]"
      >
        {/* The glass's light: a soft highlight from the top left corner. */}
        <motion.span
          aria-hidden
          style={{ opacity: sheen }}
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(120%_160%_at_0%_0%,rgba(255,255,255,0.6),transparent_45%)]"
        />

        {/* A flex box, not a block: a block puts the inline wordmark on a text line
            with room for descenders under it, which pushes the logo above centre. */}
        <Link href="/" aria-label="Chalk home" className="relative flex items-center justify-self-start rounded-[8px] outline-none focus-visible:ring-[3px] focus-visible:ring-(--lp-sky-glow)">
          <Wordmark size={19} />
        </Link>

        <nav aria-label="Primary" className="relative hidden justify-self-center md:flex md:items-center md:gap-0.5">
          {NAV.map(([label, href]) => (
            <NavLink key={href} label={label} href={href} />
          ))}
        </nav>

        <div className="relative flex items-center gap-1.5 justify-self-end">
          <Link
            href="/signin"
            className="hidden h-9 items-center rounded-[10px] px-3 text-[14px] font-medium text-(--lp-ink) outline-none transition-colors hover:bg-black/5 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) sm:inline-flex"
          >
            Sign in
          </Link>
          <Link href="/signin" className={cn(buttonVariants(), "btn-gloss-lift h-9 rounded-[10px] px-3.5 text-[14px] font-semibold")}>
            Try a session free
          </Link>
        </div>
      </motion.header>
    </motion.div>
  );
}
