"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { TranscriptList } from "@/components/session/TranscriptPanel";
import { SKILL_CATALOG } from "@/lib/skill-catalog";
import { cn } from "@/lib/utils";
import { SUMMARY_MOCKS } from "../../session/[id]/summary/mock";

// Five layouts for the summary, one content. Every one drops the grey: body
// text is ink, section titles are 17px semibold ink rather than 13px grey,
// and structure is carried by a real surface or a 2px ink rule instead of a
// 9% hairline. What differs is the shape of the page.

const P = SUMMARY_MOCKS.done;
const S = P.summary!;
/** Seconds into the session each problem opened: the real 13-minute homework session. */
const AT = [3, 172, 286, 430, 762];
const END = 780;
/** Titles that match what each borrowed landing picture actually shows. */
const TITLES = ["Solving 3(x − 2) = 12", "Graphing y = 2x + 1", "Where the parabola crosses", "Finding the hypotenuse", "Today's takeaway"];
const BOARDS = P.boards.map((b, i) => ({ ...b, title: TITLES[i] ?? b.title, at: AT[i] ?? 0, end: AT[i + 1] ?? END }));
type Board = (typeof BOARDS)[number];

const META = "Yesterday, 4:12 PM · 13 min";
const SKILL_LABEL = new Map(SKILL_CATALOG.map((s) => [s.key, s.label]));
const SKILLS = S.stats.skills.map((k) => SKILL_LABEL.get(k) ?? k);
const EASE = [0.16, 1, 0.3, 1] as const;

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

// ── Shared pieces ──────────────────────────────────────────────────────────

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1120px] px-5 pt-8 pb-32 sm:px-10 lg:px-14 lg:pt-12">
      <Link
        href="/"
        className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-[8px] px-2 text-[14px] font-medium text-(--lp-ink) outline-none hover:opacity-70 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
      >
        <ArrowLeft className="size-4" strokeWidth={2.25} aria-hidden />
        Home
      </Link>
      <div className="mt-6">{children}</div>
    </div>
  );
}

/** A solid deep-sky check for what clicked; an empty ink ring, "not yet", for what is shaky. */
function Mark({ kind }: { kind: "check" | "ring" }) {
  return kind === "check" ? (
    <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-(--lp-sky-deep)">
      <Check className="size-3.5 text-white" strokeWidth={3} />
    </span>
  ) : (
    <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center">
      <span className="size-[15px] rounded-full border-[2.5px] border-(--lp-ink)" />
    </span>
  );
}

