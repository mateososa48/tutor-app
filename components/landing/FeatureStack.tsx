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
// Below lg the whole device is off: the cards are a plain vertical list with
// the picture above the words, because a 520px card that sticks under a phone's
// viewport is just a card you cannot scroll past.

const CARD_H = 520;
// The floating header's bottom edge (12px off the top, 48px tall). The heading
// sticks just under it, and the cards park just under the heading, wherever
// its height lands (Mateo, Sept 22: keep the title in view while the deck runs).
const HEADER = 60;
// The space between the heading and the cards: 56px (Mateo, Sept 22: "more
// space here, bigger gap"), shrinking toward 32 only on a screen too short to
// hold the heading, the gap and the front card, so the card never runs off
// the bottom of a 1280x800 laptop.
const UNDER_MAX = 56;
const UNDER_MIN = 32;
// Where the first card parks when the heading has not been measured yet.
const TOP_FALLBACK = 236;
// Each card parks this much lower, which is the sliver of the one beneath that
// stays visible, so the pile reads as a pile.
const STEP = 14;
// The cards touch (Mateo, Sept 22: no gaps, "always under each other,
// directly touching"): each one after the first is pulled up by its 1px top
// border so two borders never stack into a 2px line, and a slot is a card less
// that pixel. There is no dwell any more; the next card starts over a parked
// one the moment it arrives, and that is when the parked one starts to sink.
const OVERLAP = 1;
const SLOT = CARD_H - OVERLAP;
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
// Below lg the pieces stack in the picture box; from lg they sit in its corners.
const SCENE = "flex flex-col gap-4 p-5 lg:block lg:h-full lg:p-0";
// The card and its panel are square (Mateo, Sept 21), but the pieces lying on
// the panel keep their corners: they are photographs of the product, not
// structure, and a square photo on a square panel on a square card reads as
// one slab.
const SHADOW = "shadow-[0_14px_36px_rgba(18,18,21,0.16)]";

type SceneProps = { active: boolean };

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

function SceneTutor({ active }: SceneProps) {
  const { fired } = useScene(TUTOR_SCRIPT, active);
  const reduce = useReduce();
  const speaking = fired("say");
  return (
    <div className={SCENE}>
      <BoardShot
        shot={SHOTS.hint}
        width={352}
        shown={fired("board")}
        alt="The board: 2x = 8, the student's try x = 16 in their own hand, and x = 16 crossed out."
        className={cn(SHADOW, "lg:absolute lg:top-7 lg:left-7")}
      />
      <Bubble shown={speaking} className="lg:absolute lg:right-7 lg:bottom-[172px] lg:w-[250px]">
        Close. Two times x is eight. Multiply by two, or divide?
      </Bubble>
      {/* The tutor's pet, the one Mateo had drawn: it speaks when the bubble shows. */}
      <div className="flex justify-end lg:absolute lg:right-7 lg:bottom-5">
        <TutorPet shape="square" state={speaking ? "speaking" : "idle"} level={speaking ? 0.55 : 0} look={{ x: -0.5, y: 0.35 }} size={PET} reduceMotion={!!reduce} />
      </div>
    </div>
  );
}

function SceneDraw({ active }: SceneProps) {
  const { fired } = useScene(DRAW_SCRIPT, active);
  return (
    <div className={SCENE}>
      <BoardShot
        shot={SHOTS.graph}
        width={344}
        shown={fired("graph")}
        alt="The board: a parabola y = x squared minus 4 on Desmos, with its crossings A and B and its vertex C labelled."
        className={cn(SHADOW, "lg:absolute lg:top-6 lg:left-7")}
      />
      <BoardShot
        shot={SHOTS.figure}
        width={220}
        shown={fired("figure")}
        alt="The board: a right triangle drawn to scale, legs 6 and 8, hypotenuse x."
        className={cn(SHADOW, "lg:absolute lg:right-7 lg:bottom-6")}
      />
    </div>
  );
}

function SceneRelate({ active }: SceneProps) {
  const { fired } = useScene(RELATE_SCRIPT, active);
  return (
    <div className={SCENE}>
      <BoardShot
        shot={SHOTS.icons}
        width={416}
        shown={fired("icons")}
        alt="The board: twelve cookies drawn in three groups of four, captioned 12 cookies, 3 friends."
        className={cn(SHADOW, "lg:absolute lg:top-7 lg:left-7")}
      />
      <BoardShot
        shot={SHOTS.fraction}
        width={320}
        shown={fired("fraction")}
        alt="The board: two pies, three quarters and six eighths, captioned the same amount."
        className={cn(SHADOW, "lg:absolute lg:right-7 lg:bottom-7")}
      />
    </div>
  );
}

