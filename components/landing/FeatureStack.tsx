"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import { motion, useInView, useScroll, useTransform, type MotionValue } from "motion/react";
import { Check } from "lucide-react";
import { TutorPet } from "@/components/board/TutorPet";
import { cn } from "@/lib/utils";
import { DitherWave } from "./DitherWave";
import { BoardShot, T, rise } from "./Fragments";
import { DECK_ICONS } from "./deck-icons.generated";
import { Container, Label, Lede, Reveal, Section, Title } from "./Section";
import { SHOTS } from "./shots.generated";
import { SWIRL } from "./swirl";
import { useReduce, useScript } from "./useScript";

// Four things a session does, as a deck that builds itself (Sept 20), each
// card laid out after Mateo's own mockup (Sept 21): one of the board's Fluent
// icons, the title, a line, three checks on the left; on the right a panel of
// the hero's dither in that card's own colour, moving very slowly, holding
// real pieces of the product.
//
// A card is a ROW OF THE PAGE'S GRID, not a card floating on it: it runs from
// one dashed rail to the other, so the rails are its left and right edges, and
// it draws only its own top and bottom, in the rails' ink, solid (`.lp-railspan`
// and `.lp-deck-card` in globals.css). That is what the sink is now measured
// against. Each card sticks 14px lower than the one before, so as you scroll
// the next card rises over the last; the covered one goes BACK, shrinking away
// from the rails by the same 14px a step that it rises by, so the recession is
// even on all four sides and reads as one move into the screen. The rails stay
// where they are, being the window, and the cards behind the front one are
// visibly behind it.
//
// A phone stacks too (Oct 14 2026, Mateo: the overlapping cards on mobile as
// well). Its cards are sized to the screen (PHONE_*), the picture above the
// words and the checks left off, so a parked card always fits under the bar.

const CARD_H = 520;
// The floating header's bottom edge (12px off the top, 48px tall). The heading
// sticks just under it, and the cards park just under the heading, wherever
// its height lands (Mateo, Sept 22: keep the title in view while the deck runs).
const HEADER = 60;
// The space between the heading and the cards: 24px (56 on Sept 22 after
// "more space here, bigger gap", then 40 and 24 on Sept 23 when the cards sat
// "a bit too low on the screen", twice). The floor matches it now; the rule
// that shrank it on short screens stays in case it is raised again. It shrank toward 32 only on a screen too short to
// hold the heading, the gap and the front card, so the card never runs off
// the bottom of a 1280x800 laptop.
const UNDER_MAX = 24;
const UNDER_MIN = 24;
// Where the first card parks when the heading has not been measured yet.
const TOP_FALLBACK = 236;
// Each card parks this much lower, which is the sliver of the one beneath that
// stays visible, so the pile reads as a pile.
const STEP = 14;
// The cards touch (Mateo, Sept 22: no gaps, "always under each other,
// directly touching"): each one after the first is pulled up by its 1px top
// border so two borders never stack into a 2px line, and a slot is a card less
// that pixel.
const OVERLAP = 1;
// The pause between cards (Mateo, Sept 23: "a bit of scroll lag between each
// card"): a parked card stays uncovered for this much scroll before the next
// one starts over it. The pause needs that distance in the page's flow, so it
// is the deck's flex gap; but a visible gap is what he asked to be rid of on
// Sept 22, so each card below is held up against the one above it (`hold`)
// until its pause is used up, and no gap is ever seen.
const DWELL = 240;
const SLOT = CARD_H - OVERLAP + DWELL;
// Smoothing (Mateo, Sept 23: "make it a bit smoother"). Held still for the
// first half of the pause, the waiting card picks up speed over EASE_IN px of
// scroll either side of the pause's end, instead of going from still to full
// speed in one frame; and every card after the first slows over its last LAND
// px and settles onto the pile at zero speed, instead of stopping dead. Neither
// changes how much scroll the deck takes, and neither can open a gap.
const EASE_IN = 120;
const LAND = 200;

/* How much of a gap has been paid out, s px of scroll into the pause. The
   rate goes from 1 (the card below held still) to 0 (moving with the page) as
   a smoothstep over [DWELL - EASE_IN, DWELL + EASE_IN]; that ramp's average is
   one half, so the total still comes to exactly DWELL. */
