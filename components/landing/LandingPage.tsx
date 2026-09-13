"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import katex from "katex";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Mic, PenLine, ShieldCheck, ArrowRight, Sparkles } from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────────
   Chalk — public landing page.
   Paper + ink + honey. SF Pro with size-specific tracking. Liquid glass
   floating chrome. One editorial serif moment. Springs, not keyframes,
   for everything a user watches happen.
   ──────────────────────────────────────────────────────────────────────────── */

const EASE = [0.23, 1, 0.32, 1] as const;

function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center gap-2 select-none"
      style={{ fontSize: size, fontWeight: 650, letterSpacing: "-0.02em", color: "var(--ink)" }}
    >
      <svg width={size + 5} height={size + 5} viewBox="0 0 22 22" aria-hidden>
        <rect x="1" y="1" width="20" height="20" rx="6" fill="var(--ink)" />
        <path
          d="M6 13.5c2.2-4.6 4.2-6.9 5.4-6.4 1.3.5-1.8 6.4-.6 6.9 1 .4 2.6-1.6 4.6-3.4"
          fill="none"
          stroke="var(--honey)"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
      chalk
    </span>
  );
}

/* ── Floating glass header ── */

function GlassHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 pointer-events-none">
      <motion.header
        initial={{ opacity: 0, y: -14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: EASE }}
        className="glass pointer-events-auto flex w-full max-w-[720px] items-center justify-between rounded-full py-2 pl-5 pr-2"
        style={{
          boxShadow: scrolled
            ? "var(--glass-shadow)"
            : "0 1px 1px rgba(0,0,0,0.03), 0 4px 14px rgba(29,29,31,0.05)",
          transition: "box-shadow 300ms ease",
        }}
      >
        <Link href="/" aria-label="Chalk home" className="pressable rounded-full">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
          {[
            ["How it works", "#demo"],
            ["For parents", "#parents"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="pressable rounded-full px-3.5 py-1.5 text-[13.5px] font-medium"
              style={{ color: "var(--ink-2)" }}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <Link
            href="/signin"
            className="pressable hidden rounded-full px-3.5 py-1.5 text-[13.5px] font-medium sm:block"
            style={{ color: "var(--ink)" }}
          >
            Sign in
          </Link>
          <Link href="/signin" className="btn-ink px-4 py-2 text-[13.5px]">
            Try free
          </Link>
        </div>
      </motion.header>
    </div>
  );
}

/* ── Ambient backdrop: two soft glows + grain ── */

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -top-[20%] left-[8%] h-[55vmax] w-[55vmax] rounded-full"
        style={{
          background:
            "radial-gradient(circle at center, var(--honey-glow), transparent 62%)",
          filter: "blur(40px)",
          animation: "glow-drift 26s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -bottom-[30%] right-[-10%] h-[48vmax] w-[48vmax] rounded-full"
        style={{
          background:
            "radial-gradient(circle at center, rgba(29,29,31,0.05), transparent 60%)",
          filter: "blur(40px)",
          animation: "glow-drift 32s ease-in-out infinite reverse",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.35] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
          backgroundSize: "180px 180px",
        }}
      />
    </div>
  );
}

/* ── Hero ── */

const CHIPS = [
  "Factor x² + 5x + 6",
  "Why does dividing flip the inequality?",
  "Walk me through my physics homework",
];

function Hero() {
  return (
    <section className="relative flex flex-col items-center px-5 pb-14 pt-40 text-center sm:pb-20 sm:pt-48">
      <Ambient />

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE, delay: 0.05 }}
        className="text-eyebrow relative mb-5"
      >
        A tutor, not an answer machine
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE, delay: 0.12 }}
        className="text-display relative max-w-[13ch]"
        style={{ textWrap: "balance" }}
      >
        Learning, out&nbsp;loud.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE, delay: 0.22 }}
        className="text-body-lg relative mt-6 max-w-[46ch]"
      >
        Chalk talks through problems with you — a real conversation, with every
        step drawn on a live whiteboard. It guides. It waits. It never just
        hands you the answer.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE, delay: 0.32 }}
        className="relative mt-9 flex flex-wrap items-center justify-center gap-3"
      >
        <Link href="/signin" className="btn-ink px-6 py-3.5 text-[15px]">
          Try a session free
          <ArrowRight size={15} strokeWidth={2.2} aria-hidden />
        </Link>
        <a href="#demo" className="btn-quiet px-6 py-3.5 text-[15px]">
          See how it works
        </a>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.5 }}
        className="relative mt-12 flex flex-wrap items-center justify-center gap-2"
        aria-label="Example questions"
      >
        {CHIPS.map((chip) => (
          <Link
            key={chip}
            href="/signin"
            className="pressable glass rounded-full px-4 py-2 text-[13px] font-medium"
            style={{ color: "var(--ink-2)", boxShadow: "var(--shadow-card)" }}
          >
            {chip}
          </Link>
        ))}
      </motion.div>
    </section>
  );
}