function SceneWorksheet({ active }: SceneProps) {
  const { fired } = useScene(WORKSHEET_SCRIPT, active);
  return (
    <div className={SCENE}>
      {/* The page as it came in: a photo of the worksheet, a little crooked. */}
      <motion.div
        initial={false}
        animate={rise(fired("page"))}
        transition={T}
        className={cn("w-[250px] overflow-hidden rounded-[8px] bg-white ring-1 ring-(--lp-line) lg:absolute lg:top-7 lg:left-8 lg:-rotate-[3deg]", SHADOW)}
      >
        <Image
          src="/landing/worksheet-page.png"
          width={1600}
          height={2002}
          alt="A worksheet titled 8th Grade Math, Equations and Linear Graphs, with equations to solve and four blank coordinate grids."
          sizes="250px"
          className="block h-auto w-full"
        />
      </motion.div>
      <BoardShot
        shot={SHOTS.worksheet}
        width={396}
        shown={fired("board")}
        alt="The board: Problem 5, y = 2x + 1 from the worksheet, graphed on Desmos with its intercept marked."
        className={cn(SHADOW, "lg:absolute lg:right-6 lg:bottom-6")}
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
}: {
  feature: Feature;
  index: number;
  last: boolean;
  scrollY: MotionValue<number>;
  deckTop: number;
  top: number;
  stacked: boolean;
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
  const parked = deckTop + index * SLOT - (top + index * STEP);
  const touched = parked;
  const covered = parked + SLOT - STEP;
  const sinking = stacked && !reduce && !last && deckTop > 0;
  // The last card has nothing behind it and never sinks, but the transforms
  // below still need a range: an empty one throws inside Motion.
  const behind = Math.max(1, FEATURES.length - 1 - index);
  const at: number[] = [];
  const scales: number[] = [];
  const dims: number[] = [];
  for (let k = 0; k < behind; k++) {
    at.push(touched + k * SLOT, covered + k * SLOT);
    scales.push(1 - k * SINK, 1 - (k + 1) * SINK);
    dims.push(DIMS[k], DIMS[k + 1]);
  }
  const scale = useTransform(scrollY, at, scales, { clamp: true });
  const dim = useTransform(scrollY, at, dims, { clamp: true });
  // The card's own left and right edges, which it only needs once it has left
  // the rails: in over the first step back, then held while it goes deeper.
  const edge = useTransform(scrollY, [touched, covered], [0, 1], { clamp: true });

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
    <div className={cn(stacked && !last && "lg:sticky")} style={stacked ? { top: top + index * STEP, marginTop: index > 0 ? -OVERLAP : 0 } : undefined}>
      {/* The sized box, so the haze below covers the card and nothing else: it
          used to be a full-width sibling and washed over the left rail, which
          paints under this content while the right rail paints over it. */}
      <motion.div style={sinking ? { scale, transformOrigin: "50% 0%" } : undefined} className="lp-railspan relative">
        <article ref={ref} data-last={last || undefined} className="lp-deck-card grid overflow-hidden lg:h-[520px] lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
          <div className="lp-deck-copy order-2 flex flex-col justify-center gap-6 lg:order-1">
            {/* The card's mark: a line icon from the Math Only wall's own family
                (Hugeicons Stroke Rounded) in that wall's blue, replacing the
                Fluent emoji (Mateo, Sept 22). 48px at a 1.5 stroke: at 64px and
                1.75 it read too big and too heavy. */}
            <svg
              viewBox="0 0 24 24"
              width={48}
              height={48}
              aria-hidden
              className="-ml-0.5 text-[#2f8ef7] [&_*]:[stroke-width:1.5]"
              dangerouslySetInnerHTML={{ __html: DECK_ICONS[feature.icon] }}
            />
            <div>
              <h3 className="lp-title m-0 max-w-[16ch] text-[clamp(1.5rem,2.4vw,2rem)] leading-[1.1] text-(--lp-ink)">{feature.title}</h3>
              <p className="mt-3.5 max-w-[38ch] text-[15.5px] leading-[1.6] text-(--lp-ink-2) sm:text-[16.5px]">{feature.body}</p>
            </div>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
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
          <div className="order-1 m-3 lg:order-2 lg:my-3 lg:mr-3 lg:ml-0">
            <Dither hue={feature.hue} active={inView}>
              <Scene active={inView} />
            </Dither>
          </div>
        </article>
        {/* Before the haze, so the edge recedes with everything else. */}
        {sinking && <motion.div aria-hidden style={{ opacity: edge }} className="lp-deck-edge" />}
        {/* The card being covered hazes toward the page rather than darkening:
            distance washes things out, it does not turn them grey. */}
        {sinking && <motion.div aria-hidden style={{ opacity: dim }} className="pointer-events-none absolute inset-0 bg-(--lp-bg)" />}
      </motion.div>
    </div>
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
  const stacked = useAtLeastLg();
  const { scrollY } = useScroll();
  const vh = useViewportHeight();
  // What is left under the front card (the fourth parks three steps lower),
  // keeping 8px of air above the screen's edge.
  const room = vh - (HEADER + headH + CARD_H + (FEATURES.length - 1) * STEP + 8);
  const under = Math.max(UNDER_MIN, Math.min(UNDER_MAX, room));
  const top = headH ? HEADER + headH + under : TOP_FALLBACK;
  const deckTop = useDeckTop(deckRef, `${headH}:${under}`);
  // The scroll at which the last card's top reaches the first card's spot:
  // from there the whole pile moves as one, and the heading leaves with it,
  // 1:1 with the scroll, holding the same gap. Left pinned until the section
  // ended, it let the pile slide under it and show above and around it (the
  // bug Mateo caught on Sept 22). Released when the last card merely arrived
  // (42px earlier), it pulled away from the three still-parked cards first.
  const lastIndex = FEATURES.length - 1;
  const release = deckTop + lastIndex * SLOT - top;
  const lift = useTransform(scrollY, (y) => (deckTop > 0 ? -Math.max(0, y - release) : 0));

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
        className={cn("relative z-30 mx-auto bg-(--lp-bg) min-[1320px]:w-[calc(2*var(--lp-rail-inset)-2*var(--lp-rail-w))]", stacked && "lg:sticky lg:pt-4 lg:pb-2")}
        style={stacked ? { top: HEADER, y: lift } : undefined}
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
      <div className="mt-12 lg:mt-0" style={stacked ? { marginTop: under } : undefined}>
        <div ref={deckRef} className="flex flex-col" style={{ gap: stacked ? 0 : 32 }}>
          {FEATURES.map((feature, i) => (
            <Card key={feature.id} feature={feature} index={i} last={i === FEATURES.length - 1} scrollY={scrollY} deckTop={deckTop} top={top} stacked={stacked} />
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
