"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { motion, useAnimationFrame, useMotionValue } from "motion/react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { REVIEWS_DEFAULT, useReviewsLook, type ReviewsLook } from "./ReviewsTuner";
import { Container, Label, Lede, Reveal, Section, Title } from "./Section";
import { useReduce } from "./useScript";
import { cornerTicks, rgba } from "./useTuner";

// What students and parents say, as a wall that keeps moving: three columns
// of cards drifting vertically at their own speeds, the middle one against
// the others, fading out into the page at the top and bottom. Each card is
// five stars, a short quote with the tutor's sky highlighter on the words
// that matter, and who said it. Hovering a column stops it so it can be read.
//
// Every visual choice comes from `ReviewsLook` (ReviewsTuner.tsx), which Mateo
// can change live with Shift+R or a double-click on the wall: the layout
// (drifting columns, sideways rows, or a still grid), the card, its corners,
// the type, the quote marks, the highlighter, the stars and the avatars.
//
// PLACEHOLDER QUOTES (Sept 20 2026, still placeholders Sept 21). Every quote
// below was written to design the section and none of these people exist,
// and the five stars on each card are a rating claim on top of that. Not one
// may ship: fake testimonials are illegal in the US (the FTC's 2024 rule on
// reviews and testimonials, 16 CFR Part 465), and the brand is "built by a
// student for his sister". Replace them with real, permissioned quotes from
// beta families (Mateo's sister counts), then delete this note.

type Quote = { text: ReactNode; name: string; who: string };

// The look, for the pieces deep in a card (the highlighter inside each quote
// is written into the quote itself, so it cannot take it as a prop).
const Look = createContext<ReviewsLook>(REVIEWS_DEFAULT);

/* The words that matter, marked the way the tuner says: the board's sky
   highlighter by default. */
function Mark({ children }: { children: ReactNode }) {
  const l = useContext(Look);
  if (l.highlight === "none") return <>{children}</>;
  if (l.highlight === "bold") return <strong className="font-semibold">{children}</strong>;
  if (l.highlight === "ink") return <span style={{ color: l.highlightColor }}>{children}</span>;
  if (l.highlight === "underline")
    return (
      <span className="underline decoration-2 underline-offset-[3px]" style={{ textDecorationColor: l.highlightColor }}>
        {children}
      </span>
    );
  return (
    <mark className="rounded-[3px] px-[2px] text-inherit [box-decoration-break:clone]" style={{ background: rgba(l.highlightColor, l.highlightAlpha) }}>
      {children}
    </mark>
  );
}

const QUOTES: Quote[] = [
  {
    text: (
      <>
        For the first time she finished her math homework without one of us sitting next to her. <Mark>It sat next to her instead.</Mark>
      </>
    ),
    name: "Carla S.",
    who: "parent of a 7th grader, Sacramento",
  },
  { text: <>She stopped asking me for the answer and started asking it to <Mark>check her steps</Mark>.</>, name: "Priya R.", who: "parent of a 7th grader, San Jose" },
  { text: <><Mark>It waits.</Mark> My old tutor didn&rsquo;t.</>, name: "Leo M.", who: "9th grade" },
  { text: <>I said &ldquo;wait, why&rdquo; like eight times and it <Mark>never got annoyed</Mark>.</>, name: "Sofia A.", who: "8th grade" },
  { text: <>The board made ratios click in one session. I watched it happen <Mark>from the kitchen</Mark>.</>, name: "Daniel K.", who: "parent of a 6th grader, Fremont" },
  { text: <>It caught my wrong answer <Mark>before I said it out loud</Mark> in class.</>, name: "Maya T.", who: "10th grade" },
  { text: <>Less than one hour with our old tutor, and she uses it <Mark>four nights a week</Mark>.</>, name: "Anne L.", who: "parent of a 9th grader, Oakland" },
  { text: <>It <Mark>drew the fraction pieces</Mark> instead of telling me the rule again.</>, name: "Jonah P.", who: "6th grade" },
  { text: <>The transcript is how I found out <Mark>what he was actually stuck on</Mark>.</>, name: "Marcus D.", who: "parent of an 8th grader, San Diego" },
  { text: <>I can talk through a problem at 10pm without <Mark>anyone getting tired of me</Mark>.</>, name: "Ivy N.", who: "8th grade" },
  { text: <>She showed me the graph it drew and explained it back to me. <Mark>That never happened before.</Mark></>, name: "Tomas R.", who: "parent of a 6th grader, Modesto" },
  { text: <>It made me <Mark>do the last step myself</Mark> even when I asked it not to.</>, name: "Bea K.", who: "7th grade" },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .replace(".", "")
    .slice(0, 2);

/* The widest the layout is allowed to go at this screen size: four columns
   from lg, two from sm, one below. The tuner's count is capped by it. Three on
   the server, matching the widest shipped layout, then the real answer. */
function useColumnCap(): number {
  return useSyncExternalStore(
    (cb) => {
      const sm = window.matchMedia("(min-width: 640px)");
      const lg = window.matchMedia("(min-width: 1024px)");
      sm.addEventListener("change", cb);
      lg.addEventListener("change", cb);
      return () => {
        sm.removeEventListener("change", cb);
        lg.removeEventListener("change", cb);
      };
    },
    () => (window.matchMedia("(min-width: 1024px)").matches ? 4 : window.matchMedia("(min-width: 640px)").matches ? 2 : 1),
    () => 3,
  );
}

function Stars() {
  const l = useContext(Look);
  if (!l.stars) return null;
  return (
    <span className={cn("flex gap-[3px]", l.align === "center" && "justify-center")} role="img" aria-label="Rated five out of five">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} aria-hidden style={{ fill: l.starColor, width: l.starSize, height: l.starSize }} stroke="none" />
      ))}
    </span>
  );
}

