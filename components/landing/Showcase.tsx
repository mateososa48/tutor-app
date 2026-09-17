"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { BookmarkCheck, Check, Gauge, ImageUp, Lightbulb } from "lucide-react";
import { DotPattern } from "@/components/ui/dot-pattern";
import { FilesPanel } from "@/components/session/FilesPopover";
import type { UploadedFile } from "@/lib/file-processor";
import { SESSION_LANGUAGES } from "@/lib/session-intake";
import { TUTOR_SPEEDS } from "@/lib/voice-settings";
import { cn } from "@/lib/utils";
import { BoardShot, T, Transcript, line, rise } from "./Fragments";
import { Container, EASE, Label, Lede, Reveal, Section, Title } from "./Section";
import { SHOTS } from "./shots.generated";
import { useReduce, useScript } from "./useScript";

// Four things a session does, as tabs that take turns on their own: a list on
// the left with a sky line filling under the open one, a big panel on the
// right that changes with it. Each panel is a small scene of two real pieces,
// anchored to opposite corners and overlapping, not two cards floating in a
// box. Hovering or focusing the list holds the turn; a click picks a tab and
// restarts the clock.

const TURN_MS = 7000;

type TabId = "hints" | "worksheet" | "memory" | "pace";

const TABS: { id: TabId; icon: typeof Lightbulb; title: string; body: string }[] = [
  { id: "hints", icon: Lightbulb, title: "Hints before answers", body: "Your attempt goes on the board first. Then the smallest nudge that gets you moving again." },
  { id: "worksheet", icon: ImageUp, title: "Snap the worksheet", body: "Photo or PDF in. It reads the page, asks which problem, and puts that one on the board." },
  { id: "memory", icon: BookmarkCheck, title: "It remembers what clicked", body: "Notes carry over between sessions, so next week starts from what worked." },
  { id: "pace", icon: Gauge, title: "Your pace, your language", body: "Five speaking speeds and thirteen languages. Change either mid-sentence." },
];

/* ── Panels ─────────────────────────────────────────────────────────────── */

// The scripts live at module level: useScript re-runs when its steps change,
// so an array built inside the component would restart the clock every render.
const HINTS_SCRIPT = [
  { at: 0, key: "board" },
  { at: 2400, key: "hint" },
] as const;
const WORKSHEET_SCRIPT = [
  { at: 0, key: "file" },
  { at: 1500, key: "board" },
] as const;
const MEMORY_SCRIPT = [
  { at: 0, key: "n1" },
  { at: 800, key: "n2" },
  { at: 1600, key: "n3" },
  { at: 2800, key: "next" },
] as const;
const PACE_SCRIPT = [
  { at: 0, key: "speed" },
  { at: 900, key: "langs" },
] as const;

// Below sm the pieces stack; from sm they sit in the panel's corners.
const SCENE = "flex flex-col gap-4 sm:block sm:h-full";
const CARD = "rounded-[18px] border border-(--lp-line-strong) bg-white px-5 py-4 shadow-(--lp-shadow-card)";

function PanelHints() {
  const { fired } = usePanelScript(HINTS_SCRIPT);
  return (
    <div className={SCENE}>
      <BoardShot
        shot={SHOTS.hint}
        width={400}
        shown={fired("board")}
        alt="The board: 2x = 8, the student's try x = 16 in their own hand, and x = 16 crossed out in red."
        className="shadow-(--lp-shadow-card) sm:absolute sm:top-8 sm:left-8"
      />
      <Transcript
        entries={[line("student", "16?"), line("tutor", "Close. Two times x is eight. Multiply by two, or divide?", "t")]}
        shown={fired("hint")}
        className="sm:absolute sm:right-8 sm:bottom-8 sm:w-[300px]"
      />
    </div>
  );
}

const WORKSHEET: UploadedFile = { id: "w1", label: "File 1", name: "algebra-hw.jpg", mimeType: "image/jpeg", base64: "" };

