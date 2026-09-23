"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView } from "motion/react";
import { cn } from "@/lib/utils";
import { Band } from "../Band";
import { Container, EASE, Lede, Reveal, Section } from "../Section";
import { useReduce } from "../useScript";
import { LESSON, LESSON_FRAMES, LESSON_SIZE, RANGE } from "./moments";
import { HowHeading, PetSays } from "./parts";

// How it works, as a bento (Sept 22). Mateo picked it over four other layouts
// and then shaped it over three rounds:
//
//   "a double border", "gradients... to show what is a diagram or illustration
//   and what is text" → every card is the page's own double border
//   (`.lp-frame`'s recipe: a hairline, a 5px band, a white panel), square like
//   the grid. The small nodes on its corners came off on Sept 22.
//
//   "there are still three borders", "we don't need those lines" → no grid
//   lines at all: no dividers, no frame. The only edges are the cards'.
//
//   "put the text inside", "just keep it all white", "a clear difference
//   between where it's text and where it's the animations" → each card is
//   two white zones, the picture above and the words below, split by a
//   short dashed rule in the grid's own dashes.
//
// The lesson card is the anchor, about twice the others, as in Linear's and
// Resend's bentos. Board photographs are drawn with multiply, so their white
// never shows as a box. That breaks inside a stacking context left by a
// filter, which is why the cards rise in without the page's blurred `Reveal`.

const at = (key: string) => RANGE.find((m) => m.key === key)!;

function useTick(on: boolean, count: number, ms: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setI((n) => (n + 1) % count), ms);
    return () => clearInterval(t);
  }, [on, count, ms]);
  return i;
}

/* Where the picture ends and the words begin: a dashed rule in the page grid's
   language (a finer 6 on 4 than the rails' 12 on 6), lighter and still. Both zones stay
   white (Mateo, Sept 22: the grey-blue tint read too dark). */
const SPLIT = "repeating-linear-gradient(90deg, rgba(18,18,21,0.16) 0 6px, transparent 6px 10px)";
const BAND = "linear-gradient(180deg, rgba(61,156,255,0.035), rgba(18,18,21,0.025))";

/* One card: the double border, the picture zone, the words. The outer edge
   and the inner edge turn a little sky when it is pointed at (pointer devices
   only). */
function Card({
  title,
  body,
  picture,
  className,
  index,
}: {
  title: string;
  body: string;
  picture: ReactNode;
  className?: string;
  index: number;
}) {
  return (
    <motion.div
      className={cn(
        "group/card relative flex flex-col border border-(--lp-line) p-[5px] transition-[border-color] duration-200 ease-out",
        // Written out whole: Tailwind only builds classes it can read literally.
        // Hover deepens the hairline in ink, the app's own hover (Mateo, Sept
        // 22: not the sky edge it had). No transform: it would isolate the
        // board photos' multiply and show their white as boxes.
        "[@media(hover:hover)_and_(pointer:fine)]:hover:border-[rgba(18,18,21,0.2)]",
        className,
      )}
      style={{ background: BAND }}
      // Opacity and a small rise only: a filter would leave a stacking context
      // behind and the boards' white would show as boxes.
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay: index * 0.07, ease: EASE }}
    >
      <div
        className={cn(
          // A real border, not an inset shadow: children paint over an inset
          // shadow, so the picture zone lost its inner edge and read wider than
          // the words under it.
          "relative flex h-full flex-col overflow-hidden border border-[rgba(18,18,21,0.08)] bg-white shadow-[0_1px_2px_rgba(18,18,21,0.04)] transition-[border-color,box-shadow] duration-200 ease-out",
          "[@media(hover:hover)_and_(pointer:fine)]:group-hover/card:border-[rgba(18,18,21,0.16)] [@media(hover:hover)_and_(pointer:fine)]:group-hover/card:shadow-[0_1px_2px_rgba(18,18,21,0.05),0_14px_30px_-18px_rgba(18,18,21,0.28)]",
        )}
      >
        <div className="relative min-h-0 flex-1">{picture}</div>
        <div aria-hidden className="mx-5 h-px sm:mx-6" style={{ backgroundImage: SPLIT }} />
        <div className="px-6 pt-4 pb-6 sm:px-7 sm:pb-6">
          <h3 className="m-0 text-[18px] leading-[1.3] font-semibold tracking-[-0.012em] text-(--lp-ink)">{title}</h3>
          <p className="m-0 mt-1.5 max-w-[44ch] text-[15px] leading-[1.5] text-(--lp-ink-2) lg:min-h-[3em]">{body}</p>
        </div>
      </div>
    </motion.div>
  );
}