/* ── The living demo: a session that draws itself ── */

type DemoStep = {
  latex: string;
  note: string;
};

const DEMO_STEPS: DemoStep[] = [
  { latex: "2x + 3 = 11", note: "given" },
  { latex: "2x = 8", note: "subtract 3" },
  { latex: "x = 4", note: "divide by 2" },
];

const DEMO_SCRIPT = [
  { at: 0, kind: "student" as const },
  { at: 800, kind: "tutor" as const },
  { at: 1500, kind: "title" as const },
  { at: 2200, kind: "step" as const, index: 0 },
  { at: 3000, kind: "step" as const, index: 1 },
  { at: 3800, kind: "step" as const, index: 2 },
  { at: 4900, kind: "callout" as const },
  { at: 9800, kind: "reset" as const },
];

function Katex({ latex, size = 19 }: { latex: string; size?: number }) {
  return (
    <span
      style={{ fontSize: size }}
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(latex, { throwOnError: false }),
      }}
    />
  );
}

function VoiceBars({ active }: { active: boolean }) {
  return (
    <span className="inline-flex h-4 items-end gap-[2.5px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full"
          style={{
            height: "100%",
            background: active ? "var(--honey-deep)" : "var(--ink-3)",
            transformOrigin: "bottom",
            transform: active ? undefined : "scaleY(0.25)",
            animation: active
              ? `meter-pulse 0.9s ease-in-out ${i * 0.13}s infinite`
              : "none",
            transition: "background 200ms ease",
          }}
        />
      ))}
    </span>
  );
}

function DemoBoardRow({ step, shown }: { step: DemoStep; shown: boolean }) {
  return (
    <motion.div
      initial={false}
      animate={
        shown
          ? { opacity: 1, y: 0, filter: "blur(0px)" }
          : { opacity: 0, y: 8, filter: "blur(3px)" }
      }
      transition={{ duration: 0.45, ease: EASE }}
      className="flex items-baseline gap-5"
    >
      <span className="min-w-[130px]">
        <Katex latex={step.latex} />
      </span>
      <span
        className="shrink-0 text-[12px] italic"
        style={{ color: "var(--ink-3)" }}
      >
        {step.note}
      </span>
    </motion.div>
  );
}

function LiveDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "-120px" });
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState(0); // count of script events fired
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (reduceMotion) {
      setPhase(DEMO_SCRIPT.length - 1); // static final frame
      return;
    }
    if (!inView) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      setPhase(0);
      DEMO_SCRIPT.forEach((evt, i) => {
        timers.current.push(
          setTimeout(() => {
            if (cancelled) return;
            if (evt.kind === "reset") {
              run();
            } else {
              setPhase(i + 1);
            }
          }, evt.at),
        );
      });
    };
    run();
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [inView, reduceMotion]);

  const fired = (kind: string, index?: number) =>
    DEMO_SCRIPT.some(
      (evt, i) =>
        i < phase &&
        evt.kind === kind &&
        (index === undefined || ("index" in evt && evt.index === index)),
    );

  const tutorSpeaking = fired("tutor") && !fired("callout");

  return (
    <section id="demo" className="relative scroll-mt-28 px-5 py-20 sm:py-28">
      <div className="mx-auto max-w-[1020px]">
        <div className="mb-12 text-center">
          <p className="text-eyebrow mb-4">How it works</p>
          <h2 className="text-headline mx-auto max-w-[22ch]" style={{ textWrap: "balance" }}>
            You talk. It listens, and draws.
          </h2>
        </div>

        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 28, scale: 0.985 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: EASE }}
          className="overflow-hidden rounded-3xl"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
            boxShadow: "var(--shadow-float)",
          }}
        >
          {/* Window chrome */}
          <div
            className="flex items-center justify-between border-b px-5 py-3"
            style={{ borderColor: "var(--hairline)" }}
          >
            <div className="flex items-center gap-2" aria-hidden>
              {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                <span
                  key={c}
                  className="h-[11px] w-[11px] rounded-full"
                  style={{ background: c, opacity: 0.9 }}
                />
              ))}
            </div>
            <span
              className="inline-flex items-center gap-2 text-[12px] font-medium"
              style={{ color: "var(--ink-2)" }}
            >
              <span
                className="h-[7px] w-[7px] rounded-full"
                style={{
                  background: "var(--live)",
                  animation: "live-pulse 2s ease-in-out infinite",
                }}
              />
              Live session · Algebra
            </span>
            <span className="w-[52px]" aria-hidden />
          </div>

          <div className="grid gap-0 sm:grid-cols-[1fr_270px]">
            {/* Whiteboard */}
            <div
              className="relative min-h-[320px] p-7 sm:min-h-[380px] sm:p-10"
              style={{
                backgroundImage:
                  "radial-gradient(circle, var(--hairline) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            >
              {/* Chalk cursor — the board is "thinking" before the first mark */}
              {!fired("title") && (
                <span
                  aria-hidden
                  className="absolute h-[22px] w-[2.5px] rounded-full"
                  style={{
                    background: "var(--honey-deep)",
                    animation: "cursor-blink 1s steps(1) infinite",
                  }}
                />
              )}
              <motion.h3
                initial={false}
                animate={
                  fired("title")
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 8 }
                }
                transition={{ duration: 0.45, ease: EASE }}
                className="mb-6 text-[17px] font-semibold"
                style={{ letterSpacing: "-0.015em" }}
              >
                Solving 2x + 3 = 11
              </motion.h3>

              <div className="flex max-w-[300px] flex-col gap-4">
                {DEMO_STEPS.map((step, i) => (
                  <DemoBoardRow key={step.latex} step={step} shown={fired("step", i)} />
                ))}
              </div>

              <motion.div
                initial={false}
                animate={
                  fired("callout")
                    ? { opacity: 1, y: 0, scale: 1 }
                    : { opacity: 0, y: 10, scale: 0.97 }
                }
                transition={{ duration: 0.45, ease: EASE }}
                className="mt-8 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-medium"
                style={{
                  background: "var(--honey-soft)",
                  color: "var(--honey-deep)",
                  border: "1px solid color-mix(in oklch, var(--honey) 30%, transparent)",
                }}
              >
                <Sparkles size={14} aria-hidden />
                Your turn: try 3x − 5 = 7
              </motion.div>
            </div>

            {/* Conversation rail */}
            <div
              className="flex flex-col justify-end gap-3 border-t p-5 sm:border-l sm:border-t-0"
              style={{ borderColor: "var(--hairline)", background: "var(--surface-2)" }}
            >
              <motion.div
                initial={false}
                animate={fired("student") ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="self-end rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13.5px]"
                style={{ background: "var(--ink)", color: "var(--paper)", maxWidth: "85%" }}
              >
                I&rsquo;m stuck on 2x + 3 = 11
              </motion.div>

              <motion.div
                initial={false}
                animate={fired("tutor") ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="self-start rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13.5px]"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--hairline)",
                  color: "var(--ink)",
                  maxWidth: "90%",
                }}
              >
                Let&rsquo;s write it out. What would undo that&nbsp;+3?
              </motion.div>

              <div
                className="mt-2 flex items-center justify-between rounded-full border px-4 py-2.5"
                style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
              >
                <span className="inline-flex items-center gap-2.5 text-[12.5px] font-medium" style={{ color: "var(--ink-2)" }}>
                  <Mic size={13} aria-hidden />
                  {tutorSpeaking ? "Tutor speaking…" : "Listening…"}
                </span>
                <VoiceBars active={tutorSpeaking} />
              </div>
            </div>
          </div>
        </motion.div>

        <p className="text-caption mt-5 text-center">
          Real product behavior — the tutor speaks and draws in real time.
        </p>
      </div>
    </section>
  );
}

/* ── Three principles ── */

const PRINCIPLES = [
  {
    icon: Mic,
    title: "Talk it through",
    body: "No typing math into a chat box. Say it like you'd say it to a person — interrupt, ask again, think out loud.",
  },
  {
    icon: PenLine,
    title: "Watch it drawn",
    body: "Every equation, graph, and diagram appears on a shared whiteboard, step by step, so the reasoning stays visible.",
  },
  {
    icon: ShieldCheck,
    title: "Never just answers",
    body: "Chalk is built to guide — smallest useful hint first. It asks for your attempt before it shows its own.",
  },
];

function Principles() {
  return (
    <section className="px-5 py-16 sm:py-24">
      <div className="mx-auto grid max-w-[1020px] gap-4 sm:grid-cols-3">
        {PRINCIPLES.map((p, i) => (
          <motion.article
            key={p.title}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, ease: EASE, delay: i * 0.08 }}
            className="rounded-3xl p-7"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--hairline)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <span
              className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "var(--honey-soft)", color: "var(--honey-deep)" }}
            >
              <p.icon size={18} strokeWidth={2} aria-hidden />
            </span>
            <h3 className="text-title mb-2">{p.title}</h3>
            <p className="text-body" style={{ color: "var(--ink-2)" }}>
              {p.body}
            </p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