const CORNERS = [
  { left: 0, top: 0 },
  { left: "100%", top: 0 },
  { left: 0, top: "100%" },
  { left: "100%", top: "100%" },
] as const;

function Card({ q, width }: { q: Quote; width?: number }) {
  const l = useContext(Look);
  const center = l.align === "center";
  const mark = rgba(l.markColor, l.markAlpha);
  const style: CSSProperties = {
    width,
    padding: l.padding,
    borderRadius: l.radius,
    backgroundColor: rgba(l.fillColor, l.fillAlpha),
    border: l.edge === "none" ? "none" : `1px ${l.edge} ${rgba(l.edgeColor, l.edgeAlpha)}`,
    boxShadow: l.shadow ? `0 ${Math.round(10 * l.shadow)}px ${Math.round(30 * l.shadow)}px rgba(18, 18, 21, ${(0.1 * l.shadow).toFixed(3)})` : undefined,
    textAlign: l.align,
    ...(l.marks === "ticks" ? cornerTicks(mark, l.markSize) : null),
  };
  const display = l.font === "display";
  return (
    <figure className="relative m-0 flex shrink-0 flex-col gap-3.5" style={style}>
      {l.marks === "nodes" &&
        CORNERS.map((c, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute z-[1] -translate-x-1/2 -translate-y-1/2 bg-(--lp-bg)"
            style={{ ...c, width: l.markSize, height: l.markSize, border: `1px solid ${mark}` }}
          />
        ))}
      <Stars />
      {l.quoteMark === "big" && (
        <span aria-hidden className="lp-title -mb-3 block leading-[0.7] text-(--lp-sky)" style={{ fontSize: Math.round(l.textSize * 3.2) }}>
          &ldquo;
        </span>
      )}
      <blockquote
        className={cn("m-0 text-(--lp-ink)", display && "lp-title")}
        style={{ fontSize: l.textSize, lineHeight: display ? 1.3 : 1.55, fontWeight: display ? 500 : undefined, letterSpacing: display ? "-0.01em" : undefined }}
      >
        {l.quoteMark === "inline" ? <>&ldquo;{q.text}&rdquo;</> : q.text}
      </blockquote>
      <figcaption className={cn("flex items-center gap-3 pt-0.5", center && "justify-center")}>
        {l.avatar !== "none" && (
          <span
            aria-hidden
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center bg-(--lp-sky-soft) text-[12px] font-semibold text-(--lp-sky-deep)",
              l.avatar === "circle" ? "rounded-full" : "rounded-[8px]",
            )}
          >
            {initials(q.name)}
          </span>
        )}
        <span className="min-w-0 text-[13px] leading-[1.35]">
          <span className="block font-medium text-(--lp-ink)">{q.name}</span>
          <span className="block text-(--lp-ink-2)">{q.who}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/* One lane of cards drifting along an axis: a column moving up or down, or a
   row moving sideways. The cards are rendered twice and the offset wraps at
   the length of one copy, so the loop has no seam; the second copy is hidden
   from screen readers, which read the page's static order anyway. */