function payout(s: number) {
  const a = DWELL - EASE_IN;
  if (s <= 0) return 0;
  if (s <= a) return s;
  const x = Math.min(s - a, 2 * EASE_IN);
  const u = x / (2 * EASE_IN);
  return a + x - 2 * EASE_IN * (u * u * u - 0.5 * u * u * u * u);
}

/* Where a landing card is drawn, given d px left to its spot: a cubic from 0
   with no slope (at rest) to d at d = LAND with slope 1 (full speed), so it
   meets the page's own motion without a kink. */
function landing(d: number) {
  if (d >= LAND) return d;
  if (d <= 0) return 0;
  return (2 * d * d) / LAND - (d * d * d) / (LAND * LAND);
}
// How much smaller a card gets for each card that lands on it. 0.022 of a
// 1270px card is 14px off each side, the same as STEP, so a card that has gone
// one step back has moved the same distance on every edge: the recession is
// isotropic and reads as a straight move away from the reader. There is no
// rotateX any more. It was invisible (all you see of a sunk card is the 14px
// strip at its top, which is exactly where a tilt about the top edge moves
// nothing) and it made the new 1px borders shimmer on a sub-pixel angle.
const SINK = 0.022;
// How far each depth hazes toward the page. What the eye actually follows is
// the ladder of top borders, so this is mostly a fade on those lines.
const DIMS = [0, 0.45, 0.65, 0.78];

// Where the deck's numbers differ between a laptop and a phone.
type Geo = { cardH: number; step: number; sink: number; slot: number };
const LAPTOP: Geo = { cardH: CARD_H, step: STEP, sink: SINK, slot: SLOT };
// A phone: the cards park 12px under the floating bar, 10px apart, and go back
// by 10px a side each step (0.055 of a 360px card). The card is as tall as the
// screen allows under the bar and the three steps, between 520 and 600px; its
// panel is PHONE_PANEL of that.
const PHONE_TOP = HEADER + 12;
const PHONE_STEP = 10;
const PHONE_PANEL = 320;
function phoneGeo(vh: number): Geo {
  const cardH = Math.round(Math.min(600, Math.max(520, vh - PHONE_TOP - 3 * PHONE_STEP - 16)));
  return { cardH, step: PHONE_STEP, sink: 0.055, slot: cardH - OVERLAP + DWELL };
}

/* ── The dither, in four colours ────────────────────────────────────────── */

type RGB = [number, number, number];
type Hue = "sky" | "violet" | "green" | "amber";

// The hero's blue, then the tutor's other pens paled the same way: a light
// tone the field is mostly made of, a deeper one for the troughs, and a
// near-white the wash sits on.
const HUES: Record<Hue, { wave: RGB; deep: RGB; bg: RGB }> = {
  sky: { wave: [...SWIRL.waveColor] as RGB, deep: [...SWIRL.deepColor] as RGB, bg: [...SWIRL.backgroundColor] as RGB },
  violet: { wave: [0.8, 0.72, 0.98], deep: [0.6, 0.48, 0.92], bg: [0.975, 0.965, 0.995] },
  green: { wave: [0.7, 0.9, 0.78], deep: [0.3, 0.74, 0.52], bg: [0.965, 0.985, 0.972] },
  amber: { wave: [1, 0.86, 0.68], deep: [0.97, 0.66, 0.3], bg: [0.995, 0.975, 0.945] },
};

function Dither({ hue, active, children }: { hue: Hue; active: boolean; children: ReactNode }) {
  const reduce = useReduce();
  const h = HUES[hue];
  return (
    <div className="relative isolate h-full overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10">
        <DitherWave
          pattern="swirl"
          waveColor={h.wave}
          deepColor={h.deep}
          backgroundColor={h.bg}
          colorNum={SWIRL.colorNum}
          pixelSize={SWIRL.pixelSize}
          waveFrequency={SWIRL.waveFrequency}
          waveAmplitude={SWIRL.waveAmplitude}
          // A third of the hero's pace: Mateo asked for really slow.
          waveSpeed={0.012}
          lightness={0.06}
          animate={!reduce && active}
        />
        <div className="absolute inset-0 bg-(--lp-bg) opacity-15" />
      </div>
      {children}
    </div>
  );
}