function Items({ items, kind, className }: { items: string[]; kind: "check" | "ring"; className?: string }) {
  return (
    <ul className={cn("m-0 flex list-none flex-col gap-4 p-0", className)}>
      {items.map((item) => (
        <li key={item} className="flex gap-3.5">
          <Mark kind={kind} />
          <span className="min-w-0 text-[17px] leading-[1.5] text-(--lp-ink)">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A titled list under a 2px ink rule: the page's one structural line. */
function Column({ title, items, kind, className }: { title: string; items: string[]; kind: "check" | "ring"; className?: string }) {
  return (
    <section className={cn("border-t-2 border-(--lp-ink) pt-5", className)}>
      <h2 className="m-0 text-[17px] font-semibold text-(--lp-ink)">{title}</h2>
      <Items items={items} kind={kind} className="mt-5" />
    </section>
  );
}

function PracticeButton({ light, className }: { light?: boolean; className?: string }) {
  return (
    <button
      type="button"
      className={cn(
        light ? "btn-gloss-light" : "btn-gloss btn-gloss-lift",
        "inline-flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-[12px] px-5 text-[15px] font-medium outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
        className,
      )}
    >
      Start a practice session
      <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
    </button>
  );
}

/** The next step on ink: the one thing to do, set apart from everything that is only read. */
function NextCard({ className }: { className?: string }) {
  return (
    <section className={cn("flex flex-col rounded-[20px] bg-(--lp-ink) p-7 text-white", className)}>
      <h2 className="m-0 text-[15px] font-semibold text-white/70">Try this next</h2>
      <p className="m-0 mt-3 text-[19px] leading-[1.45]">{S.next}</p>
      <PracticeButton light className="mt-7 self-start" />
    </section>
  );
}

function BoardPic({ b, className }: { b: Board; className?: string }) {
  return (
    <span className={cn("flex items-center justify-center bg-white p-4", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={b.src} alt={`The board for ${b.title}`} className="max-h-full max-w-full object-contain" />
    </span>
  );
}

function BoardCard({ b, pic = "h-[240px]" }: { b: Board; pic?: string }) {
  return (
    <figure className="m-0 overflow-hidden rounded-[20px] border border-(--lp-line) bg-white">
      <BoardPic b={b} className={pic} />
      <figcaption className="flex items-baseline gap-2.5 border-t border-(--lp-line) px-5 py-3.5">
        <span className="text-[13px] text-(--lp-ink-2) tabular-nums">{b.index}</span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-(--lp-ink)">{b.title}</span>
        <span className="text-[13px] text-(--lp-ink-2) tabular-nums">{clock(b.at)}</span>
      </figcaption>
    </figure>
  );
}

function Conversation() {
  const [open, setOpen] = useState(false);
  const entries = P.turns.map((t, i) => ({ role: t.role, text: t.text, id: `t${i}`, at: t.at }));
  return (
    <section className="mt-16 border-t-2 border-(--lp-ink)">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 rounded-[10px] text-left outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
      >
        <span className="flex items-baseline gap-2.5">
          <span className="text-[17px] font-semibold text-(--lp-ink)">The conversation</span>
          <span className="text-[14px] text-(--lp-ink-2) tabular-nums">{entries.length} turns</span>
        </span>
        <ChevronDown className={cn("size-5 text-(--lp-ink) transition-transform duration-200", open && "rotate-180")} strokeWidth={2.25} aria-hidden />
      </button>
      {open && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE }} className="max-w-[62ch] pb-4">
          <TranscriptList transcript={entries} />
        </motion.div>
      )}
    </section>
  );
}

function Stat({ value, label, onDark, size = "text-[clamp(2rem,3.4vw,2.75rem)]" }: { value: ReactNode; label: string; onDark?: boolean; size?: string }) {
  return (
    <div className="flex flex-col-reverse gap-1.5">
      <dt className={cn("text-[14px]", onDark ? "text-white/70" : "text-(--lp-ink-2)")}>{label}</dt>
      <dd className={cn("lp-display m-0 leading-none tabular-nums", size)}>{value}</dd>
    </div>
  );
}

/** Keyboard and state for flipping through the problems. */
function useProblems() {
  const [i, setI] = useState(0);
  const go = (n: number) => setI(((n % BOARDS.length) + BOARDS.length) % BOARDS.length);
  return { i, b: BOARDS[i], go };
}

function Arrow({ dir, onClick, className }: { dir: -1 | 1; onClick: () => void; className?: string }) {
  const Icon = dir < 0 ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir < 0 ? "Previous problem" : "Next problem"}
      className={cn(
        "grid size-11 cursor-pointer place-items-center rounded-full bg-(--lp-ink) text-white outline-none transition-transform duration-150 hover:scale-[1.04] focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) active:scale-[0.96]",
        className,
      )}
    >
      <Icon className="size-5" strokeWidth={2.25} />
    </button>
  );
}

function Swap({ b, className }: { b: Board; className?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span key={b.src} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="contents">
        <BoardPic b={b} className={className} />
      </motion.span>
    </AnimatePresence>
  );
}

// ── 1. Verdict ─────────────────────────────────────────────────────────────
// The answer to "how did it go" on ink, the numbers beside it, the next step
// as a sky band right under it. The reading comes after.

function Verdict() {
  return (
    <Page>
      <section className="rounded-[20px] bg-(--lp-ink) p-7 text-white sm:p-10 lg:grid lg:grid-cols-[minmax(0,1fr)_200px] lg:gap-14">
        <div>
          <p className="m-0 text-[14px] text-white/70">{META}</p>
          <h1 className="lp-display m-0 mt-5 max-w-[18ch] text-[clamp(2.25rem,4.6vw,3.5rem)] leading-[1.02] text-balance">{S.headline}</h1>
          <p className="m-0 mt-5 max-w-[54ch] text-[18px] leading-[1.55] text-white/85">{S.recap}</p>
        </div>
        <dl className="m-0 mt-9 grid grid-cols-3 gap-4 border-t border-white/15 pt-7 lg:mt-1 lg:grid-cols-1 lg:content-start lg:gap-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
          <Stat onDark value="5/6" label="answers right" />
          <Stat onDark value="2" label="with no hints" />
          <Stat onDark value="5" label="problems" />
        </dl>
      </section>

      <section className="mt-4 flex flex-col gap-6 rounded-[20px] bg-(--lp-sky) p-7 sm:p-9 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="m-0 text-[15px] font-semibold text-(--lp-ink)">Try this next</h2>
          <p className="m-0 mt-3 max-w-[44ch] text-[clamp(1.25rem,2vw,1.5rem)] leading-[1.35] text-(--lp-ink)">{S.next}</p>
        </div>
        <PracticeButton />
      </section>

      <div className="mt-16 grid gap-12 md:grid-cols-2 md:gap-10">
        <Column title="What clicked" items={S.wins} kind="check" />
        <Column title="Still shaky" items={S.stuck} kind="ring" />
      </div>

      <section className="mt-16">
        <h2 className="m-0 text-[17px] font-semibold text-(--lp-ink)">Your boards</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {BOARDS.map((b) => (
            <BoardCard key={b.src} b={b} />
          ))}
        </div>
      </section>
      <Conversation />
    </Page>
  );
}

// ── 2. Chapters ────────────────────────────────────────────────────────────
// The session as a timeline. Each problem is a segment as long as it took;
// pick one and its board fills the stage. The boards stop being a strip of
// thumbnails and become the story of the session.

function Chapters() {
  const { i, b, go } = useProblems();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (n: number) => {
    const next = ((n % BOARDS.length) + BOARDS.length) % BOARDS.length;
    go(next);
    tabs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") move(i + 1);
    else if (e.key === "ArrowLeft") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(BOARDS.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <Page>
      <header>
        <p className="m-0 text-[14px] text-(--lp-ink-2)">{META}</p>
        <h1 className="lp-display m-0 mt-4 max-w-[20ch] text-[clamp(2.25rem,4.4vw,3.5rem)] leading-[1.02] text-balance text-(--lp-ink)">{S.headline}</h1>
        <p className="m-0 mt-5 max-w-[60ch] text-[19px] leading-[1.55] text-(--lp-ink)">{S.recap}</p>
        <p className="m-0 mt-6 flex flex-wrap gap-x-6 gap-y-1.5 text-[16px] text-(--lp-ink) tabular-nums">
          <span className="font-semibold">5 of 6 answers right</span>
          <span className="font-semibold">2 with no hints</span>
          <span>Worked on {SKILLS.map((s) => s.toLowerCase()).join(" and ")}</span>
        </p>
      </header>

      <section className="mt-14" aria-label="The session, problem by problem">
        <div role="tablist" aria-label="Problems" onKeyDown={onKey} className="flex gap-1.5">
          {BOARDS.map((c, n) => (
            <button
              key={c.src}
              ref={(el) => {
                tabs.current[n] = el;
              }}
              type="button"
              role="tab"
              aria-selected={n === i}
              tabIndex={n === i ? 0 : -1}
              onClick={() => go(n)}
              style={{ flexGrow: Math.max(c.end - c.at, 90) }}
              className="group min-w-0 basis-0 cursor-pointer rounded-[8px] pt-1 pb-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
            >
              <span
                className={cn(
                  "block h-2.5 rounded-full transition-colors duration-150",
                  n === i ? "bg-(--lp-ink)" : "bg-(--lp-gray-2) group-hover:bg-(--lp-ink)/30",
                )}
              />
              <span className={cn("mt-3 hidden truncate text-[14px] md:block", n === i ? "font-semibold text-(--lp-ink)" : "font-medium text-(--lp-ink-2)")}>{c.title}</span>
              <span className="mt-0.5 block text-[12.5px] text-(--lp-ink-2) tabular-nums">{clock(c.at)}</span>
            </button>
          ))}
        </div>

        <figure className="m-0 mt-4 overflow-hidden rounded-[20px] border border-(--lp-line) bg-white">
          <div className="relative">
            <Swap b={b} className="h-[clamp(240px,40vw,460px)] p-8" />
            <Arrow dir={-1} onClick={() => go(i - 1)} className="absolute top-1/2 left-4 hidden -translate-y-1/2 md:grid" />
            <Arrow dir={1} onClick={() => go(i + 1)} className="absolute top-1/2 right-4 hidden -translate-y-1/2 md:grid" />
          </div>
          <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-(--lp-line) px-6 py-4">
            <span className="text-[18px] font-semibold text-(--lp-ink)">
              <span className="mr-2.5 text-(--lp-ink-2) tabular-nums">{b.index}</span>
              {b.title}
            </span>
            <span className="text-[14px] text-(--lp-ink-2) tabular-nums">
              {clock(b.at)} to {clock(b.end)}
            </span>
          </figcaption>
        </figure>
      </section>

      <section className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px] lg:gap-8">
        <Column title="What clicked" items={S.wins} kind="check" />
        <Column title="Still shaky" items={S.stuck} kind="ring" />
        <NextCard className="self-start" />
      </section>
      <Conversation />
    </Page>
  );
}

// ── 3. Bento ───────────────────────────────────────────────────────────────
// Tiles of different weight: ink for the verdict, sky for the score, the
// board as the biggest tile, the next step on grey, the notes on white.

function Bento() {
  const { i, b, go } = useProblems();
  return (
    <Page>
      <div className="grid gap-4 lg:grid-cols-12">
        <section className="rounded-[20px] bg-(--lp-ink) p-8 text-white sm:p-10 lg:col-span-8">
          <p className="m-0 text-[14px] text-white/70">{META}</p>
          <h1 className="lp-display m-0 mt-5 max-w-[20ch] text-[clamp(2rem,3.8vw,3rem)] leading-[1.04] text-balance">{S.headline}</h1>
          <p className="m-0 mt-5 max-w-[56ch] text-[17px] leading-[1.55] text-white/85">{S.recap}</p>
        </section>

        <section className="flex flex-col justify-between gap-8 rounded-[20px] bg-(--lp-sky) p-8 text-(--lp-ink) lg:col-span-4">
          <h2 className="m-0 text-[15px] font-semibold">Answers right</h2>
          <p className="lp-display m-0 text-[clamp(4.5rem,8vw,6rem)] leading-[0.85] tabular-nums">
            5<span className="text-[0.5em]">/6</span>
          </p>
          <p className="m-0 border-t border-(--lp-ink)/20 pt-4 text-[16px] font-medium">2 of them with no hints first</p>
        </section>

        <figure className="m-0 overflow-hidden rounded-[20px] border border-(--lp-line) bg-white lg:col-span-7">
          <Swap b={b} className="h-[300px] p-6" />
          <figcaption className="flex items-center gap-3 border-t border-(--lp-line) py-3 pr-3 pl-6">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-semibold text-(--lp-ink)">{b.title}</span>
              <span className="block text-[13px] text-(--lp-ink-2) tabular-nums">
                Problem {b.index} of {BOARDS.length} · {clock(b.at)}
              </span>
            </span>
            <Arrow dir={-1} onClick={() => go(i - 1)} />
            <Arrow dir={1} onClick={() => go(i + 1)} />
          </figcaption>
        </figure>

        <section className="flex flex-col rounded-[20px] bg-(--lp-gray) p-8 lg:col-span-5">
          <h2 className="m-0 text-[15px] font-semibold text-(--lp-ink)">Try this next</h2>
          <p className="m-0 mt-3 text-[20px] leading-[1.4] text-(--lp-ink)">{S.next}</p>
          <PracticeButton className="mt-8 self-start lg:mt-auto" />
        </section>

        <section className="rounded-[20px] border border-(--lp-line) p-8 lg:col-span-6">
          <h2 className="m-0 text-[17px] font-semibold text-(--lp-ink)">What clicked</h2>
          <Items items={S.wins} kind="check" className="mt-5" />
        </section>
        <section className="flex flex-col rounded-[20px] border border-(--lp-line) p-8 lg:col-span-6">
          <h2 className="m-0 text-[17px] font-semibold text-(--lp-ink)">Still shaky</h2>
          <Items items={S.stuck} kind="ring" className="mt-5" />
          <p className="m-0 mt-auto flex flex-wrap gap-2 pt-7">
            {SKILLS.map((s) => (
              <span key={s} className="rounded-full bg-(--lp-ink) px-3 py-1.5 text-[13px] font-medium text-white">
                {s}
              </span>
            ))}
          </p>
        </section>
      </div>
      <Conversation />
    </Page>
  );
}

// ── 4. Split ───────────────────────────────────────────────────────────────
// The note pinned on the left, the work scrolling on the right: every board,
// large, in order. What it means beside what happened.

function Split() {
  return (
    <Page>
      <div className="lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-14">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <p className="m-0 text-[14px] text-(--lp-ink-2)">{META}</p>
          <h1 className="lp-display m-0 mt-4 text-[clamp(2rem,3.2vw,2.625rem)] leading-[1.05] text-balance text-(--lp-ink)">{S.headline}</h1>
          <p className="m-0 mt-4 text-[17px] leading-[1.55] text-(--lp-ink)">{S.recap}</p>
          <dl className="m-0 mt-7 grid grid-cols-3 border-y-2 border-(--lp-ink) py-5">
            <Stat value="5/6" label="right" size="text-[30px]" />
            <Stat value="2" label="no hints" size="text-[30px]" />
            <Stat value="5" label="problems" size="text-[30px]" />
          </dl>
          <NextCard className="mt-7" />
        </aside>

        <div className="mt-14 lg:mt-0">
          <h2 className="m-0 text-[17px] font-semibold text-(--lp-ink)">Your boards, in order</h2>
          <ol className="m-0 mt-5 flex list-none flex-col gap-6 p-0">
            {BOARDS.map((b) => (
              <li key={b.src}>
                <BoardCard b={b} pic="h-[clamp(220px,30vw,340px)]" />
              </li>
            ))}
          </ol>
          <div className="mt-16 grid gap-12 md:grid-cols-2 md:gap-8">
            <Column title="What clicked" items={S.wins} kind="check" />
            <Column title="Still shaky" items={S.stuck} kind="ring" />
          </div>
          <Conversation />
        </div>
      </div>
    </Page>
  );
}

// ── 5. Report ──────────────────────────────────────────────────────────────
// One column, contrast from type alone: a big headline, the recap as a lede,
// the numbers as a ledger between heavy rules, the next step set as the
// page's pull quote. No dark surface anywhere.

function Report() {
  const cell = "flex flex-col-reverse gap-2 py-6 md:px-6 md:first:pl-0 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-(--lp-ink)/15 max-md:[&:nth-child(n+3)]:border-t max-md:[&:nth-child(n+3)]:border-(--lp-ink)/15";
  return (
    <Page>
      <header className="max-w-[900px]">
        <p className="m-0 text-[14px] text-(--lp-ink-2)">{META}</p>
        <h1 className="lp-display m-0 mt-5 text-[clamp(2.5rem,5.6vw,4.25rem)] leading-[0.98] tracking-[-0.03em] text-balance text-(--lp-ink)">{S.headline}</h1>
        <p className="m-0 mt-7 max-w-[52ch] text-[clamp(1.125rem,1.7vw,1.375rem)] leading-[1.5] text-(--lp-ink)">{S.recap}</p>
      </header>

      <dl className="m-0 mt-12 grid grid-cols-2 border-y-2 border-(--lp-ink) md:grid-cols-4">
        {[
          ["5/6", "answers right"],
          ["2", "with no hints"],
          ["5", "problems"],
          ["13", "minutes"],
        ].map(([v, l]) => (
          <div key={l} className={cell}>
            <dt className="text-[14px] text-(--lp-ink-2)">{l}</dt>
            <dd className="lp-display m-0 text-[clamp(2.25rem,4vw,3rem)] leading-none text-(--lp-ink) tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-16 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <h2 className="m-0 text-[17px] font-semibold text-(--lp-ink)">Try this next</h2>
        <div>
          <p className="lp-display m-0 max-w-[30ch] text-[clamp(1.5rem,2.6vw,2.125rem)] leading-[1.22] text-(--lp-ink)">{S.next}</p>
          <PracticeButton className="mt-8" />
        </div>
      </section>

      <div className="mt-16 grid gap-12 md:grid-cols-2 md:gap-10">
        <Column title="What clicked" items={S.wins} kind="check" />
        <Column title="Still shaky" items={S.stuck} kind="ring" />
      </div>

      <section className="mt-16 border-t-2 border-(--lp-ink) pt-5">
        <h2 className="m-0 text-[17px] font-semibold text-(--lp-ink)">Your boards</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BOARDS.map((b) => (
            <BoardCard key={b.src} b={b} pic="h-[200px]" />
          ))}
        </div>
      </section>
      <Conversation />
    </Page>
  );
}

export const DIRECTIONS = [
  { name: "Verdict", Component: Verdict },
  { name: "Chapters", Component: Chapters },
  { name: "Bento", Component: Bento },
  { name: "Split", Component: Split },
  { name: "Report", Component: Report },
];
