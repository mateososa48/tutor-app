"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { motion, useMotionValue, useScroll, useTransform, type MotionValue } from "motion/react";
import { TOPIC_ICONS } from "./topic-icons.generated";
import { useTopicWall, type TopicWall } from "./TopicsTuner";
import { cornerTicks as ticks, rgba } from "./useTuner";
import { useReduce } from "./useScript";

// What Chalk covers, as a wall of math glyphs. After Framer's SyncScrollSlider:
// rows of tiles that slide sideways in step with the page scroll, alternating
// direction, through a straight mapping of the section's scroll progress (no
// spring, so the rows track the finger). The rows are pre-shifted so the cut
// always falls through a tile rather than between two, and there is no hover
// because nothing here is clickable. Reduced motion parks every row at
// mid-travel. The rows are cut off hard at the page's rails by default, so the
// rails frame them like a window.
//
// Each tile is one line glyph from Hugeicons' free Stroke Rounded set, in the
// page's sky, on a pale sky tile (Mateo, Sept 22, after pointing at the
// Hugeicons catalogue: small tiles, light blue, the icon a stronger light
// blue). The first try that day was Fluent's colour emoji on 128px dotted
// paper, which read as clip art; a single-weight line set in one hue is what
// makes seventy-two different symbols read as one wall.
//
// Every visual constant comes from `TopicWall` (TopicsTuner.tsx), which Mateo
// can change live with Shift+T or a double-click on the wall.

// The glyphs in their generated order, which is grouped by kind; rows deal
// from it round robin so no row is all one topic.
const LIST = Object.keys(TOPIC_ICONS);

// Each row's share of the travel. The uneven fractions keep any two rows from
// moving as a pair; `alternate` sends every other one the other way.
const DRIFT = [1, 0.8, 0.65, 1, 0.85, 0.7];
// Fractions of a tile pitch, none a whole one apart, so columns never line up.
const STAGGER = [0.25, 0.74, 0.1, 0.6, 0.4, 0.88];

// The widest the wall ever gets is the rails, 1270px; a row must cover that
// plus its travel and its offset, whatever the tile size.
const WALL_MAX = 1280;

/** Row r: its own share of the list first, then the others, cycling only if
    the tiles are so small that one pass is not enough. */
function rowNames(r: number, rows: number, need: number) {
  const own = LIST.filter((_, i) => i % rows === r);
  const rest = LIST.filter((_, i) => i % rows !== r);
  const order = [...own, ...rest];
  return Array.from({ length: need }, (_, i) => order[i % order.length]);
}

/* Every glyph's paths, once, in a sprite the tiles point at. The stroke width
   is set here by CSS, which beats the paths' own attribute and reaches the
   copies each `<use>` makes. */
function Sprite() {
  return (
    <svg aria-hidden focusable="false" className="absolute h-0 w-0 overflow-hidden [&_*]:[stroke-width:var(--lp-topic-stroke,1.5)]">
      {Object.entries(TOPIC_ICONS).map(([name, body]) => (
        <symbol key={name} id={`lp-topic-${name}`} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: body }} />
      ))}
    </svg>
  );
}

const CORNERS = [
  { left: 0, top: 0 },
  { left: "100%", top: 0 },
  { left: 0, top: "100%" },
  { left: "100%", top: "100%" },
] as const;

function Tile({ name, w, last }: { name: string; w: TopicWall; last: boolean }) {
  const edge = rgba(w.edgeColor, w.edgeAlpha);
  const mark = rgba(w.markColor, w.markAlpha);
  const style: CSSProperties = {
    width: w.tile,
    height: w.tile,
    color: w.iconColor,
    borderRadius: w.seamless ? 0 : w.radius,
    backgroundColor: w.fill ? rgba(w.fillColor, w.fillAlpha) : "transparent",
    ...(w.marks === "ticks" ? ticks(mark, w.markSize) : null),
  };
  // Seamless: each tile draws its right and bottom, so neighbours share one
  // line and the wall reads as one grid (the wall draws the top).
  if (w.seamless) {
    const line = `1px ${w.edge === "dashed" ? "dashed" : "solid"} ${w.edge === "none" ? "transparent" : edge}`;
    style.borderRight = line;
    style.borderBottom = line;
  } else if (w.edge !== "none") {
    style.border = `1px ${w.edge} ${edge}`;
  }
  return (
    <div className="relative flex shrink-0 items-center justify-center" style={style}>
      {w.marks === "nodes" &&
        // In the seamless grid a row marks only the line above it (and the
        // last row the one below too): rows sit at different offsets, so a
        // row's bottom nodes and the next row's top nodes never coincide and
        // read as doubled.
        (w.seamless && !last ? CORNERS.slice(0, 2) : CORNERS).map((c, i) => (
          // The page's crossing node: a small hollow square filled with the
          // page, centred on the corner.
          <span
            key={i}
            aria-hidden
            className="absolute z-[1] -translate-x-1/2 -translate-y-1/2 bg-(--lp-bg)"
            style={{ ...c, width: w.markSize, height: w.markSize, border: `1px solid ${mark}` }}
          />
        ))}
      {/* Sized explicitly: an <svg> carries a 300px intrinsic width. */}
      <svg width={w.icon} height={w.icon} aria-hidden focusable="false">
        <use href={`#lp-topic-${name}`} />
      </svg>
    </div>
  );
}