/* ── Scenes ─────────────────────────────────────────────────────────────── */

// Module constants: useScript restarts its clock when its steps array changes,
// so an array built inside a component would never finish.
const TUTOR_SCRIPT = [
  { at: 0, key: "board" },
  { at: 2200, key: "say" },
] as const;
const DRAW_SCRIPT = [
  { at: 0, key: "graph" },
  { at: 1800, key: "figure" },
] as const;
const RELATE_SCRIPT = [
  { at: 0, key: "icons" },
  { at: 1800, key: "fraction" },
] as const;
const WORKSHEET_SCRIPT = [
  { at: 0, key: "page" },
  { at: 1800, key: "board" },
] as const;

// Each scene plays once as its card comes into view and holds: a loop would
// blank the second board every nine seconds while the card is being read.
const LOOP = 0;
// The pieces sit in the panel's corners, overlapping a little: on a phone too
// (Oct 14 2026), at about two thirds of their size, so the deck can stack there.
const SCENE = "relative h-full";
// The card and its panel are square (Mateo, Sept 21), but the pieces lying on
// the panel keep their corners: they are photographs of the product, not
// structure, and a square photo on a square panel on a square card reads as
// one slab.
const SHADOW = "shadow-[0_14px_36px_rgba(18,18,21,0.16)]";

type SceneProps = { active: boolean; compact: boolean };
// A piece's width on a phone.
const small = (w: number, compact: boolean) => (compact ? Math.round(w * 0.62) : w);

function useScene<K extends string>(steps: readonly { at: number; key: K }[], active: boolean) {
  const reduce = useReduce();
  return useScript(steps, LOOP, active, reduce);
}

/* What the tutor says, with a tail toward whoever is saying it. */
function Bubble({ shown, className, children }: { shown: boolean; className?: string; children: ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={rise(shown)}
      transition={T}
      className={cn("relative rounded-[14px] border border-(--lp-line-strong) bg-white px-4 py-3 text-[13.5px] leading-[1.5] text-(--lp-ink)", SHADOW, className)}
    >
      {children}
      <span aria-hidden className="absolute right-12 -bottom-[7px] size-3.5 rotate-45 border-r border-b border-(--lp-line-strong) bg-white" />
    </motion.div>
  );
}

// Mateo asked for the 120px pet, or bigger.
const PET = 132;

function SceneTutor({ active, compact }: SceneProps) {
  const { fired } = useScene(TUTOR_SCRIPT, active);
  const reduce = useReduce();
  const speaking = fired("say");
  return (
    <div className={SCENE}>
      <BoardShot
        shot={SHOTS.hint}
        width={small(352, compact)}
        shown={fired("board")}
        alt="The board: 2x = 8, the student's try x = 16 in their own hand, and x = 16 crossed out."
        className={cn(SHADOW, "absolute top-4 left-4 lg:top-7 lg:left-7")}
      />
      <Bubble shown={speaking} className="absolute right-3 bottom-[88px] w-[200px] px-3.5 py-2.5 text-[12.5px] lg:right-7 lg:bottom-[172px] lg:w-[250px] lg:px-4 lg:py-3 lg:text-[13.5px]">
        Close. Two times x is eight. Multiply by two, or divide?
      </Bubble>
      {/* The tutor's pet, the one Mateo had drawn: it speaks when the bubble shows. */}
      <div className="absolute right-3 bottom-1 lg:right-7 lg:bottom-5">
        <TutorPet shape="square" state={speaking ? "speaking" : "idle"} level={speaking ? 0.55 : 0} look={{ x: -0.5, y: 0.35 }} size={compact ? 92 : PET} reduceMotion={!!reduce} />
      </div>
    </div>
  );
}