function PanelWorksheet() {
  const { fired } = usePanelScript(WORKSHEET_SCRIPT);
  const [files, setFiles] = useState<UploadedFile[]>([WORKSHEET]);
  return (
    <div className={SCENE}>
      <motion.div
        initial={false}
        animate={rise(fired("file"))}
        transition={T}
        className="rounded-[16px] border border-(--lp-line-strong) bg-white p-2 shadow-(--lp-shadow-card) sm:absolute sm:top-8 sm:left-8 sm:w-[300px]"
      >
        <FilesPanel files={files} onAddFiles={(added) => setFiles((f) => [...f, ...added])} onRemoveFile={(id) => setFiles((f) => f.filter((x) => x.id !== id))} />
      </motion.div>
      <BoardShot
        shot={SHOTS.worksheet}
        width={380}
        shown={fired("board")}
        alt="The board: Problem 4, then 5x + 2 = 17 marked from the worksheet."
        className="shadow-(--lp-shadow-card) sm:absolute sm:right-8 sm:bottom-8"
      />
    </div>
  );
}

const NOTES = ["Got factoring after the area-model picture", "Mixes up which side to undo first", "Likes to try a step before hearing a hint"];

function PanelMemory() {
  const { fired } = usePanelScript(MEMORY_SCRIPT);
  const count = (["n1", "n2", "n3"] as const).filter((k) => fired(k)).length;
  return (
    <div className={SCENE}>
      <div className={cn(CARD, "sm:absolute sm:top-8 sm:left-8 sm:w-[380px]")}>
        <p className="mb-2.5 text-[11px] font-semibold tracking-[0.04em] text-(--lp-ink-3)">Tutor notes</p>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {NOTES.map((n, i) => (
            <motion.li key={n} initial={false} animate={rise(i < count)} transition={T} className="flex items-start gap-2.5 text-[15px] leading-[1.45] text-(--lp-ink)">
              <span className="mt-[3px] inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-(--lp-sky-soft) text-(--lp-sky-deep)">
                <Check size={10} strokeWidth={3} aria-hidden />
              </span>
              {n}
            </motion.li>
          ))}
        </ul>
      </div>
      <motion.div initial={false} animate={rise(fired("next"))} transition={T} className={cn(CARD, "sm:absolute sm:right-8 sm:bottom-8 sm:w-[300px]")}>
        <p className="text-[11px] font-semibold tracking-[0.04em] text-(--lp-ink-3)">Next session</p>
        <p className="mt-1 text-[15px] leading-[1.45] text-(--lp-ink)">Picks up at factoring, with the area model. Starts with one you can already do.</p>
      </motion.div>
    </div>
  );
}