type RowProps = { names: string[]; x: MotionValue<number> | number; offset: number; gap: number; z: number; last: boolean; w: TopicWall };

function Row({ names, x, offset, gap, z, last, w }: RowProps) {
  return (
    // Earlier rows sit above later ones, so a node on a row's bottom edge is
    // not painted over by the row below.
    <motion.div style={{ x, marginLeft: offset, gap, zIndex: z }} className="relative flex w-max will-change-transform">
      {names.map((name, i) => (
        <Tile key={`${name}-${i}`} name={name} w={w} last={last} />
      ))}
    </motion.div>
  );
}

export function KeycapSlider() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduce();
  const { wall: w, panel, openTuner } = useTopicWall();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.15"] });

  const rows = Math.max(1, Math.min(6, Math.round(w.rows)));
  const gap = w.seamless ? 0 : w.gap;
  const rowGap = w.seamless ? 0 : w.rowGap;
  const pitch = w.tile + gap;
  const need = Math.ceil((WALL_MAX + w.travel + pitch) / pitch) + 1;
  const ranges = DRIFT.map((d, r) => {
    const t = w.travel * d;
    const left = !w.alternate || r % 2 === 0;
    return left ? [0, -t] : [-t, 0];
  });

  // The ranges change as the tuner moves, so the transforms read them from a
  // ref, and a counter nudges them to recompute without waiting for a scroll.
  const rangesRef = useRef(ranges);
  const tick = useMotionValue(0);
  useEffect(() => {
    rangesRef.current = ranges;
    tick.set(tick.get() + 1);
  });
  const at = (r: number) => ([p]: number[]) => {
    const [a, b] = rangesRef.current[r];
    return a + (b - a) * p;
  };
  // One per possible row, declared flat: hooks cannot live in the row loop.
  const x0 = useTransform([scrollYProgress, tick], at(0));
  const x1 = useTransform([scrollYProgress, tick], at(1));
  const x2 = useTransform([scrollYProgress, tick], at(2));
  const x3 = useTransform([scrollYProgress, tick], at(3));
  const x4 = useTransform([scrollYProgress, tick], at(4));
  const x5 = useTransform([scrollYProgress, tick], at(5));
  const xs = [x0, x1, x2, x3, x4, x5];

  // The fade is capped at a fifth of the wall on each side: Mateo's 176px on a
  // 390px phone faded 352px of it, so nearly every icon sat half gone. On the
  // 1270px desktop wall a fifth is 254px, so his value there is untouched.
  const fw = `min(${w.fadeWidth}px, 20%)`;
  const fade = w.frame === "fade" ? `linear-gradient(90deg, transparent, #000 ${fw}, #000 calc(100% - ${fw}), transparent)` : undefined;
  const topLine =
    w.seamless && w.edge !== "none" ? `1px ${w.edge === "dashed" ? "dashed" : "solid"} ${rgba(w.edgeColor, w.edgeAlpha)}` : undefined;

  return (
    <>
      <div
        ref={ref}
        aria-hidden
        onDoubleClick={openTuner ?? undefined}
        className="mx-auto overflow-hidden py-3"
        // Rail to rail (`--lp-rail-inset` either side of centre), one rail width
        // inside each so neither is painted over — the same geometry as
        // `.lp-railspan`, derived from the same tokens so a change to the rails
        // carries here too. Not that class: below 1320px this is a marquee that
        // should cut at the screen edge, where `.lp-railspan` would pull it into
        // the container and cut it in mid-air.
        style={
          {
            width: "min(100%, calc(2 * var(--lp-rail-inset) - 2 * var(--lp-rail-w)))",
            maskImage: fade,
            WebkitMaskImage: fade,
            "--lp-topic-stroke": w.stroke,
          } as CSSProperties
        }
      >
        <Sprite />
        <div className="flex flex-col" style={{ gap: rowGap, borderTop: topLine }}>
          {Array.from({ length: rows }, (_, r) => {
            const mid = (ranges[r][0] + ranges[r][1]) / 2;
            const offset = -8 - (w.stagger ? Math.round(STAGGER[r] * pitch) : 0);
            return <Row key={r} names={rowNames(r, rows, need)} x={reduce ? mid : xs[r]} offset={offset} gap={gap} z={rows - r} last={r === rows - 1} w={w} />;
          })}
        </div>
      </div>
      {panel}
    </>
  );
}
