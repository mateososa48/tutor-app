"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { ArrowRight } from "lucide-react";
import BlurText from "@/components/BlurText";
import Magnet from "@/components/Magnet";
import { SessionDemo } from "./SessionDemo";
import { DitherWave } from "./DitherWave";
import { HERO_SHADER_DEFAULT, ShaderTuner, loadHeroShader, saveHeroShader, type HeroShader } from "./ShaderTuner";
import { useReduce } from "./useScript";

const EASE = [0.16, 1, 0.3, 1] as const;
// The swirl across the whole hero with its own settings (HERO_SHADER_DEFAULT in
// ShaderTuner.tsx), faded into the page at the bottom. A still frame under reduced motion.
// Double-click the hero's background (in development, or on any build with
// ?tune in the URL) to open ShaderTuner and change every setting live. The
// settings live here, not in Hero, so dragging a slider never re-renders the
// demo board; tuned values are kept in this browser only.
function Backdrop() {
  const reduce = useReduce();
  const ref = useRef<HTMLDivElement>(null);
  const [shader, setShader] = useState<HeroShader>(HERO_SHADER_DEFAULT);
  const [tuner, setTuner] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const section = ref.current?.parentElement;
    if (!section) return;
    const tunable = process.env.NODE_ENV !== "production" || new URLSearchParams(window.location.search).has("tune");
    if (!tunable) return;
    // Settings tuned earlier in this browser, applied on the next frame.
    const restore = requestAnimationFrame(() => {
      const saved = loadHeroShader();
      if (saved) setShader(saved);
    });
    const onDoubleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("a, button, input, textarea, select, label, [data-no-tune]")) return;
      window.getSelection()?.removeAllRanges();
      setTuner({ x: e.clientX, y: e.clientY });
    };
    section.addEventListener("dblclick", onDoubleClick);
    return () => {
      cancelAnimationFrame(restore);
      section.removeEventListener("dblclick", onDoubleClick);
    };
  }, []);

  const change = (next: HeroShader) => {
    setShader(next);
    saveHeroShader(next);
  };

  return (
    <>
      <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <DitherWave
          pattern={shader.pattern}
          waveColor={shader.waveColor}
          deepColor={shader.useDeep ? shader.deepColor : undefined}
          backgroundColor={shader.backgroundColor}
          colorNum={shader.colorNum}
          pixelSize={shader.pixelSize}
          waveSpeed={shader.waveSpeed}
          waveFrequency={shader.waveFrequency}
          waveAmplitude={shader.waveAmplitude}
          lightness={shader.lightness}
          animate={!reduce && shader.animate}
        />
        {shader.wash > 0 && <div className="absolute inset-0" style={{ background: "var(--lp-bg)", opacity: shader.wash }} />}
        {shader.fade > 0 && (
          <div
            className="absolute inset-x-0 bottom-0"
            style={{ height: shader.fade, background: "linear-gradient(to bottom, transparent, var(--lp-bg) 70%)" }}
          />
        )}
      </div>
      {tuner && (
        <ShaderTuner
          key={`${tuner.x}:${tuner.y}`}
          at={tuner}
          value={shader}
          onChange={change}
          onReset={() => {
            setShader(HERO_SHADER_DEFAULT);
            saveHeroShader(null);
          }}
          onClose={() => setTuner(null)}
        />
      )}
    </>
  );
}

// The app frame arrives leaning back, like a screen seen from a little above,
// and stands up as it scrolls into view: 14 degrees to flat, 0.94 to full
// size, between the frame's top crossing 92% and 30% of the viewport. The
// values are scroll-driven motion values run through a light spring, so
// nothing re-renders while the page scrolls. At rest Motion writes
// `transform: none`, so the live board stays crisp. Reduced motion: flat.
function HeroFrame() {
  const reduce = useReduce();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 92%", "start 30%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.5 });
  const rotateX = useTransform(progress, [0, 1], [14, 0]);
  const scale = useTransform(progress, [0, 1], [0.94, 1]);
  const still = { rotateX: 0, scale: 1 };

  return (
    <motion.div
      ref={ref}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
      className="relative mt-14 lg:mt-16"
      data-no-tune
    >
      <div style={{ perspective: 1400 }}>
        <motion.div style={reduce ? still : { rotateX, scale, transformOrigin: "50% 100%" }}>
          <div className="lp-frame">
            <div className="lp-window relative overflow-hidden">
              <SessionDemo />
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export function Hero() {
  const reduce = useReduce();

  return (
    <section className="relative isolate pt-32 pb-14 sm:pb-20 lg:pt-40 lg:pb-24">
      <Backdrop />
      <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <div className="max-w-[880px]">
          <h1 className="lp-title text-[clamp(2.75rem,5vw,4.125rem)] leading-[1.02]">
            <BlurText text="A math tutor you talk to. It writes as it explains." animateBy="words" delay={55} direction="top" />
          </h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5, ease: EASE }}
            className="mt-6 max-w-[46ch] text-[1.125rem] leading-[1.55] text-(--lp-ink) sm:text-[1.25rem]"
          >
            Grades 5 to 12. Say where you&rsquo;re stuck. It draws the step, then waits for you to try the next one.
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

        <HeroFrame />
      </div>
    </section>
  );
}