/* A board photograph fitted to its box, drawn with multiply. They are
   small 2x PNGs, served as they are (the dev image optimizer hung on two). */
function Board({ shot, alt }: { shot: (typeof RANGE)[number]["shot"]; alt: string }) {
  return (
    <Image
      unoptimized
      src={shot.src}
      width={shot.width}
      height={shot.height}
      alt={alt}
      className="absolute inset-0 block h-full w-full object-contain mix-blend-multiply"
    />
  );
}

/* A small label on the picture, top left. */
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-2.5 text-[12.5px] font-medium text-(--lp-ink) shadow-[0_0_0_1px_rgba(18,18,21,0.08),0_1px_2px_rgba(18,18,21,0.06)]">
      {children}
    </span>
  );
}

/* The lesson: the board after each move, the move and four progress segments,
   and the pet beside the line being said, reacting to each move. */
function Lesson({ on, reduce }: { on: boolean; reduce: boolean }) {
  const tick = useTick(on && !reduce, LESSON.length, 3400);
  const n = reduce ? LESSON.length - 1 : tick;
  const beat = LESSON[n];
  return (
    <div className="flex h-full flex-col">
      <div className="relative z-10 flex items-center justify-between p-5 pb-0">
        <Tag>
          <span aria-hidden className="size-1.5 rounded-full bg-(--lp-live)" />
          {beat.move}
        </Tag>
        <span className="flex w-[112px] gap-1" aria-hidden>
          {LESSON.map((b, i) => (
            <span key={b.key} className="h-[3px] flex-1 overflow-hidden rounded-full bg-(--lp-gray-2)">
              <span className="block h-full origin-left rounded-full bg-(--lp-sky) transition-transform duration-300 ease-out" style={{ transform: `scaleX(${i <= n ? 1 : 0})` }} />
            </span>
          ))}
        </span>
      </div>
      <div className="relative mx-6 mt-3 min-h-0 flex-1">
        {LESSON_FRAMES.map((src, i) => (
          <Image
            key={src}
            unoptimized
            src={src}
            width={LESSON_SIZE.width}
            height={LESSON_SIZE.height}
            alt={i === beat.frame ? "The board for 'Which is bigger, 2/3 or 3/4?' after this move." : ""}
            aria-hidden={i !== beat.frame}
            className="absolute inset-0 block h-full w-full object-contain mix-blend-multiply transition-opacity duration-500 ease-out"
            style={{ opacity: i === beat.frame ? 1 : 0 }}
          />
        ))}
      </div>
      <div className="relative flex items-center gap-4 px-5 pb-1">
        <PetSays state={beat.who === "tutor" ? "speaking" : beat.pet} open={false} look={{ x: 0.6, y: 0.2 }} />
        <p className="m-0 line-clamp-3 flex-1 pr-2 text-[15px] leading-[1.5] text-(--lp-ink)" aria-live="polite">
          <span className="mr-1.5 font-semibold text-(--lp-ink-2)">{beat.who === "you" ? "You" : "Chalk"}</span>
          {beat.says}
        </p>
      </div>
    </div>
  );
}

