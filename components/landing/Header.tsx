"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { Highlight } from "@/components/animate-ui/primitives/effects/highlight";
import { Wordmark } from "./Wordmark";

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

// Two states, one progress value. At the top: a full-width bar whose content
// sits exactly on the page's text edge. Scrolled: a floating rounded panel,
// radius matched to the buttons, nav dead-centred, room for the CTA's shadow.
export function Header() {
  const reduce = useReducedMotion();
  const isSm = useIsSm();
  const { scrollY } = useScroll();
  const raw = useTransform(scrollY, [0, 140], [0, 1]);
  const spring = useSpring(raw, { stiffness: 230, damping: 32, mass: 0.6 });
  const p = reduce ? raw : spring;

  const gutter = isSm ? 32 : 20; // page container padding at this breakpoint
  const wrapperPad = useTransform(p, (v) => `${16 * v}px`);
  const maxWidth = useTransform(p, (v) => `${1180 - 260 * v}px`);
  const marginTop = useTransform(p, (v) => `${14 * v}px`);
  const height = useTransform(p, (v) => `${72 - 16 * v}px`);
  const paddingLeft = useTransform(p, (v) => `${gutter - (gutter - 14) * v}px`);
  const paddingRight = useTransform(p, (v) => `${gutter - (gutter - 16) * v}px`);
  const borderRadius = useTransform(p, (v) => `${10 * v}px`);
  const background = useTransform(p, (v) => `rgba(255,255,255,${0.88 * v})`);
  const borderColor = useTransform(p, (v) => `rgba(18,18,21,${0.1 * v})`);
  const boxShadow = useTransform(
    p,
    (v) =>
      `inset 0 1px 0 rgba(255,255,255,${0.9 * v}), 0 1px 2px rgba(18,18,21,${0.05 * v}), 0 12px 32px rgba(18,18,21,${0.08 * v})`,
  );
  const backdropFilter = useTransform(p, (v) => `blur(${16 * v}px) saturate(${100 + 50 * v}%)`);

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
        className="pointer-events-auto grid w-full grid-cols-[1fr_auto] items-center border md:grid-cols-[1fr_auto_1fr]"
      >
        <Link href="/" aria-label="Chalk home" className="justify-self-start rounded-[8px] outline-none focus-visible:ring-[3px] focus-visible:ring-(--lp-sky-glow)">
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className="hidden justify-self-center md:flex md:items-center md:gap-0.5">
          <Highlight
            hover
            mode="children"
            className="rounded-[8px] bg-(--lp-gray)"
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            itemsClassName="shrink-0"
          >
            {NAV.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="relative z-10 block rounded-[8px] px-3 py-1.5 text-[14px] font-medium text-(--lp-ink-2) transition-colors hover:text-(--lp-ink) focus-visible:text-(--lp-ink)"
              >
                {label}
              </a>
            ))}
          </Highlight>
        </nav>

        {/* pb offsets the pressed button's 4px shadow so the block reads centred */}
        <div className="flex items-center gap-2 justify-self-end pb-[4px]">
          <Link
            href="/signin"
            className="hidden h-[38px] items-center rounded-[10px] px-3 text-[14px] font-medium text-(--lp-ink) transition-colors hover:bg-(--lp-gray) sm:inline-flex"
          >
            Sign in
          </Link>
          <Link href="/signin" className="lp-btn lp-btn-sm">
            Try a session free
          </Link>
        </div>
      </motion.header>
    </motion.div>
  );
}
