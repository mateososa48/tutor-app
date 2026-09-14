"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import BlurText from "@/components/BlurText";
import Magnet from "@/components/Magnet";
import { SessionDemo } from "./SessionDemo";
import { DitherWave } from "./DitherWave";
import { useReduce } from "./useScript";

const EASE = [0.16, 1, 0.3, 1] as const;
const WAVE: [number, number, number] = [0.55, 0.74, 1];
const BG: [number, number, number] = [0.984, 0.984, 0.988];

// Dithered wave shader in the page's own white and sky. Masked so it fades
// into the page at the edges and under the product window.
function Backdrop() {
  const reduce = useReduce();
  const mask = "radial-gradient(95% 85% at 78% 0%, #000 25%, transparent 100%)";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[110%]" style={{ maskImage: mask, WebkitMaskImage: mask }}>
        {reduce ? (
          <div
            className="h-full w-full"
            style={{ background: "radial-gradient(70% 55% at 40% 10%, var(--lp-sky-soft), transparent 70%)" }}
          />
        ) : (
          <DitherWave
            waveColor={WAVE}
            backgroundColor={BG}
            colorNum={4}
            pixelSize={3}
            waveAmplitude={0.42}
            waveFrequency={2.0}
            waveSpeed={0.035}
            className="opacity-80"
          />
        )}
      </div>
      <div
        className="absolute inset-x-0 top-0 h-28"
        style={{ background: "linear-gradient(to bottom, var(--lp-bg), transparent)" }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-72"
        style={{ background: "linear-gradient(to bottom, transparent, var(--lp-bg) 70%)" }}
      />
    </div>
  );
}

export function Hero() {
  const reduce = useReduce();

  return (
    <section className="relative isolate pt-32 pb-14 sm:pb-20 lg:pt-40 lg:pb-24">
      <Backdrop />
      <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <div className="max-w-[820px]">
          <h1 className="lp-display text-[clamp(2.75rem,5.2vw,4.25rem)] leading-[1.02]">
            <BlurText text="A tutor at the board, whenever you're stuck." animateBy="words" delay={55} direction="top" />
          </h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5, ease: EASE }}
            className="mt-6 max-w-[44ch] text-[1.125rem] leading-[1.55] text-(--lp-ink-2) sm:text-[1.25rem]"
          >
            Talk through homework with a tutor that draws every step on a whiteboard and never just gives the answer.
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.62, ease: EASE }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <Magnet padding={48} magnetStrength={22} disabled={!!reduce}>
              <Link href="/signin" className="lp-btn">
                Try a session free
                <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
              </Link>
            </Magnet>
            <a href="#how-it-works" className="lp-btn lp-btn-quiet">
              See how it works
            </a>
          </motion.div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 28, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
          className="relative mt-14 lg:mt-16"
        >
          <div className="lp-frame">
            <div className="lp-window relative overflow-hidden">
              <SessionDemo />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