function SceneDraw({ active, compact }: SceneProps) {
  const { fired } = useScene(DRAW_SCRIPT, active);
  return (
    <div className={SCENE}>
      <BoardShot
        shot={SHOTS.graph}
        width={small(344, compact)}
        shown={fired("graph")}
        alt="The board: a parabola y = x squared minus 4 on Desmos, with its crossings A and B and its vertex C labelled."
        className={cn(SHADOW, "absolute top-4 left-4 lg:top-6 lg:left-7")}
      />
      <BoardShot
        shot={SHOTS.figure}
        width={small(220, compact)}
        shown={fired("figure")}
        alt="The board: a right triangle drawn to scale, legs 6 and 8, hypotenuse x."
        className={cn(SHADOW, "absolute right-4 bottom-4 lg:right-7 lg:bottom-6")}
      />
    </div>
  );
}

function SceneRelate({ active, compact }: SceneProps) {
  const { fired } = useScene(RELATE_SCRIPT, active);
  return (
    <div className={SCENE}>
      <BoardShot
        shot={SHOTS.icons}
        width={small(416, compact)}
        shown={fired("icons")}
        alt="The board: twelve cookies drawn in three groups of four, captioned 12 cookies, 3 friends."
        className={cn(SHADOW, "absolute top-4 left-4 lg:top-7 lg:left-7")}
      />
      <BoardShot
        shot={SHOTS.fraction}
        width={small(320, compact)}
        shown={fired("fraction")}
        alt="The board: two pies, three quarters and six eighths, captioned the same amount."
        className={cn(SHADOW, "absolute right-4 bottom-4 lg:right-7 lg:bottom-7")}
      />
    </div>
  );
}

function SceneWorksheet({ active, compact }: SceneProps) {
  const { fired } = useScene(WORKSHEET_SCRIPT, active);
  return (
    <div className={SCENE}>
      {/* The page as it came in: a photo of the worksheet, a little crooked. */}
      <motion.div
        initial={false}
        animate={rise(fired("page"))}
        transition={T}
        className={cn("absolute top-4 left-5 w-[150px] -rotate-[3deg] overflow-hidden rounded-[8px] bg-white ring-1 ring-(--lp-line) lg:top-7 lg:left-8 lg:w-[250px]", SHADOW)}
      >
        <Image
          src="/landing/worksheet-page.png"
          width={1600}
          height={2002}
          alt="A worksheet titled 8th Grade Math, Equations and Linear Graphs, with equations to solve and four blank coordinate grids."
          sizes="(min-width: 1024px) 250px, 150px"
          className="block h-auto w-full"
        />
      </motion.div>
      <BoardShot
        shot={SHOTS.worksheet}
        width={small(396, compact)}
        shown={fired("board")}
        alt="The board: Problem 5, y = 2x + 1 from the worksheet, graphed on Desmos with its intercept marked."
        className={cn(SHADOW, "absolute right-4 bottom-4 lg:right-6 lg:bottom-6")}
      />
    </div>
  );
}

/* ── The four ───────────────────────────────────────────────────────────── */

type Feature = {
  id: string;
  icon: keyof typeof DECK_ICONS;
  title: string;
  body: string;
  points: string[];
  hue: Hue;
  Scene: (props: SceneProps) => ReactNode;
};

const FEATURES: Feature[] = [
  {
    id: "tutor",
    icon: "tutor",
    title: "Like a professional tutor",
    body: "It asks what you tried before it helps, gives the smallest hint that gets you moving, and checks your answer with real math.",
    points: ["Hints before answers", "Checks every answer", "Never just gives it away"],
    hue: "sky",
    Scene: SceneTutor,
  },
  {
    id: "draw",
    icon: "draw",
    title: "It draws the idea",
    body: "Graphs, shapes and number lines go on the board as it explains, drawn to scale, so you can see what the numbers mean.",
    points: ["Real graphs on Desmos", "Shapes drawn to scale", "Fractions and number lines"],
    hue: "violet",
    Scene: SceneDraw,
  },
  {
    id: "relate",
    icon: "relate",
    title: "Explains it your way",
    body: "Stuck on the abstract version? It reaches for cookies, pizzas and pictures, and tries another way until it clicks.",
    points: ["Everyday things you can count", "Pictures before formulas", "A second way if the first didn't land"],
    hue: "green",
    Scene: SceneRelate,
  },
  {
    id: "worksheet",
    icon: "worksheet",
    title: "Reads your worksheet",
    body: "Snap a photo or a PDF. It reads the page, asks which problem you want, and puts that one on the board as printed.",
    points: ["Photos and PDFs, up to six pages", "Asks which problem you mean", "Copies it onto the board exactly"],
    hue: "amber",
    Scene: SceneWorksheet,
  },
];

