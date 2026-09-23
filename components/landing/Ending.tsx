"use client";

import { useRef, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useInView } from "motion/react";
import { cn } from "@/lib/utils";
import { HERO_FIELD } from "./Band";
import { DitherWave } from "./DitherWave";
import { Container } from "./Section";
import { useReduce } from "./useScript";
import { ChalkMark } from "@/components/app/ChalkMark";

// The page's one ending (Sept 22). Until now it ended twice: `Closing` asked
// you to start, on the hero's light field, and `Footer` said goodbye under it
// on a deep-blue voice wave, two shaders and two sign-offs back to back
// (Mateo: "there's one that says stuck on tonight's homework, start talking,
// and then there's another one below that"). This merges them: the closing
// line and the links on the page, then the hero's light field rising from the
// bottom and fading out as it goes up, behind the wordmark in ink. Mateo picked
// this one ("Horizon") from four on Sept 22.
//
// It is the page's <footer> landmark, outside <main>, so it carries its own
// rails. They start at its top with no fade-in (`--lp-rail-lead: 0`), right
// where main's rails stop, and the join sits under the node where the section's
// rule crosses them, so the dashed lines read as one continuous pair running
// down into the field.

const SITE = [
  ["How it works", "#how-it-works"],
  ["What it does", "#capabilities"],
  ["For parents", "#parents"],
  ["Pricing", "#pricing"],
  ["FAQ", "#faq"],
] as const;

const YEAR = new Date().getFullYear();

// ── Shared pieces ───────────────────────────────────────────────────────────

/* The hero's field, rising from the bottom of its box and fading out upward.
   `solid` is how far up (in % of the box) it stays at full strength, `clear`
   where it has gone completely; `wash` is the page colour laid over it, the
   same lightness as the old closing band. It runs only while on screen and
   stands still under reduced motion, like every other field on the page. It
   paints over the rails (z-[1]) where it is solid and lets them show where it
   has faded, so the grid dissolves into it rather than stopping at an edge. */
function Field({ solid, clear, wash = 0.45, className }: { solid: number; clear: number; wash?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduce();
  const inView = useInView(ref, { margin: "160px" });
  const mask = `linear-gradient(to top, #000 ${solid}%, transparent ${clear}%)`;
  return (
    <div ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 z-[1]", className)} style={{ maskImage: mask, WebkitMaskImage: mask }}>
      <DitherWave {...HERO_FIELD} animate={!reduce && inView} />
      <div className="absolute inset-0" style={{ background: "var(--lp-bg)", opacity: wash }} />
    </div>
  );
}

/* Two sentences, two lines: left to wrap by width, it broke as "…Start /
   talking." and stranded the last word. Each sentence is its own line, and a
   narrow screen may still wrap the first one inside itself. */
function Headline({ className }: { className?: string }) {
  return (
    <h2 className={cn("lp-title m-0 text-[clamp(2rem,3.8vw,3.125rem)] leading-[1.06] text-(--lp-ink)", className)}>
      <span className="block">Stuck on tonight&rsquo;s homework?</span>
      <span className="block">Start talking.</span>
    </h2>
  );
}

function Pitch({ className }: { className?: string }) {
  return (
    <p className={cn("m-0 text-[1.0625rem] leading-[1.55] text-(--lp-ink-2) sm:text-[1.125rem]", className)}>
      Free to try right now. Bring one problem and say where you&rsquo;re stuck.
    </p>
  );
}

/* The same button the page opened with. */
function Start({ className }: { className?: string }) {
  return (
    <Link href="/signin?mode=signup" className={cn("lp-btn", className)}>
      Try a session free
      <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
    </Link>
  );
}

function SiteLinks({ className }: { className?: string }) {
  return (
    <ul className={cn("m-0 list-none p-0", className)}>
      {SITE.map(([label, href]) => (
        <li key={href}>
          <a href={href} className="rounded-[6px] text-[14.5px] text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)">
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function SignIn({ className }: { className?: string }) {
  return (
    <Link href="/signin" className={cn("group inline-flex items-center gap-1.5 rounded-[6px] text-[14.5px] font-semibold text-(--lp-ink) outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)", className)}>
      Sign in
      <ArrowRight size={14} strokeWidth={2.4} aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

function Story({ className }: { className?: string }) {
  return <p className={cn("m-0 text-[13px] leading-[1.5] text-(--lp-ink-2)", className)}>Built by students, for students.</p>;
}

function Copyright({ className }: { className?: string }) {
  return <p className={cn("m-0 text-[13px] text-(--lp-ink-2)", className)}>&copy; {YEAR} Chalk</p>;
}

// ── The ending ──────────────────────────────────────────────────────────────
// The wordmark is ink because the field is light: the white wordmark of the
// old deep-blue footer would vanish on it. It was 192px at first and read as
// shouting; Mateo asked for it smaller (Sept 22), so it tops out at 120px.

export function Ending() {
  return (
    <footer className="lp-rails" style={{ "--lp-rail-lead": "0px" } as CSSProperties}>
      <section className="lp-rule relative">
        <Container className="relative z-[2] pt-14 sm:pt-20">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
            <div>
              <Headline />
              <Pitch className="mt-5 max-w-[42ch]" />
              <Start className="mt-8" />
            </div>
            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-14 sm:gap-x-20">
              <SiteLinks className="flex flex-col gap-3" />
              <div className="flex flex-col gap-3">
                <SignIn />
              </div>
            </nav>
          </div>
        </Container>

        <div className="relative mt-10 h-[clamp(200px,22vw,320px)] sm:mt-14">
          <Field solid={22} clear={100} />
          <Container className="relative z-[2] flex h-full flex-col justify-end pb-6 sm:pb-8">
            <p aria-hidden className="lp-brand m-0 flex items-center gap-[0.2em] text-[clamp(3.25rem,8.5vw,7.5rem)] leading-[0.9] text-(--lp-ink)">
              <ChalkMark size={120} color="var(--lp-ink)" className="size-[1em] shrink-0" />
              <span className="translate-y-[0.04em]">chalk</span>
            </p>
            <div className="mt-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <Story />
              <Copyright />
            </div>
          </Container>
        </div>
      </section>
    </footer>
  );
}