function PanelPace() {
  const { fired } = usePanelScript(PACE_SCRIPT);
  return (
    <div className={SCENE}>
      <motion.div initial={false} animate={rise(fired("speed"))} transition={T} className={cn(CARD, "sm:absolute sm:top-8 sm:left-8 sm:w-[440px]")}>
        <p className="mb-3 text-[11px] font-semibold tracking-[0.04em] text-(--lp-ink-3)">Speaking speed</p>
        <div className="grid grid-cols-5 gap-1.5" role="img" aria-label="Five speaking speeds from Slowest to Very fast, Slow selected">
          {TUTOR_SPEEDS.map((s) => (
            <span
              key={s.id}
              className={cn(
                "flex h-9 items-center justify-center rounded-[8px] px-1 text-[11px] font-medium whitespace-nowrap sm:text-[12.5px]",
                s.id === "slow" ? "bg-(--lp-sky) text-white" : "bg-(--lp-gray) text-(--lp-ink-2)",
              )}
            >
              {s.label}
            </span>
          ))}
        </div>
      </motion.div>
      <motion.div initial={false} animate={rise(fired("langs"))} transition={T} className={cn(CARD, "sm:absolute sm:right-8 sm:bottom-8 sm:w-[420px]")}>
        <p className="mb-3 text-[11px] font-semibold tracking-[0.04em] text-(--lp-ink-3)">Language</p>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {SESSION_LANGUAGES.map((l) => (
            <li
              key={l.code}
              lang={l.code}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12.5px] font-medium",
                l.code === "en" ? "border-(--lp-sky) bg-(--lp-sky-soft) text-(--lp-sky-deep)" : "border-(--lp-line-strong) text-(--lp-ink-2)",
              )}
            >
              {l.label}
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}

const PANELS: Record<TabId, () => ReactNode> = {
  hints: PanelHints,
  worksheet: PanelWorksheet,
  memory: PanelMemory,
  pace: PanelPace,
};

/* Each panel plays its little script once when it mounts (a tab change mounts
   a fresh panel), and shows its final frame under reduced motion. */
function usePanelScript<K extends string>(steps: readonly { at: number; key: K }[]) {
  const reduce = useReduce();
  return useScript(steps, 60_000, true, reduce);
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */

export function Showcase() {
  const reduce = useReduce();
  const base = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { margin: "-20% 0px" });
  const [active, setActive] = useState(0);
  const [turn, setTurn] = useState(0);
  const [held, setHeld] = useState(false);

  // The clock: one turn per tab while the section is on screen and nobody is
  // holding it. A click restarts the turn (the `turn` key remounts the fill).
  const running = inView && !held;
  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => {
      setActive((a) => (a + 1) % TABS.length);
      setTurn((t) => t + 1);
    }, TURN_MS);
    return () => clearTimeout(id);
  }, [running, active, turn]);

  const pick = (i: number) => {
    setActive(i);
    setTurn((t) => t + 1);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = (active + (e.key === "ArrowDown" ? 1 : -1) + TABS.length) % TABS.length;
    pick(next);
    listRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  };

  const Panel = PANELS[TABS[active].id];

  return (
    <Section id="capabilities">
      <Container>
        <Reveal>
          <Label>What it does</Label>
          <Title className="max-w-[18ch]">Everything else a session does.</Title>
          <Lede>What happens around the board, and what carries over to next week.</Lede>
        </Reveal>

        <Reveal delay={0.1} amount={0.15}>
          <div ref={rootRef} className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1.32fr)] lg:gap-10">
            <div
              ref={listRef}
              role="tablist"
              aria-orientation="vertical"
              aria-label="What Chalk does"
              onKeyDown={onKey}
              onPointerEnter={() => setHeld(true)}
              onPointerLeave={() => setHeld(false)}
              onFocus={() => setHeld(true)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
              }}
              className="flex flex-col gap-1.5"
            >
              {TABS.map((tab, i) => {
                const on = i === active;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`${base}-tab-${tab.id}`}
                    aria-selected={on}
                    aria-controls={`${base}-panel`}
                    tabIndex={on ? 0 : -1}
                    onClick={() => pick(i)}
                    className={cn(
                      "group relative w-full cursor-pointer overflow-hidden rounded-[14px] border px-4 py-3.5 text-left outline-none transition-[background-color,border-color,box-shadow] duration-200 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
                      on ? "border-(--lp-line-strong) bg-white shadow-(--lp-shadow-card)" : "border-transparent hover:bg-(--lp-gray)",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon
                        size={19}
                        strokeWidth={2}
                        aria-hidden
                        className={cn("shrink-0 transition-colors duration-200", on ? "text-(--lp-sky-deep)" : "text-(--lp-ink-3) group-hover:text-(--lp-ink-2)")}
                      />
                      <span className={cn("text-[16px] font-medium", on ? "text-(--lp-ink)" : "text-(--lp-ink-2)")}>{tab.title}</span>
                    </span>
                    <AnimatePresence initial={false}>
                      {on && (
                        <motion.span
                          key="body"
                          initial={reduce ? false : { height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.32, ease: EASE }}
                          className="block overflow-hidden"
                        >
                          <span className="block pt-2 pl-8 text-[14px] leading-[1.5] text-(--lp-ink-2)">{tab.body}</span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {on && (
                      <span
                        key={turn}
                        aria-hidden
                        data-paused={held ? "" : undefined}
                        className="lp-tab-fill absolute inset-x-0 bottom-0 h-[2px] bg-(--lp-sky)"
                        style={{ "--turn": `${TURN_MS}ms` } as CSSProperties}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div
              id={`${base}-panel`}
              role="tabpanel"
              aria-labelledby={`${base}-tab-${TABS[active].id}`}
              className="relative overflow-hidden rounded-[24px] border border-(--lp-line) p-5 sm:h-[460px] sm:p-0 lg:h-[500px]"
              style={{ background: "radial-gradient(90% 70% at 100% 0%, rgba(61,156,255,0.16), transparent 60%), linear-gradient(180deg, #f3f8ff, #fbfbfc)" }}
            >
              <DotPattern width={22} height={22} cr={1} className="text-(--lp-gray-2) [mask-image:radial-gradient(70%_70%_at_50%_50%,#000,transparent)]" />
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={TABS[active].id}
                  initial={reduce ? false : { opacity: 0, y: 14, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(4px)", transition: { duration: 0.22, ease: "easeIn" } }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="relative sm:absolute sm:inset-0"
                >
                  <Panel />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