/* ── The deck ───────────────────────────────────────────────────────────── */

function useAtLeastLg() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
}

/* Where the deck starts in the document. The cards are `sticky`, so their own
   rects report the parked position rather than the one in flow; the container
   is not sticky, so it is the honest thing to measure. */
function useDeckTop(ref: React.RefObject<HTMLDivElement | null>, layoutKey: unknown) {
  const [top, setTop] = useState(0);
  // `layoutKey` re-measures when the space above the deck changes (the
  // heading's height, the gap under it). A resize of the page did not always
  // report it: on a short screen the gap shrank by 17px, the deck moved up with
  // it, and the stale number made the heading leave 17px late.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setTop(el.getBoundingClientRect().top + window.scrollY);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [ref, layoutKey]);
  return top;
}

function Card({
  feature,
  index,
  last,
  scrollY,
  deckTop,
  top,
  stacked,
  geo,
  compact,
}: {
  feature: Feature;
  index: number;
  last: boolean;
  scrollY: MotionValue<number>;
  deckTop: number;
  top: number;
  stacked: boolean;
  geo: Geo;
  compact: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px" });
  const reduce = useReduce();
  const { Scene } = feature;

  // The scroll where this card parks, where the next one first overlaps it
  // (after the dwell), and where the next one has covered it. All known from
  // the slot size, so nothing has to measure a parked element. The sink runs
  // only between the last two: a card must not fade while it is the one being
  // read, which it did when the sink started at parking. And it goes on: each
  // later card that lands pushes this one a step further back, so the pile
  // fans, the deepest card smallest, instead of three strips the same width.
  const { slot, step, sink } = geo;
  const parked = deckTop + index * slot - (top + index * step);
  const touched = parked + DWELL - EASE_IN;
  const covered = parked + slot - step;
  const sinking = stacked && !reduce && !last && deckTop > 0;
  // The last card has nothing behind it and never sinks, but the transforms
  // below still need a range: an empty one throws inside Motion.
  const behind = Math.max(1, FEATURES.length - 1 - index);
  const at: number[] = [];
  const scales: number[] = [];
  const dims: number[] = [];
  for (let k = 0; k < behind; k++) {
    at.push(touched + k * slot, covered + k * slot);
    scales.push(1 - k * sink, 1 - (k + 1) * sink);
    dims.push(DIMS[k], DIMS[k + 1]);
  }
  const scale = useTransform(scrollY, at, scales, { clamp: true });
  const dim = useTransform(scrollY, at, dims, { clamp: true });
  // The card's own left and right edges, which it only needs once it has left
  // the rails: in over the first step back, then held while it goes deeper.
  const edge = useTransform(scrollY, [touched, covered], [0, 1], { clamp: true });
  // How far this card is held up against the one above it. Every gap above it
  // (one per card before it) is taken back while the card that opens that gap
  // is still moving, and paid out one pixel per pixel of scroll during that
  // card's pause, so the cards look attached until it is this one's turn. It is
  // zero by the time this card parks: every pause above it ends before that.
  const hold = useTransform(scrollY, (y) => {
    if (!stacked || index === 0) return 0;
    if (deckTop <= 0) return -index * DWELL;
    let lift = 0;
    for (let i = 1; i <= index; i++) {
      const openedBy = deckTop + (i - 1) * slot - (top + (i - 1) * step);
      lift += DWELL - payout(y - openedBy);
    }
    // The soft landing, for every card that parks on the pile (the last card
    // never parks: it carries the pile away at full speed). A card waiting
    // below a landing card is still pressed against it, so it rides the same
    // ease, or a sliver of page would show between them (up to 29px, measured
    // before this sum included the cards above).
    let land = 0;
    for (let j = 1; j <= index; j++) {
      if (j === FEATURES.length - 1) continue;
      const d = deckTop + j * slot - y - (top + j * step);
      land += landing(d) - Math.max(0, d);
    }
    return -lift + land;
  });

  // The last card never sticks. The deck ends on its bottom edge, so there is
  // nothing below it to stick against, and it should carry the finished pile up
  // and off the screen rather than park. As it rises, each card behind it is
  // released at exactly the moment its top edge reaches it, so the four
  // converge on one position and the stack leaves as a single card.
  //
  // That convergence is why the gap between cards is the deck's flex `gap` and
  // NOT a bottom margin on this wrapper. Sticky keeps an element's MARGIN box
  // inside its container, so a 160px bottom margin released every card 160px
  // early: the whole pile was dragged off the top before the last card had
  // even parked, leaving a band of half-faded cards above it.
  return (
    <motion.div className={cn(stacked && !last && "sticky")} style={stacked ? { top: top + index * step, marginTop: index > 0 ? -OVERLAP : 0, y: hold } : undefined}>
      {/* The sized box, so the haze below covers the card and nothing else: it
          used to be a full-width sibling and washed over the left rail, which
          paints under this content while the right rail paints over it. */}
      <motion.div style={sinking ? { scale, transformOrigin: "50% 0%" } : undefined} className="lp-railspan relative">
        <article
          ref={ref}
          data-last={last || undefined}
          style={{ height: geo.cardH, gridTemplateRows: compact ? `${PHONE_PANEL}px minmax(0,1fr)` : undefined }}
          className="lp-deck-card grid overflow-hidden lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]"
        >
          <div className="lp-deck-copy order-2 flex flex-col justify-start gap-4 !pt-6 lg:order-1 lg:justify-center lg:gap-6 lg:!pt-10">
            {/* The card's mark: a line icon from the Math Only wall's own family
                (Hugeicons Stroke Rounded) in that wall's blue, replacing the
                Fluent emoji (Mateo, Sept 22). 48px at a 1.5 stroke: at 64px and
                1.75 it read too big and too heavy. */}
            <svg
              viewBox="0 0 24 24"
              width={compact ? 36 : 48}
              height={compact ? 36 : 48}
              aria-hidden
              className="-ml-0.5 shrink-0 text-[#2f8ef7] [&_*]:[stroke-width:1.5]"
              dangerouslySetInnerHTML={{ __html: DECK_ICONS[feature.icon] }}
            />
            <div>
              <h3 className="lp-title m-0 max-w-[16ch] text-[clamp(1.5rem,2.4vw,2rem)] leading-[1.1] text-(--lp-ink)">{feature.title}</h3>
              <p className="mt-3.5 max-w-[38ch] text-[15.5px] leading-[1.6] text-(--lp-ink-2) sm:text-[16.5px]">{feature.body}</p>
            </div>
            <ul className="m-0 hidden list-none flex-col gap-3 p-0 lg:flex">
              {feature.points.map((point) => (
                <li key={point} className="flex items-center gap-3 text-[15px] leading-[1.4] text-(--lp-ink)">
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-(--lp-sky) text-white">
                    <Check size={11} strokeWidth={3.2} aria-hidden />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          {/* A window inside the card, not a half of it: the card's own white
              runs between the panel and every card edge it meets (Mateo,
              Sept 22). No left margin from lg, where that edge is the seam with
              the copy column rather than an edge of the card. */}
          <div className="order-1 m-3 mb-0 min-h-0 lg:order-2 lg:my-3 lg:mr-3 lg:ml-0">
            <Dither hue={feature.hue} active={inView}>
              <Scene active={inView} compact={compact} />
            </Dither>
          </div>
        </article>
        {/* Before the haze, so the edge recedes with everything else. */}
        {sinking && <motion.div aria-hidden style={{ opacity: edge }} className="lp-deck-edge" />}
        {/* The card being covered hazes toward the page rather than darkening:
            distance washes things out, it does not turn them grey. */}
        {sinking && <motion.div aria-hidden style={{ opacity: dim }} className="pointer-events-none absolute inset-0 bg-(--lp-bg)" />}
      </motion.div>
    </motion.div>
  );
}

/* The heading's height, so the cards can park right under it. */
function useViewportHeight() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("resize", cb);
      return () => window.removeEventListener("resize", cb);
    },
    () => window.innerHeight,
    () => 900,
  );
}

function useHeight(ref: React.RefObject<HTMLDivElement | null>) {
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setH(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return h;
}

export function FeatureStack() {
  const deckRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const headH = useHeight(headRef);
  const wide = useAtLeastLg();
  const stacked = true;
  const { scrollY } = useScroll();
  const vh = useViewportHeight();
  const geo = wide ? LAPTOP : phoneGeo(vh);
  // What is left under the front card (the fourth parks three steps lower),
  // keeping 8px of air above the screen's edge.
  const room = vh - (HEADER + headH + CARD_H + (FEATURES.length - 1) * STEP + 8);
  const under = Math.max(UNDER_MIN, Math.min(UNDER_MAX, room));
  // A laptop parks the cards under the pinned heading; a phone, whose heading
  // scrolls away, just under the bar.
  const top = !wide ? PHONE_TOP : headH ? HEADER + headH + under : TOP_FALLBACK;
  const deckTop = useDeckTop(deckRef, `${headH}:${under}`);
  // The scroll at which the last card's top reaches the first card's spot:
  // from there the whole pile moves as one, and the heading leaves with it,
  // 1:1 with the scroll, holding the same gap. Left pinned until the section
  // ended, it let the pile slide under it and show above and around it (the
  // bug Mateo caught on Sept 22). Released when the last card merely arrived
  // (42px earlier), it pulled away from the three still-parked cards first.
  const lastIndex = FEATURES.length - 1;
  const release = deckTop + lastIndex * geo.slot - top;
  const lift = useTransform(scrollY, (y) => (wide && deckTop > 0 ? -Math.max(0, y - release) : 0));

  // No bottom padding on the section: it ends on the last card's bottom edge,
  // so the next section's dashed rule is drawn exactly there.
  return (
    <Section id="capabilities" className="pb-0 sm:pb-0">
      {/* The heading stays in view while the deck runs (Mateo, Sept 22). From
          lg it sticks under the floating header, above the cards, on the page's
          own colour so the pile can pass under it on its way out; it is only
          as wide as the gap between the rails, so the rails stay visible. Title
          left and lede right, like the bento's, so it takes one line of display
          type and leaves the cards room on a laptop screen. */}
      <motion.div
        ref={headRef}
        className={cn("relative z-30 mx-auto bg-(--lp-bg) min-[1320px]:w-[calc(2*var(--lp-rail-inset)-2*var(--lp-rail-w))]", wide && "lg:sticky lg:pt-2 lg:pb-0")}
        style={wide ? { top: HEADER, y: lift } : undefined}
      >
        <Container>
          <Reveal>
            {/* The lede's column is capped so the title keeps one line at every
                lg width: it wrapped "does." onto a second line in a 3:2 split,
                and a taller pinned heading costs the cards their room. */}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] lg:items-end lg:gap-12">
              <div>
                <Label>What it does</Label>
                <Title className="lg:whitespace-nowrap">Everything else a session does.</Title>
              </div>
              <Lede className="mt-0 lg:ml-auto">What happens around the board, and what carries over to next week.</Lede>
            </div>
          </Reveal>
        </Container>
      </motion.div>
      {/* Full width, not a Container: each card sizes itself to the rails.
          The same space as the cards park under the heading (`under`), so the first card reaches its
          parking spot at the moment the heading sticks and no gap opens. */}
      <div className="mt-10 lg:mt-0" style={wide ? { marginTop: under } : undefined}>
        <div ref={deckRef} className="flex flex-col" style={{ gap: stacked ? DWELL : 32 }}>
          {FEATURES.map((feature, i) => (
            <Card key={feature.id} feature={feature} index={i} last={i === FEATURES.length - 1} scrollY={scrollY} deckTop={deckTop} top={top} stacked={stacked} geo={geo} compact={!wide} />
          ))}
          {/* There used to be a spacer here, giving the last card a dwell at the
              top of the pile. It is gone on purpose: it is the only thing that
              can sit between the last card's bottom and the next section's
              rule, and the card's bottom has to BE that rule. The margin that
              made a spacer necessary in the first place is still handled, by
              the last card carrying `marginBottom: 0` rather than GAP. */}
        </div>
      </div>
    </Section>
  );
}