/* ── The sister story — the one serif moment ── */

function Story() {
  return (
    <section className="px-5 py-20 sm:py-28">
      <motion.figure
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8, ease: EASE }}
        className="mx-auto max-w-[720px] text-center"
      >
        <svg
          width="36"
          height="28"
          viewBox="0 0 36 28"
          aria-hidden
          className="mx-auto mb-8"
          style={{ color: "var(--honey)" }}
        >
          <path
            d="M0 28V16.8C0 7.4 5.5 1.2 14.6 0l1.8 4.6C10.6 6.2 7.6 9.8 7.4 14H15v14H0Zm21 0V16.8C21 7.4 26.5 1.2 35.6 0l1.8 4.6c-5.8 1.6-8.8 5.2-9 9.4H36v14H21Z"
            transform="scale(0.9)"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
        <blockquote
          className="text-serif"
          style={{
            fontSize: "clamp(1.5rem, 1.6vw + 1.1rem, 2.125rem)",
            lineHeight: 1.35,
            fontWeight: 500,
            color: "var(--ink)",
          }}
        >
          I started building this because my little sister was stuck — not
          because she couldn&rsquo;t do math, but because nobody had the patience
          to sit with her while she figured it out. Chalk is that patience.
        </blockquote>
        <figcaption className="text-caption mt-7" style={{ fontSize: "0.8125rem" }}>
          Mateo — student, builder of Chalk
        </figcaption>
      </motion.figure>
    </section>
  );
}

/* ── Parents strip ── */

const PARENT_POINTS = [
  "Guides instead of giving answers — homework stays theirs",
  "Patient on the fifth try, at 9pm, every night",
  "A fraction of the cost of an hour of tutoring",
];

function Parents() {
  return (
    <section id="parents" className="scroll-mt-28 px-5 pb-24 sm:pb-32">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: EASE }}
        className="relative mx-auto max-w-[1020px] overflow-hidden rounded-3xl px-7 py-12 text-center sm:px-14 sm:py-16"
        style={{ background: "var(--ink)", color: "var(--paper)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-1/2 left-1/2 h-[120%] w-[120%] -translate-x-1/2 rounded-full"
          style={{
            background: "radial-gradient(circle at center, var(--honey-glow), transparent 65%)",
            filter: "blur(30px)",
          }}
        />
        <p className="text-eyebrow relative mb-4" style={{ color: "var(--honey)" }}>
          For parents
        </p>
        <h2
          className="text-headline relative mx-auto max-w-[24ch]"
          style={{ color: "#f5f5f7", textWrap: "balance" }}
        >
          See the learning, not just the grades.
        </h2>
        <ul className="relative mx-auto mt-8 flex max-w-[520px] flex-col gap-3 text-left">
          {PARENT_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-3 text-[15px]" style={{ color: "#d5d5d9" }}>
              <span
                className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full"
                style={{ background: "var(--honey)" }}
                aria-hidden
              />
              {point}
            </li>
          ))}
        </ul>
        <div className="relative mt-10">
          <Link
            href="/signin"
            className="pressable inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold"
            style={{ background: "#f5f5f7", color: "#1d1d1f" }}
          >
            Start their first session
            <ArrowRight size={15} strokeWidth={2.2} aria-hidden />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

/* ── Footer ── */

function Footer() {
  return (
    <footer className="border-t px-5 py-10" style={{ borderColor: "var(--hairline)" }}>
      <div className="mx-auto flex max-w-[1020px] flex-col items-center justify-between gap-5 sm:flex-row">
        <Wordmark size={15} />
        <p className="text-caption order-last sm:order-none">
          © {new Date().getFullYear()} Chalk. Built with care by a student.
        </p>
        <nav className="flex items-center gap-5" aria-label="Footer">
          <a href="#demo" className="text-caption pressable" style={{ color: "var(--ink-2)" }}>
            How it works
          </a>
          <Link href="/signin" className="text-caption pressable" style={{ color: "var(--ink-2)" }}>
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/* ── Page ── */

export default function LandingPage() {
  return (
    <div style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <GlassHeader />
      <main>
        <Hero />
        <LiveDemo />
        <Principles />
        <Story />
        <Parents />
      </main>
      <Footer />
    </div>
  );
}
