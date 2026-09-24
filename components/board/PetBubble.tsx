"use client";

import { Fragment, useCallback, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { advanceCaption, EMPTY_LINE, splitBubbles, visibleWords, wordDelayMs, type CaptionLine, type CaptionWord } from "@/lib/caption-words";
import { useReduce } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";

// What the pet says (rebuilt Sept 23 2026 on the landing FAQ's bubbles, the
// ones Mateo approved): a hairline on white with a small tail and no shadow.
//
// Speech is the live caption, so it grows about 3.5 words a second. Every word
// keeps its key for the whole turn (lib/caption-words.ts): words already there
// never animate again, only a new word fades up out of a slight blur, laid out
// where it will sit, so no word is ever outside the bubble. The bubble's height
// follows its words on a short ease; nothing scales the text. (It used to be
// keyed on the whole string: each new word threw the bubble away and typed it
// again from the first word, two copies on screen half the time, and a layout
// spring squashed the text as the box resized.) A new turn is a new bubble.
//
// A long turn rolls up like a live caption. The whole turn stays laid out in
// one paragraph that never reflows; the bubble is a window onto its last
// sentence or two (`tail`), starting at the line that holds the first of them.
// When an older sentence drops out, the window's top edge slides down over it
// while it dims, and the words below hold still: the height and the scroll move
// on one curve, so their sum, which is where a word sits on screen, does not
// jump. (Cutting the words out instead re-flowed what was left: 13 to 17 words
// leapt up to 70px in one frame, mid-sentence.) Words of the older sentence
// that share that first line stay, dimmed, rather than leave a gap.
//
// A live caption is sent as texts (Sept 24 2026, Mateo: "like a double
// text"): each sentence becomes its own bubble once the next one starts
// (`splitBubbles`; a short "Yep." rides with the next sentence). The earlier
// bubble slides up as the new one grows out of the tail below it; only the
// newest keeps the tail, and at most two show, the oldest drifting up and out.
// A new turn that starts while the last one is still up keeps the last one's
// final bubble above it the same way.
//
// Thinking is the same bubble holding the word "Thinking" with a sky light
// sweeping across it, and two small circles trailing back to the pet, pulsing
// in turn. It replaced the cloud and its three dots, which Mateo found ugly.
//
// It is deliberately NOT pixel art: the pet is the character, the bubble is
// the app talking, in the app's own type and hairlines.

export type BubbleKind = "speech" | "thought";
export type BubbleSide = "top" | "right" | "left";

type Props = {
  open: boolean;
  /** The words. On a live caption, the whole turn so far. Leave it out on a thought bubble for "Thinking". */
  text?: string;
  kind?: BubbleKind;
  /** Which side of the pet the bubble sits on. */
  side?: BubbleSide;
  /** Which end of that side the tail sits at. */
  align?: "start" | "end";
  /** How wide the words may run before they wrap. */
  maxWidth?: number;
  /** Px between the bubble and the pet. */
  gap?: number;
  /** A live caption: once the turn passes this many characters, show only its last sentence or two. */
  tail?: number;
  /** "quiet": muted ink, the lowest-key thing the pet says. */
  tone?: "default" | "quiet";
  className?: string;
};

// One curve for the words and the height, the landing FAQ's spring for the
// bubble arriving (it grows out of its tail and settles).
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const POP = { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.7 };
const WORD_S = 0.16;
// The window's height and its scroll, on one curve and one duration, so a word
// on screen holds still while an older line leaves over the top.
const HEIGHT = "height 220ms cubic-bezier(0.23, 1, 0.32, 1)";
const SCROLL = "transform 220ms cubic-bezier(0.23, 1, 0.32, 1)";
// The corner the bubble grows out of: the middle of its tail.
const ORIGIN = 24;

const BOX = "relative rounded-[16px] border border-(--lp-line-strong) bg-white";
const TEXT = "px-4 py-3 text-[15px] leading-[1.55]";

type Place = { style: React.CSSProperties; origin: string };

// Where the bubble sits, and the corner it grows out of.
const PLACE: Record<BubbleSide, (align: "start" | "end", gap: number) => Place> = {
  top: (align, gap) => ({
    style: { bottom: `calc(100% + ${gap}px)`, ...(align === "start" ? { left: 0 } : { right: 0 }) },
    origin: align === "start" ? `${ORIGIN}px 100%` : `calc(100% - ${ORIGIN}px) 100%`,
  }),
  right: (align, gap) => ({
    style: { left: `calc(100% + ${gap}px)`, ...(align === "start" ? { top: 0 } : { bottom: 0 }) },
    origin: align === "start" ? `0% ${ORIGIN}px` : `0% calc(100% - ${ORIGIN}px)`,
  }),
  left: (align, gap) => ({
    style: { right: `calc(100% + ${gap}px)`, ...(align === "start" ? { top: 0 } : { bottom: 0 }) },
    origin: align === "start" ? `100% ${ORIGIN}px` : `100% calc(100% - ${ORIGIN}px)`,
  }),
};

// The caption as keyed words. The previous line is kept in state and advanced
// during render when the text changes (React's pattern for deriving state from
// a changed prop), so a word's key is settled before it is ever drawn.
function useCaptionLine(text: string, live: boolean): CaptionLine {
  const [line, setLine] = useState<CaptionLine>(() => advanceCaption(EMPTY_LINE, text, { live }));
  const next = advanceCaption(line, text, { live });
  if (next !== line) setLine(next);
  return next;
}

export function PetBubble({
  open,
  text,
  kind = "speech",
  side = "top",
  align = "start",
  maxWidth = 210,
  gap = 8,
  tail,
  tone = "default",
  className,
}: Props) {
  const reduce = useReduce();
  const still = reduce === true;
  const thinking = kind === "thought" && !text;
  // Closed or thinking resets the line, so the next words are a new turn. A
  // live caption (`tail`) never drops words within a turn (lib/caption-words).
  const line = useCaptionLine(open && !thinking ? (text ?? "") : "", tail != null);
  const words = tail ? visibleWords(line.words, tail) : line.words;
  const from = words.length ? words[0].index : 0;
  const place = PLACE[side](align, gap);
  const stack = useSentBubbles(line, tail != null && kind === "speech" && !thinking);

  if (stack) {
    const shown = stack.slice(-2);
    return (
      <AnimatePresence>
        {open && shown.length > 0 && (
          <motion.div
            key={`${kind}-stack`}
            data-bubble-stack=""
            role="status"
            aria-live="off"
            aria-label={shown[shown.length - 1].words.map((w) => w.text).join(" ")}
            initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.94, filter: "blur(6px)" }}
            animate={still ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.97, filter: "blur(4px)", transition: { duration: 0.18, ease: EASE_OUT } }}
            transition={still ? { duration: 0.15 } : { ...POP, filter: { duration: 0.3, ease: EASE_OUT } }}
            style={{ ...place.style, transformOrigin: place.origin }}
            className={cn("pointer-events-none absolute z-10 flex w-max flex-col gap-1.5", align === "start" ? "items-start" : "items-end", className)}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {shown.map((b, i) => {
                const last = i === shown.length - 1;
                const visible = tail ? visibleWords(b.words, tail) : b.words;
                return (
                  <motion.div
                    key={b.key}
                    data-bubble=""
                    layout={still ? false : "position"}
                    initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.94, filter: "blur(6px)" }}
                    animate={still ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={still ? { opacity: 0 } : { opacity: 0, y: -12, filter: "blur(3px)", transition: { duration: 0.22, ease: EASE_OUT } }}
                    transition={still ? { duration: 0.15 } : { ...POP, filter: { duration: 0.3, ease: EASE_OUT } }}
                    style={{ transformOrigin: place.origin, maxWidth }}
                    className="relative w-max"
                  >
                    <Say words={b.words} from={visible[0]?.index ?? 0} still={still} tone={tone} finished={last && line.interrupted} />
                    {last ? <Tail side={side} align={align} /> : null}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {open && (thinking || words.length > 0) && (
        <Bubble
          key={thinking ? `${kind}-thinking` : `${kind}-${line.turn}`}
          label={thinking ? "Thinking" : words.map((w) => w.text).join(" ")}
          // A live caption is the voice the student is already hearing:
          // announcing it word by word would talk over it.
          live={!tail}
          still={still}
          place={place}
          maxWidth={maxWidth}
          className={className}
        >
          {thinking ? <Thinking still={still} /> : <Say words={line.words} from={from} still={still} tone={tone} finished={line.interrupted} />}
          {kind === "speech" ? <Tail side={side} align={align} /> : <ThoughtDots side={side} align={align} still={still} />}
        </Bubble>
      )}
    </AnimatePresence>
  );
}

type Sent = { key: string; words: CaptionWord[] };

// The bubbles a live caption shows, oldest first: the turn's own, split at its
// sentences, after the last bubble of the turn before when this one started
// while that one was still up. Null when the caption is not sent as texts.
function useSentBubbles(line: CaptionLine, on: boolean): Sent[] | null {
  const [state, setState] = useState<{ line: CaptionLine; carry: Sent | null }>({ line, carry: null });
  let carry = state.carry;
  if (state.line !== line) {
    if (line.turn !== state.line.turn) {
      const before = splitBubbles(state.line.words).at(-1);
      carry = before && line.words.length > 0 ? { key: `${state.line.turn}-${before.id}`, words: before.words } : null;
    }
    if (!line.words.length) carry = null;
    setState({ line, carry });
  }
  if (!on) return null;
  const own = splitBubbles(line.words).map((b) => ({ key: `${line.turn}-${b.id}`, words: b.words }));
  return carry ? [carry, ...own] : own;
}

function Bubble({
  label,
  live,
  still,
  place,
  maxWidth,
  className,
  children,
}: {
  label: string;
  live: boolean;
  still: boolean;
  place: Place;
  maxWidth: number;
  className?: string;
  children: React.ReactNode;
}) {
  // Marks a bubble on its way out, so a check can tell it from the one arriving.
  const present = useIsPresent();
  return (
    <motion.div
      data-bubble=""
      data-exiting={present ? undefined : ""}
      role="status"
      aria-live={live ? "polite" : "off"}
      aria-label={label}
      initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.94, filter: "blur(6px)" }}
      animate={still ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.97, filter: "blur(4px)", transition: { duration: 0.18, ease: EASE_OUT } }}
      transition={still ? { duration: 0.15 } : { ...POP, filter: { duration: 0.3, ease: EASE_OUT } }}
      style={{ ...place.style, transformOrigin: place.origin, maxWidth }}
      className={cn("pointer-events-none absolute z-10 w-max", className)}
    >
      {children}
    </motion.div>
  );
}

// The words, each at the place it will keep. Inside the box's padding is a
// window onto them: its height eases to the shown lines' height and the words
// scroll inside it so the first shown line sits at its top; the text itself is
// never scaled. The window clips exactly at the lines, so nothing of a line
// that has scrolled away shows in the padding. A word arriving on a new line
// is revealed by the window growing under it while it fades in.
function Say({
  words,
  from,
  still,
  tone,
  finished,
}: {
  words: CaptionWord[];
  /** Index of the first word the bubble shows; the words before it have been said and scrolled away. */
  from: number;
  still: boolean;
  tone: "default" | "quiet";
  finished: boolean;
}) {
  const view = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const fromKey = useRef("");
  const placed = useRef(false);

  // Sets the window: height and scroll together, on the same curve, so a
  // shown word's place on screen (the bubble's bottom, less the window's
  // height, less the scroll, plus its place in the paragraph) moves only as
  // the paragraph grows at the bottom. The first placing, and every one under
  // reduced motion, is instant.
  const place = useCallback(() => {
    const v = view.current;
    const l = layer.current;
    if (!v || !l) return;
    const first = l.querySelector<HTMLElement>("[data-word-key]");
    const start = fromKey.current ? l.querySelector<HTMLElement>(`[data-word-key="${fromKey.current}"]`) : null;
    const scroll = first && start ? Math.max(0, start.offsetTop - first.offsetTop) : 0;
    const height = `${l.offsetHeight - scroll}px`;
    const transform = scroll ? `translateY(${-scroll}px)` : "";
    if (v.style.height !== height || l.style.transform !== transform) {
      const instant = still || !placed.current;
      placed.current = true;
      if (instant) {
        v.style.transition = "none";
        l.style.transition = "none";
      }
      v.style.height = height;
      l.style.transform = transform;
      if (instant) void v.offsetHeight; // commit the place before the transitions come back
    }
    const heightEase = still ? "none" : HEIGHT;
    const scrollEase = still ? "none" : SCROLL;
    if (v.style.transition !== heightEase) v.style.transition = heightEase;
    if (l.style.transition !== scrollEase) l.style.transition = scrollEase;
  }, [still]);

  // Before paint whenever the words or the first shown word change (a new word
  // may add a line; an older sentence may drop out), and whenever the words'
  // box changes size on its own (a font loading, a word completing).
  const shown = words.map((w) => `${w.key}:${w.text}`).join(" ");
  const startKey = words[from]?.key ?? "";
  useLayoutEffect(() => {
    fromKey.current = startKey;
    place();
  }, [shown, startKey, place]);
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => place());
    ro.observe(el);
    return () => ro.disconnect();
  }, [place]);

  return (
    <div data-bubble-box="" className={cn(BOX, TEXT, tone === "quiet" ? "text-(--lp-ink-2)" : "text-(--lp-ink)")}>
      {/* Clips top and bottom only, so a word's blur is never cut at the sides. */}
      <div ref={view} data-bubble-window="" className="overflow-y-clip">
        {/* Positioned, so it is the words' offsetParent whether or not it is scrolled. */}
        <div ref={layer} data-bubble-words="" data-finished={finished ? "" : undefined} aria-hidden className="relative">
          {words.map((word, i) => (
            <Fragment key={word.key}>
              {i > 0 ? " " : null}
              <Word word={word} past={word.index < from} still={still} />
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// One word. It animates once, when it first appears; its key never changes
// while the turn lasts, so it never animates again. Words from one update
// arrive 35 ms apart. A word of a sentence that has scrolled away dims.
function Word({ word, past, still }: { word: CaptionWord; past: boolean; still: boolean }) {
  const className = cn("inline-block", past && "text-(--lp-ink-3)", !still && "transition-colors duration-200");
  if (still) {
    return (
      <span data-word-key={word.key} data-past={past ? "" : undefined} className={className}>
        {word.text}
      </span>
    );
  }
  return (
    <motion.span
      data-word-key={word.key}
      data-past={past ? "" : undefined}
      className={className}
      initial={{ opacity: 0, y: 2, filter: "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: WORD_S, ease: EASE_OUT, delay: wordDelayMs(word) / 1000 }}
    >
      {word.text}
    </motion.span>
  );
}

// "Thinking", with a sky light sweeping across it once every 1.5 s. Under
// reduced motion the light holds still.
function Thinking({ still }: { still: boolean }) {
  return (
    <div data-bubble-box="" className={cn(BOX, TEXT, "flex items-center")}>
      <motion.span
        aria-hidden
        className="bg-clip-text font-medium text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--lp-ink-3) 0%, var(--lp-ink-3) 38%, var(--lp-sky-deep) 50%, var(--lp-ink-3) 62%, var(--lp-ink-3) 100%)",
          backgroundSize: "250% 100%",
          backgroundPosition: "100% 0%",
        }}
        animate={still ? undefined : { backgroundPosition: ["100% 0%", "0% 0%"] }}
        transition={still ? undefined : { duration: 1.5, repeat: Infinity, ease: "linear" }}
      >
        Thinking
      </motion.span>
    </div>
  );
}

// The speech tail: a square turned 45 degrees with two of its sides showing,
// so the hairline runs on unbroken around the corner. It sits over the box's
// edge, inside the padding, clear of the words.
const TAIL: Record<BubbleSide, (align: "start" | "end") => string> = {
  top: (align) => cn("-bottom-[6px] border-r border-b", align === "start" ? "left-[18px]" : "right-[18px]"),
  right: (align) => cn("-left-[6px] border-b border-l", align === "start" ? "top-[18px]" : "bottom-[18px]"),
  left: (align) => cn("-right-[6px] border-t border-r", align === "start" ? "top-[18px]" : "bottom-[18px]"),
};

function Tail({ side, align }: { side: BubbleSide; align: "start" | "end" }) {
  return <span aria-hidden className={cn("absolute size-[11px] rotate-45 border-(--lp-line-strong) bg-white", TAIL[side](align))} />;
}

// The thought tail: two small circles stepping back toward the pet, the far
// one pulsing first, the near one a beat later. Placed as on the landing FAQ
// (a bubble to the right of the pet) and turned for the other sides.
type Dot = { size: number; style: React.CSSProperties; delay: number };
const THOUGHT: Record<BubbleSide, (align: "start" | "end") => [Dot, Dot]> = {
  right: (align) => [
    { size: 6, delay: 0, style: { left: -21, ...(align === "start" ? { top: 31 } : { bottom: 31 }) } },
    { size: 10, delay: 0.18, style: { left: -13, ...(align === "start" ? { top: 17 } : { bottom: 17 }) } },
  ],
  left: (align) => [
    { size: 6, delay: 0, style: { right: -21, ...(align === "start" ? { top: 31 } : { bottom: 31 }) } },
    { size: 10, delay: 0.18, style: { right: -13, ...(align === "start" ? { top: 17 } : { bottom: 17 }) } },
  ],
  // Under the bubble, stepping down toward the pet's head.
  top: (align) => [
    { size: 6, delay: 0, style: { top: "calc(100% + 17px)", ...(align === "start" ? { left: 32 } : { right: 32 }) } },
    { size: 10, delay: 0.18, style: { top: "calc(100% + 4px)", ...(align === "start" ? { left: 20 } : { right: 20 }) } },
  ],
};

function ThoughtDots({ side, align, still }: { side: BubbleSide; align: "start" | "end"; still: boolean }) {
  return (
    <>
      {THOUGHT[side](align).map((c, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute rounded-full border border-(--lp-line-strong) bg-white"
          style={{ width: c.size, height: c.size, ...c.style }}
          animate={still ? undefined : { opacity: [0.35, 1, 0.35], scale: [0.85, 1, 0.85] }}
          transition={still ? undefined : { duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: c.delay }}
        />
      ))}
    </>
  );
}
