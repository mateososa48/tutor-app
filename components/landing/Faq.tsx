"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { TutorPet, type PetState } from "@/components/board/TutorPet";
import { FAQ_ITEMS, FAQ_QUESTION_MAX } from "@/lib/faq";
import { cn } from "@/lib/utils";
import { Container, Label, Lede, Reveal, Section, Title } from "./Section";
import { useReduce } from "./useScript";

// The FAQ, answered by the tutor's pet (Mateo, Sept 22). The heading sits on
// the left and the questions on the right; opening a question drops it down
// and the pet appears underneath and says the answer in a speech bubble.
// Closing it takes the pet and the bubble away. One question open at a time.
//
// The last row is an "infinite FAQ" (the idea @heyimgustavo's post made
// popular in September 2026): ask anything else and your question takes one
// row in the list, replacing the last thing you asked rather than piling up.
// It opens with the pet thinking while /api/faq asks the model, then saying
// the answer. Answers are grounded only in lib/faq.ts.
//
// The bubbles here are the FAQ's own, not the shared `PetBubble`: that one
// animates its size while its words arrive, so on a long answer the words
// sat outside the box mid-animation (Mateo: "the text comes in from the left,
// and at some point it's to the right of the box"). These lay out at their
// final size first and only fade the words in where they already sit. No
// shadow: a hairline on white is the page's language.

type Status = "done" | "thinking" | "error";
type Row = { id: string; q: string; a: string; status: Status };

const CURATED: Row[] = FAQ_ITEMS.map((item, i) => ({ id: `faq-${i}`, q: item.q, a: item.a, status: "done" }));
const ASKED_ID = "faq-asked";

// One curve for everything that eases, and one spring for everything that
// changes size, so the section moves as one thing.
const EASE = [0.22, 1, 0.36, 1] as const;
const SIZE = { type: "spring" as const, stiffness: 260, damping: 34, mass: 0.9 };
const POP = { type: "spring" as const, stiffness: 380, damping: 30, mass: 0.7 };
// The pet arrives as the row starts to open; its bubble a beat later.
const PET_DELAY_S = 0.08;
const BUBBLE_DELAY_MS = 280;

/* A small plus, two bars and no circle, that turns into a cross. Tailwind's
   `rotate-*` sets the CSS `rotate` property, not `transform`, so that is the
   property the transition names. */
function Cross({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-block size-4 shrink-0 transition-[rotate,color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        open ? "rotate-45 text-(--lp-sky-deep)" : "rotate-0 text-(--lp-ink-2) group-hover:text-(--lp-ink)",
      )}
    >
      <span className="absolute top-1/2 left-0 h-[1.5px] w-full -translate-y-1/2 rounded-full bg-current" />
      <span className="absolute top-0 left-1/2 h-full w-[1.5px] -translate-x-1/2 rounded-full bg-current" />
    </span>
  );
}

/* A box whose height follows its content on a spring: opening from nothing,
   growing when a thought becomes an answer, closing back to nothing. The
   content is measured, so the height is always a real number to spring to. */
function Grow({ children }: { children: ReactNode }) {
  const reduce = useReduce();
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
      animate={reduce ? { opacity: 1 } : { height: h, opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
      transition={{ height: SIZE, opacity: { duration: 0.28, ease: EASE } }}
      className="overflow-hidden"
    >
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}

/* The pet's voice level while it speaks: a soft wobble, not a meter. */
function useTalking(active: boolean) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const t = (performance.now() - start) / 1000;
      setLevel(0.25 + 0.45 * Math.abs(Math.sin(t * 7.3)) * (0.6 + 0.4 * Math.sin(t * 2.1)));
    }, 70);
    return () => {
      window.clearInterval(id);
      setLevel(0);
    };
  }, [active]);
  return active ? level : 0;
}

const BUBBLE = "relative rounded-[16px] border border-(--lp-line-strong) bg-white px-4 py-3 text-[15px] leading-[1.55] text-(--lp-ink)";

/* The words, already laid out at their final place, fading up out of a blur
   one after another. Nothing moves sideways, so nothing can leave the box. */
function Words({ text }: { text: string }) {
  const reduce = useReduce();
  // Number the words (not the spaces) before rendering, so each knows its turn.
  const parts = text.split(/(\s+)/).map((part, i, all) => ({ part, turn: part.trim() ? all.slice(0, i).filter((x) => x.trim()).length : -1 }));
  const count = parts.filter((p) => p.turn >= 0).length;
  const step = Math.min(0.03, 0.75 / Math.max(count, 1));
  return (
    <span aria-hidden>
      {parts.map(({ part, turn }, i) => {
        if (turn < 0) return part;
        const delay = reduce ? 0 : (turn + 1) * step;
        return (
          <motion.span
            key={i}
            className="inline-block"
            initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)" }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: reduce ? 0.15 : 0.4, delay, ease: EASE }}
          >
            {part}
          </motion.span>
        );
      })}
    </span>
  );
}