function Lane({ quotes, speed, axis, cardWidth }: { quotes: Quote[]; speed: number; axis: "x" | "y"; cardWidth?: number }) {
  const l = useContext(Look);
  const pos = useMotionValue(speed < 0 ? -1 : 0);
  const copy = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState(0);
  const hold = useRef(false);
  const vertical = axis === "y";

  useLayoutEffect(() => {
    const el = copy.current;
    if (!el) return;
    // In the observer, not the effect body: it runs after layout and before
    // paint, so the wrap length is right on the first frame.
    const ro = new ResizeObserver(() => setSpan((vertical ? el.offsetHeight : el.offsetWidth) + l.gap));
    ro.observe(el);
    return () => ro.disconnect();
  }, [vertical, l.gap]);

  useAnimationFrame((_, delta) => {
    if (hold.current || !span) return;
    let next = pos.get() - (speed * delta) / 1000;
    if (next <= -span) next += span;
    if (next > 0) next -= span;
    pos.set(next);
  });

  const flow = cn("flex", vertical ? "flex-col" : "w-max flex-row items-stretch");
  const cards = (suffix: string) => quotes.map((q) => <Card key={q.name + suffix} q={q} width={vertical ? undefined : cardWidth} />);
  return (
    <div
      className={vertical ? "min-w-0" : "overflow-visible"}
      onPointerEnter={() => {
        hold.current = l.hoverPause;
      }}
      onPointerLeave={() => {
        hold.current = false;
      }}
    >
      <motion.div style={{ [axis]: pos, gap: l.gap }} className={cn(flow, "will-change-transform")}>
        <div ref={copy} className={flow} style={{ gap: l.gap }}>
          {cards("")}
        </div>
        <div aria-hidden className={flow} style={{ gap: l.gap }}>
          {cards("-again")}
        </div>
      </motion.div>
    </div>
  );
}

// Px a second, per lane, as a share of the tuner's speed. The uneven shares
// keep two lanes from moving as a pair; with `alternate` every other lane
// runs the other way.
const SHARES = [1, 0.8, 1.2, 0.9];

function deal(n: number) {
  const out: Quote[][] = Array.from({ length: n }, () => []);
  QUOTES.forEach((q, i) => out[i % n].push(q));
  return out;
}

function Wall() {
  const l = useContext(Look);
  const cap = useColumnCap();
  const laneSpeed = (i: number) => l.speed * SHARES[i % SHARES.length] * (l.alternate && i % 2 === 1 ? -1 : 1);

  if (l.layout === "rows") {
    const fade = `linear-gradient(to right, transparent, #000 ${l.fade}%, #000 ${100 - l.fade}%, transparent)`;
    return (
      <div className="flex flex-col overflow-hidden" style={{ gap: l.gap, maskImage: fade, WebkitMaskImage: fade }}>
        {deal(l.rows).map((quotes, i) => (
          <Lane key={i} quotes={quotes} speed={laneSpeed(i)} axis="x" cardWidth={l.cardWidth} />
        ))}
      </div>
    );
  }

  const cols = Math.max(1, Math.min(l.columns, cap));
  const grid: CSSProperties = { gap: l.gap, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  if (l.layout === "grid") {
    return (
      <div className="grid items-start" style={grid}>
        {deal(cols).map((quotes, i) => (
          <div key={i} className="flex flex-col" style={{ gap: l.gap }}>
            {quotes.map((q) => (
              <Card key={q.name} q={q} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  const fade = `linear-gradient(to bottom, transparent, #000 ${l.fade}%, #000 ${100 - l.fade}%, transparent)`;
  return (
    // The fade at the top and bottom: the wall runs out of the page rather
    // than stopping at an edge.
    <div className="relative overflow-hidden" style={{ height: l.height, maskImage: fade, WebkitMaskImage: fade }}>
      <div className="grid items-start" style={grid}>
        {deal(cols).map((quotes, i) => (
          <Lane key={i} quotes={quotes} speed={laneSpeed(i)} axis="y" />
        ))}
      </div>
    </div>
  );
}

/* Reduced motion gets the same cards, standing still and all of them: a
   window that only moves would hide most of what people said. */
function Still() {
  const l = useContext(Look);
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3" style={{ gap: l.gap }}>
      {QUOTES.map((q) => (
        <Card key={q.name} q={q} />
      ))}
    </div>
  );
}

export function Reviews() {
  const reduce = useReduce();
  const { look, panel, openTuner } = useReviewsLook();
  const wall = reduce ? <Still /> : <Wall />;
  return (
    <Look.Provider value={look}>
      <Section id="stories">
        <Container>
          <Reveal>
            <Label>Reviews</Label>
            <Title className="max-w-[18ch]">Hear from happy students.</Title>
            <Lede>Kids in grades 5 to 12, and the parents who listened from the kitchen.</Lede>
          </Reveal>
        </Container>
        <Reveal delay={0.1} amount={0.15} className="mt-12">
          {/* Double-click opens the tuner, where it exists. */}
          <div onDoubleClick={openTuner ?? undefined}>{look.width === "rails" ? <div className="lp-railspan">{wall}</div> : <Container>{wall}</Container>}</div>
        </Reveal>
      </Section>
      {panel}
    </Look.Provider>
  );
}