const TOPICS = ["negatives", "area", "ratio", "percent"].map(at);
function Range({ on, reduce }: { on: boolean; reduce: boolean }) {
  const i = useTick(on && !reduce, TOPICS.length, 2600);
  return (
    <div className="flex h-full flex-col">
      <div className="relative z-10 p-5 pb-0">
        <Tag>{TOPICS[i].topic}</Tag>
      </div>
      <div className="relative mx-5 mt-2 mb-6 min-h-0 flex-1">
        {TOPICS.map((m, n) => (
          <div key={m.key} aria-hidden={n !== i} className="absolute inset-0 transition-opacity duration-500 ease-out" style={{ opacity: n === i ? 1 : 0 }}>
            <Board shot={m.shot} alt={m.alt} />
          </div>
        ))}
      </div>
    </div>
  );
}

const LINES = ["What would undo that plus three?", "Close. Multiply by two, or divide?", "Which one has more shaded now?", "Check it yourself. Do you get eleven?"];
function Tutor({ on, reduce }: { on: boolean; reduce: boolean }) {
  const i = useTick(on && !reduce, LINES.length, 3000);
  return (
    <>
      <Band wash={0.3} className="absolute inset-0">
        <div />
      </Band>
      <div className="relative z-[3] flex h-full items-end p-5 pb-3">
        <PetSays state={on && !reduce ? "speaking" : "idle"} text={LINES[reduce ? 0 : i]} side="top" align="start" maxWidth={230} look={{ x: 0.3, y: 0.5 }} />
      </div>
    </>
  );
}

export function Bento() {
  const grid = useRef<HTMLDivElement>(null);
  const on = useInView(grid, { amount: 0.25 });
  const reduce = !!useReduce();

  return (
    <Section>
      <Container>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-end lg:gap-12">
          <Reveal>
            <HowHeading />
          </Reveal>
          <Reveal delay={0.06}>
            <Lede className="lg:ml-auto lg:max-w-[36ch]">
              Say what&rsquo;s confusing, out loud. Chalk draws the idea, marks what matters, and hands the next step back to you.
            </Lede>
          </Reveal>
        </div>
      </Container>

      <div className="lp-railspan mt-12 lg:mt-14">
        <div
          ref={grid}
          // No frame lines (Mateo, Sept 22: "we don't need those lines"); the
          // cards' own corner nodes keep it in the grid's language.
          className="relative grid gap-4 px-4 sm:px-5 lg:grid-cols-12"
        >
          <Card
            index={0}
            title="You talk. It draws."
            body="Say it however it comes out. The board writes itself while it explains."
            className="min-h-[440px] lg:col-span-7 lg:h-[500px]"
            picture={<Lesson on={on} reduce={reduce} />}
          />
          <Card
            index={1}
            title="It marks what matters."
            body="It graphs on Desmos, then highlights the part it's talking about."
            className="min-h-[420px] lg:col-span-5 lg:h-[500px]"
            picture={
              <div className="absolute inset-x-6 top-6 bottom-8">
                <Board shot={at("slope").shot} alt={at("slope").alt} />
              </div>
            }
          />
          <Card
            index={2}
            title="It checks your answer."
            body="You answer on the board. It checks the math, then rings it."
            className="min-h-[380px] lg:col-span-4 lg:h-[410px]"
            picture={
              <div className="absolute inset-x-6 top-6 bottom-8">
                <Board shot={at("solved").shot} alt={at("solved").alt} />
              </div>
            }
          />
          <Card
            index={3}
            title="Any math you bring."
            body="Negatives to algebra. It picks the picture the idea needs."
            className="min-h-[380px] lg:col-span-4 lg:h-[410px]"
            picture={<Range on={on} reduce={reduce} />}
          />
          <Card
            index={4}
            title="Patient, every time."
            body="Hints before answers. It never just hands it over."
            className="min-h-[380px] lg:col-span-4 lg:h-[410px]"
            picture={<Tutor on={on} reduce={reduce} />}
          />
        </div>
      </div>
    </Section>
  );
}