/* A bubble growing out of its tail, toward the pet. */
const enter = (reduce: boolean | null) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, filter: "blur(6px)" },
  animate: reduce ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, filter: "blur(4px)", transition: { duration: 0.18, ease: EASE } },
  transition: reduce ? { duration: 0.15 } : { ...POP, filter: { duration: 0.3, ease: EASE } },
  style: { transformOrigin: "0% 24px" },
});

/* The speech bubble: the answer, with a tail pointing back at the pet. */
function Speech({ text }: { text: string }) {
  const reduce = useReduce();
  return (
    <motion.div {...enter(reduce)} className={cn(BUBBLE, "w-fit max-w-full [grid-area:1/1]")} role="status" aria-label={text}>
      <span aria-hidden className="absolute top-[18px] -left-[6px] size-[11px] rotate-45 border-b border-l border-(--lp-line-strong) bg-white" />
      <Words text={text} />
    </motion.div>
  );
}

/* Thinking: the same bubble, holding the word "Thinking" with a light sweeping
   across it, and two small circles drifting back to the pet the way a thought
   does in a comic, pulsing one after the other. */
function Thought() {
  const reduce = useReduce();
  return (
    <motion.div {...enter(reduce)} className="relative w-fit [grid-area:1/1]" role="status" aria-label="Thinking">
      {[
        { size: 6, left: -21, top: 31, delay: 0 },
        { size: 10, left: -13, top: 17, delay: 0.18 },
      ].map((c, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute rounded-full border border-(--lp-line-strong) bg-white"
          style={{ width: c.size, height: c.size, left: c.left, top: c.top }}
          animate={reduce ? undefined : { opacity: [0.35, 1, 0.35], scale: [0.85, 1, 0.85] }}
          transition={reduce ? undefined : { duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: c.delay }}
        />
      ))}
      <div className={cn(BUBBLE, "flex items-center gap-2")}>
        <motion.span
          aria-hidden
          className="bg-clip-text font-medium text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(90deg, var(--lp-ink-3) 0%, var(--lp-ink-3) 38%, var(--lp-sky-deep) 50%, var(--lp-ink-3) 62%, var(--lp-ink-3) 100%)",
            backgroundSize: "250% 100%",
            backgroundPosition: "100% 0%",
          }}
          animate={reduce ? undefined : { backgroundPosition: ["100% 0%", "0% 0%"] }}
          transition={reduce ? undefined : { duration: 1.5, repeat: Infinity, ease: "linear" }}
        >
          Thinking
        </motion.span>
      </div>
    </motion.div>
  );
}

/* The pet under an open question, and what it says. It pops in as the row
   opens, thinks while an asked answer is on its way, talks for about as long
   as the words take, then rests. */
