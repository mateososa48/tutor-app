"use client";

import { useRef, type CSSProperties } from "react";
import { motion, useInView } from "motion/react";
import { CLONE, stroke } from "./marks";
import { Container, Reveal, Section } from "./Section";
import { AI_MARKS } from "./ai-marks";
import { useReduce } from "./useScript";

// The first thing after the hero, and the page's one correction. The copy is
// already a correction, so the design does what the writing does: the first
// sentence is crossed out by the tutor's own pen a beat after the section
// arrives, and the sentence that replaces it sits underneath. Each line ends
// with who it is about: the three chat boxes, then the Chalk mark, which
// draws itself.

/* A shape cut out of whatever is painted behind it, so a flat brand colour and
   a gradient are drawn the same way. */
const maskOf = (path: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='${path}' fill='#000'/></svg>`,
  )}")`;

// The page's light sky rather than the board's deeper strike colour: Mateo's
// call. Here the line is decoration and `<del>` carries the meaning.
// A shallow wave around the middle, not a swing: stretched across a whole line
// a taller path stops reading as a hand and starts reading as a tilt.
const STRIKE = stroke("M1 5.4 C 26 4.7, 50 5.9, 70 5.1 S 100 4.6, 119 5.3", "#3d9cff", 3.4, "0 0 120 10");
// 10 viewBox units drawn into 13px, so the 3.4-unit stroke lands about 4.4px.
const STRIKE_H = "13px";

/* ── The crossed-out line ───────────────────────────────────────────────── */

// A background paints behind its own text, which left the letters cutting the
// line into pieces and reading as half-transparent. So the sentence is set
// twice: once normally, and once more in a layer above it with the text turned
// transparent, carrying the stroke. The copy is aria-hidden and unselectable,
// and sits in an absolutely positioned box the same size as the real one, so
// both wrap identically at every width.
const OVERLAY = "pointer-events-none absolute inset-0 select-none text-transparent";
const MARK: CSSProperties = { backgroundImage: STRIKE, backgroundRepeat: "no-repeat", backgroundPosition: "left 64%" };

function Struck({ text }: { text: string }) {
  const reduce = useReduce();
  return (
    <del className="relative block font-normal no-underline">
      {text}
      <span aria-hidden className={OVERLAY}>
        {reduce ? (
          <span className={CLONE} style={{ ...MARK, backgroundSize: `100% ${STRIKE_H}` }}>
            {text}
          </span>
        ) : (
          <motion.span
            className={CLONE}
            style={MARK}
            initial={{ backgroundSize: `0% ${STRIKE_H}` }}
            whileInView={{ backgroundSize: `100% ${STRIKE_H}` }}
            viewport={{ once: true, amount: 0.6 }}
            // A gentle ease in and out rather than the page's hard ease-out,
            // which front-loaded the stroke and made it read as a snap however
            // long it ran. A pen crosses a line at a fairly even speed.
            transition={{ duration: 1.5, delay: 0.5, ease: [0.37, 0, 0.3, 1] }}
          >
            {text}
          </motion.span>
        )}
      </span>
    </del>
  );
}

/* ── The three chat boxes ───────────────────────────────────────────────── */

// Stacked the way HeroUI's AvatarGroup does it in "clip" mode: instead of
// ringing each circle in white, the one underneath has a crescent cut out of
// it where its neighbour sits, leaving a transparent seam the page shows
// through. The technique, not the package: HeroUI ships its own token system
// and would be a second design system next to shadcn and Base UI here.
const DISC = 44;
const OVERLAP = 12;
const SEAM = 2;
// The next disc's centre, measured from this one's left edge.
const NEXT_CENTRE = DISC * 1.5 - OVERLAP;
const CRESCENT = `radial-gradient(circle at ${NEXT_CENTRE}px 50%, transparent ${DISC / 2 + SEAM}px, #000 ${DISC / 2 + SEAM + 0.5}px)`;

function ChatBoxes() {
  return (
    <span className="inline-flex shrink-0">
      {AI_MARKS.map((mark, i) => {
        const clipped = i < AI_MARKS.length - 1;
        const glyph = Math.round(22 * (mark.scale ?? 1));
        return (
          <span
            key={mark.name}
            title={mark.name}
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-(--lp-line) bg-white"
            style={
              {
                width: DISC,
                height: DISC,
                marginLeft: i ? -OVERLAP : 0,
                zIndex: AI_MARKS.length - i,
                maskImage: clipped ? CRESCENT : undefined,
                WebkitMaskImage: clipped ? CRESCENT : undefined,
              } as CSSProperties
            }
          >
            <span
              aria-hidden
              className="block"
              style={{
                width: glyph,
                height: glyph,
                background: mark.fill,
                maskImage: maskOf(mark.path),
                WebkitMaskImage: maskOf(mark.path),
                maskSize: "100% 100%",
                WebkitMaskSize: "100% 100%",
                maskRepeat: "no-repeat",
                WebkitMaskRepeat: "no-repeat",
              }}
            />
          </span>
        );
      })}
      <span className="sr-only">ChatGPT, Claude and Gemini</span>
    </span>
  );
}

/* ── The Chalk mark ─────────────────────────────────────────────────────── */

// Written the way the tutor writes: one stroke, start to finish, once the line
// is on screen. It is the real stroked path from `ChalkMark`, so the drawing
// follows the actual curve rather than wiping over a filled shape. The viewBox
// is cropped to the ink (the component's own 22x22 box carries whitespace that
// would only inflate the row).
const CHALK_D = "M3 15.5c3.2-6.8 6.2-10.2 8-9.5 1.9.8-2.7 9.5-.9 10.2 1.5.6 3.9-2.4 6.9-5.1";
const CHALK_BOX = "1.4 4.4 18.2 13.6";
const CHALK_W = 62;

function ChalkScribble() {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReduce();
  const inView = useInView(ref, { once: true, amount: 0.9 });
  const line = {
    d: CHALK_D,
    fill: "none",
    stroke: "var(--lp-sky)",
    strokeWidth: 2.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <span ref={ref} className="inline-flex shrink-0">
      <svg width={CHALK_W} height={Math.round((CHALK_W * 13.6) / 18.2)} viewBox={CHALK_BOX} aria-hidden>
        {reduce ? (
          <path {...line} />
        ) : (
          <motion.path
            {...line}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: inView ? 1 : 0 }}
            transition={{ duration: 1.1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </svg>
    </span>
  );
}

// Each sentence is its own row, so the mark beside it never lands inside the
// sentence's line boxes: that would make the last line taller than the rest
// and pull the struck copy out of line with the real one.
const ROW = "flex flex-wrap items-center gap-x-3.5 gap-y-2";

export function Intro() {
  return (
    <Section>
      <Container>
        <Reveal>
          {/* Both sentences are ink; the correction carries the display weight
              and the other carries the pen. */}
          <h2 className="lp-title m-0 text-[clamp(1.5rem,3vw,2.375rem)] leading-[1.28] text-(--lp-ink)">
            <span className={ROW}>
              <Struck text="Homework help and tutoring is stuck in a chat box" />
              <ChatBoxes />
            </span>
            <span className={`${ROW} mt-4`}>
              <ins className="block no-underline">Chalk is like the tutor you talk to over a video call</ins>
              <ChalkScribble />
            </span>
          </h2>
          <p className="mt-7 max-w-[58ch] text-[1.0625rem] leading-[1.6] text-(--lp-ink-2) sm:text-[1.1875rem]">
            Chalk is a live voice-to-voice AI tutor that uses a whiteboard and specialized tutoring techniques to teach.
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