function Answer({ row }: { row: Row }) {
  const reduce = useReduce();
  const [ready, setReady] = useState(false);
  const [talking, setTalking] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), reduce ? 0 : BUBBLE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [reduce]);

  // Talk whenever there are new words, for about as long as they take.
  useEffect(() => {
    if (!ready || row.status !== "done") return;
    const words = row.a.split(/\s+/).length;
    const on = window.setTimeout(() => setTalking(true), 0);
    const off = window.setTimeout(() => setTalking(false), Math.min(2800, Math.max(900, words * 110)));
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [ready, row.status, row.a]);

  const level = useTalking(talking && !reduce);
  const state: PetState = !ready ? "arrive" : row.status === "thinking" ? "thinking" : row.status === "error" ? "puzzled" : talking ? "speaking" : "idle";
  const size = 84;

  return (
    <div className="flex items-start gap-5 pt-1 pb-7">
      <motion.div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.9 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={reduce ? { duration: 0.15 } : { ...POP, delay: PET_DELAY_S }}
      >
        {/* A shadow on the ground, so it stands somewhere rather than floats. */}
        <span aria-hidden className="absolute -bottom-1 left-1/2 h-2.5 w-[70%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(18,18,21,0.12),transparent)]" />
        <TutorPet shape="square" state={state} level={level} look={{ x: 0.7, y: 0.25 }} size={size} reduceMotion={!!reduce} />
      </motion.div>
      {/* The thought and the answer share one grid cell, so one can leave
          while the other arrives in the same place. */}
      <div className="grid min-w-0 flex-1 pt-1.5">
        <AnimatePresence initial={false}>
          {ready && row.status === "thinking" && <Thought key="thought" />}
          {ready && row.status !== "thinking" && <Speech key={`say-${row.a}`} text={row.a} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function Faq() {
  const reduce = useReduce();
  // The last thing the visitor asked, if anything: one row, replaced by the
  // next question rather than piling up.
  const [asked, setAsked] = useState<Row | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const turn = useRef(0);
  const baseId = useId();

  const rows = asked ? [...CURATED, asked] : CURATED;
  const toggle = (id: string) => setOpenId((open) => (open === id ? null : id));

  const ask = async (raw: string) => {
    const q = raw.replace(/\s+/g, " ").trim();
    if (q.length < 2 || busy) return;
    turn.current += 1;
    const mine = turn.current;
    setAsked({ id: ASKED_ID, q, a: "", status: "thinking" });
    setOpenId(ASKED_ID);
    setDraft("");
    setBusy(true);
    // A beat of thinking even when the answer is instant, so it reads as the
    // pet thinking rather than a flicker.
    const minThink = new Promise((r) => setTimeout(r, reduce ? 0 : 1100));
    let answer = "";
    let failed = false;
    try {
      const res = await fetch("/api/faq", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      answer = data.answer ?? data.error ?? "I couldn't answer that just now. Try again in a moment.";
      failed = !data.answer;
    } catch {
      answer = "I couldn't reach my notes just now. Check your connection and try again.";
      failed = true;
    }
    await minThink;
    setBusy(false);
    if (turn.current !== mine) return;
    setAsked({ id: ASKED_ID, q, a: answer, status: failed ? "error" : "done" });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };

  const canSend = !busy && draft.trim().length >= 2;

  return (
    <Section id="faq">
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <Label>FAQ</Label>
          <Title className="max-w-[14ch]">What people ask before trying it.</Title>
          <Lede>The tutor answers these itself. Ask it anything else at the bottom.</Lede>
        </Reveal>

        <Reveal delay={0.08}>
          <ul
            role="list"
            className="m-0 list-none border-t border-(--lp-line-strong) p-0"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpenId(null);
            }}
          >
            {rows.map((row) => {
              const open = openId === row.id;
              const panelId = `${row.id}-answer`;
              const isAsked = row.id === ASKED_ID;
              return (
                <motion.li
                  key={row.id}
                  initial={isAsked && !reduce ? { opacity: 0, height: 0 } : false}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ height: SIZE, opacity: { duration: 0.35, ease: EASE } }}
                  // Only the asked row clips: it grows in from nothing.
                  className={cn("border-b border-(--lp-line-strong)", isAsked && "overflow-hidden")}
                >
                  <h3 className="m-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => toggle(row.id)}
                      className="group flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) focus-visible:ring-inset sm:py-6"
                    >
                      {/* A new question swaps in over the last one. */}
                      <span className="grid min-w-0">
                        <AnimatePresence initial={false} mode="popLayout">
                          <motion.span
                            key={row.q}
                            initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)", y: 4 }}
                            animate={reduce ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)", y: 0 }}
                            exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)", y: -4 }}
                            transition={{ duration: 0.35, ease: EASE }}
                            className={cn(
                              "[grid-area:1/1] text-[17px] font-medium transition-colors duration-200 sm:text-[18px]",
                              open ? "text-(--lp-sky-deep)" : "text-(--lp-ink) group-hover:text-(--lp-sky-deep)",
                            )}
                          >
                            {row.q}
                          </motion.span>
                        </AnimatePresence>
                      </span>
                      <Cross open={open} />
                    </button>
                  </h3>

                  <AnimatePresence initial={false}>
                    {open && (
                      <div id={panelId} role="region" aria-label={row.q} key="answer">
                        <Grow>
                          <Answer row={row} />
                        </Grow>
                      </div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}

            {/* The row that never runs out. */}
            <li className="border-b border-(--lp-line-strong)">
              <form onSubmit={onSubmit} className="flex items-center gap-4 py-5 sm:py-6">
                <label htmlFor={`${baseId}-ask`} className="sr-only">
                  Ask the tutor anything else about Chalk
                </label>
                <input
                  id={`${baseId}-ask`}
                  value={draft}
                  maxLength={FAQ_QUESTION_MAX}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask anything else…"
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-[17px] font-medium text-(--lp-ink) outline-none placeholder:font-normal placeholder:text-(--lp-ink-3) sm:text-[18px]"
                />
                {/* Just the arrow. It fades in once there is something to
                    send and fades away, drifting on, the moment it is sent. */}
                <button
                  type="submit"
                  aria-label="Ask"
                  disabled={!canSend}
                  tabIndex={canSend ? 0 : -1}
                  className={cn(
                    "-m-2 inline-flex shrink-0 cursor-pointer items-center justify-center p-2 text-(--lp-ink) outline-none",
                    "transition-[opacity,translate,color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity",
                    "hover:text-(--lp-sky-deep) focus-visible:text-(--lp-sky-deep)",
                    canSend ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-2 opacity-0",
                  )}
                >
                  <ArrowRight size={20} strokeWidth={1.75} aria-hidden />
                </button>
              </form>
            </li>
          </ul>
        </Reveal>
      </Container>
    </Section>
  );
}
