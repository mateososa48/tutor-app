"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ChalkMark } from "@/components/app/ChalkMark";
import { TranscriptList } from "@/components/session/TranscriptPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { SKILL_CATALOG } from "@/lib/skill-catalog";
import { formatDuration, formatRelativeDate } from "@/lib/sessions";
import { useClientReady } from "@/lib/client-ready";
import type { TranscriptEntry } from "@/lib/live-types";
import type { SessionSummary } from "@/lib/session-summary";
import { cn } from "@/lib/utils";
import { SUMMARY_MOCKS, type MockPayload } from "./mock";

// What you see when a session ends, and when you open a past one.
//
// The note and the record. One column in the home page's language (its
// container, its hairlines, its one 20px surface, its type) but not its grid:
// this is a note from the tutor with the evidence beside it, not a dashboard.
// The boards are the student's own work in the order it happened, one per
// problem; the note is prose on the page, the way Settings is a note to the
// tutor; the conversation is at the bottom for whoever wants the whole thing.

const CARD = "rounded-[20px] border border-(--lp-line) bg-(--lp-surface)";
const EASE = [0.16, 1, 0.3, 1] as const;
/** One measure for every block of prose on the page. */
const PROSE = "max-w-[62ch]";

const DOTS = {
  backgroundImage: "radial-gradient(rgba(18,18,21,0.10) 1px, transparent 1.2px)",
  backgroundSize: "9px 9px",
  backgroundPosition: "4px 4px",
} as const;

const SKILL_LABEL = new Map(SKILL_CATALOG.map((s) => [s.key, s.label]));

type Payload = { summary: SessionSummary | null; state: string; sessionStatus: string; title: string; startedAt: number; durationSec: number };
type Board = { index: number; title: string; src: string };
type Turn = { role: "tutor" | "student"; text: string; at: number };

/** While a summary is being written, and how often to look. */
const POLL_MS = 3000;
const POLL_LIMIT = 40;

export function SummaryClient({ id }: { id: string }) {
  const router = useRouter();
  // Dev-only design preview: `?mock=done|short|pending|failed|noboard` renders
  // canned data and never touches the database, the way `/session?mock=1`
  // previews the live screen. Stripped from a production build.
  const mockName = useSearchParams().get("mock");
  const mock: MockPayload | null = process.env.NODE_ENV === "production" || !mockName ? null : (SUMMARY_MOCKS[mockName] ?? SUMMARY_MOCKS.done);

  const mounted = useClientReady();
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [boards, setBoards] = useState<Board[] | null>(() => mock?.boards ?? null);
  const polls = useRef(0);

  const load = useCallback(async (): Promise<Payload | null> => {
    if (mock) {
      setData(mock);
      setFailed(false);
      return mock;
    }
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/summary`);
      if (res.status === 404) {
        router.replace("/");
        return null;
      }
      if (!res.ok) throw new Error(`load ${res.status}`);
      const next = (await res.json()) as Payload;
      setData(next);
      setFailed(false);
      return next;
    } catch {
      setFailed(true);
      return null;
    }
  }, [id, router, mock]);

  // The note is written after the session ends, so the first look often lands
  // on "pending": read, and keep reading until it arrives or the tries run out.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const next = await load();
      if (!live) return;
      if (next?.state === "pending" && !next.summary && polls.current < POLL_LIMIT) {
        polls.current += 1;
        timer = setTimeout(() => void tick(), POLL_MS);
      }
    };
    timer = setTimeout(() => void tick(), 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [load]);

  // The boards are the session's own record and never wait on the model.
  useEffect(() => {
    if (mock) return;
    let live = true;
    fetch(`/api/sessions/${encodeURIComponent(id)}/boards`)
      .then((res) => (res.ok ? res.json() : { boards: [] }))
      .then((json: { boards: Array<{ index: number; title: string; frameId: number }> }) => {
        if (!live) return;
        setBoards(json.boards.map((b) => ({ index: b.index, title: b.title, src: `/api/sessions/${encodeURIComponent(id)}/frames?frame=${b.frameId}` })));
      })
      .catch(() => live && setBoards([]));
    return () => {
      live = false;
    };
  }, [id, mock]);

  const write = async () => {
    setRetrying(true);
    polls.current = 0;
    await fetch(`/api/sessions/${encodeURIComponent(id)}/summary`, { method: "POST" }).catch(() => {});
    await load();
    setRetrying(false);
  };

  const summary = data?.summary ?? null;
  const waiting = !data || (data.state === "pending" && !summary);
  const broken = failed || (data?.state === "failed" && !summary);
  // An ended session from before summaries existed: nothing queued, nothing failed.
  const unwritten = !waiting && !broken && !summary;

  return (
    <AppShell defaultOpen>
      <MotionConfig reducedMotion="user">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1080px] px-6 pt-10 pb-24 sm:px-10 lg:px-14 lg:pt-14">
            <Link
              href="/"
              className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
            >
              <ArrowLeft className="size-4" strokeWidth={2.25} aria-hidden />
              Home
            </Link>

            <Header data={data} summary={summary} waiting={waiting} mounted={mounted} />

            {/* What it means first, then the work it came from. */}
            {broken || unwritten ? (
              <Unwritten kind={broken ? "failed" : "none"} onWrite={write} busy={retrying} />
            ) : (
              <Note summary={summary} waiting={waiting} onPractice={(topic) => router.push(`/session?topic=${encodeURIComponent(topic)}`)} />
            )}

            <Boards id={id} boards={boards} />

            <Conversation id={id} mock={mock} />
          </div>
        </div>
      </MotionConfig>
    </AppShell>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────

function Header({ data, summary, waiting, mounted }: { data: Payload | null; summary: SessionSummary | null; waiting: boolean; mounted: boolean }) {
  const when = data?.startedAt && mounted ? formatRelativeDate(data.startedAt) : "";
  const long = data?.durationSec ? formatDuration(data.durationSec) : "";
  const meta = [when, long].filter(Boolean).join(" · ");
  // With no note, the heading is the session's own name.
  const fallback = data?.title && data.title !== "Session" ? data.title : "Your session";

  return (
    <header className="mt-5">
      <p className="m-0 min-h-5 text-[13px] text-(--lp-ink-3)">{meta || " "}</p>
      {!data ? (
        <Skeleton className="mt-4 h-[42px] w-4/5 max-w-[520px] rounded-[10px]" />
      ) : (
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="lp-display m-0 mt-4 max-w-[22ch] text-[clamp(2rem,3.4vw,2.6rem)] leading-[1.05] text-balance text-(--lp-ink)"
        >
          {summary?.headline ?? fallback}
        </motion.h1>
      )}
      {waiting ? (
        <p className="m-0 mt-3 flex items-center gap-2 text-[15px] text-(--lp-ink-2)">
          <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          Writing your summary
        </p>
      ) : (
        summary && (
          <>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.06, ease: EASE }}
              className={cn(PROSE, "m-0 mt-2.5 text-[16px] leading-[1.55] text-(--lp-ink-2)")}
            >
              {summary.recap}
            </motion.p>
            <Facts stats={summary.stats} />
          </>
        )
      )}
    </header>
  );
}

/** The counts we computed, as one quiet line. Only what exists is said. */
function Facts({ stats }: { stats: SessionSummary["stats"] }) {
  const parts: ReactNode[] = [];
  if (stats.checked > 0) {
    parts.push(
      <span key="right" className="font-medium text-(--lp-ink)">
        {stats.correct} of {stats.checked} answers right
      </span>,
    );
  }
  if (stats.independent > 0) {
    parts.push(
      <span key="alone" className="font-medium text-(--lp-ink)">
        {stats.independent} with no hints
      </span>,
    );
  }
  // The skills as a clause, not a list: on their own, two bare labels under
  // the recap said nothing about what they were. They come from checked
  // answers, so "worked on" is what they mean.
  if (stats.skills.length > 0) parts.push(<span key="skills">Worked on {skillsClause(stats.skills)}</span>);
  if (parts.length === 0) return null;
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.12 }}
      className="m-0 mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[14px] leading-[1.5] text-(--lp-ink-2) tabular-nums"
    >
      {parts.map((part, i) => (
        <span key={i} className="inline-flex items-baseline gap-x-2">
          {i > 0 && (
            <span aria-hidden className="text-(--lp-ink-3)">
              ·
            </span>
          )}
          {part}
        </span>
      ))}
    </motion.p>
  );
}

/** "equations with variables on both sides and the distributive property" */
function skillsClause(keys: string[]): string {
  const names = keys.map((key) => {
    const label = SKILL_LABEL.get(key) ?? key;
    return label.charAt(0).toLowerCase() + label.slice(1);
  });
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ── The boards, one per problem ────────────────────────────────────────────

/** Card width and the gap between cards; the arrows step by their sum. */
const BOARD_W = "w-[min(420px,78vw)]";
const GAP = 16;

function Boards({ id, boards }: { id: string; boards: Board[] | null }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, boards]);

  const step = (dir: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    const card = el.querySelector("figure");
    el.scrollBy({ left: dir * ((card?.clientWidth ?? 420) + GAP), behavior: "smooth" });
  };

  const count = boards?.length ?? 0;
  const scrollable = edges.left || edges.right;

  return (
    <section className="mt-16" aria-labelledby="boards-heading">
      <div className="flex items-center justify-between gap-4">
        <h2 id="boards-heading" className="m-0 flex items-baseline gap-2 text-[15px] font-medium text-(--lp-ink-2)">
          {count === 1 ? "Your board" : "Your boards"}
          {count > 1 && <span className="text-[13px] text-(--lp-ink-3) tabular-nums">{count}</span>}
        </h2>
        <div className="flex items-center gap-1">
          {scrollable && (
            <span className="mr-2 hidden items-center gap-1 md:flex">
              <Arrow dir={-1} disabled={!edges.left} onClick={() => step(-1)} />
              <Arrow dir={1} disabled={!edges.right} onClick={() => step(1)} />
            </span>
          )}
          {count > 0 && (
            <Link
              href={`/session/${encodeURIComponent(id)}`}
              className="group/open -mr-2 inline-flex min-h-9 items-center gap-1 rounded-[8px] px-2 text-[13px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-[#1d72dc] focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
            >
              Open the board
              <ArrowRight className="size-3.5 transition-transform duration-150 group-hover/open:translate-x-0.5" strokeWidth={2.4} aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {/* The strip bleeds into the page gutters so cards scroll under them
          rather than stopping at the text's edge; the fades say there is more. */}
      <div className="relative mt-4">
        <div
          ref={scroller}
          role="region"
          aria-label="Your boards, one per problem"
          tabIndex={count > 1 ? 0 : -1}
          onScroll={measure}
          // scroll-px matches px: with mandatory snap and no scroll padding, the
          // first card snapped to the scrollport's edge and the strip loaded
          // already scrolled 56px past the gutter.
          className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 py-1 outline-none [scrollbar-width:none] scroll-px-6 sm:-mx-10 sm:px-10 sm:scroll-px-10 lg:-mx-14 lg:px-14 lg:scroll-px-14 [&::-webkit-scrollbar]:hidden"
        >
          {boards === null ? (
            <>
              <Skeleton className={cn(BOARD_W, "h-[280px] shrink-0 rounded-[20px]")} />
              <Skeleton className={cn(BOARD_W, "h-[280px] shrink-0 rounded-[20px]")} />
            </>
          ) : boards.length === 0 ? (
            <NoBoard />
          ) : (
            boards.map((board, i) => <BoardCard key={`${board.index}-${board.src}`} board={board} i={i} />)
          )}
        </div>
        <Fade side="left" on={edges.left} />
        <Fade side="right" on={edges.right} />
      </div>
    </section>
  );
}

function Arrow({ dir, disabled, onClick }: { dir: -1 | 1; disabled: boolean; onClick: () => void }) {
  const Icon = dir < 0 ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir < 0 ? "Earlier boards" : "Later boards"}
      className="grid size-8 cursor-pointer place-items-center rounded-full border border-(--lp-line) text-(--lp-ink-2) outline-none transition-[color,border-color,transform] duration-150 hover:border-(--lp-gray-2) hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) active:scale-[0.96] disabled:cursor-default disabled:opacity-35 disabled:hover:border-(--lp-line) disabled:hover:text-(--lp-ink-2) disabled:active:scale-100"
    >
      <Icon className="size-4" strokeWidth={2.25} aria-hidden />
    </button>
  );
}

function Fade({ side, on }: { side: "left" | "right"; on: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 w-14 from-white to-transparent transition-opacity duration-150",
        side === "left" ? "-left-6 bg-gradient-to-r sm:-left-10 lg:-left-14" : "-right-6 bg-gradient-to-l sm:-right-10 lg:-right-14",
      )}
      style={{ opacity: on ? 1 : 0 }}
    />
  );
}

function BoardCard({ board, i }: { board: Board; i: number }) {
  const [missing, setMissing] = useState(false);
  return (
    <motion.figure
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 + Math.min(i, 4) * 0.05, ease: EASE }}
      className={cn(CARD, BOARD_W, "m-0 shrink-0 snap-start overflow-hidden")}
    >
      <span className="flex aspect-video items-center justify-center bg-white p-3" style={missing ? DOTS : undefined}>
        {missing ? (
          <ChalkMark size={26} color="rgba(18,18,21,0.22)" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={board.src}
            alt={`The board for ${board.title}`}
            decoding="async"
            loading={i > 2 ? "lazy" : "eager"}
            onError={() => setMissing(true)}
            className="max-h-full max-w-full object-contain"
          />
        )}
      </span>
      <figcaption className="flex items-center gap-2.5 border-t border-(--lp-line) px-4 py-2.5">
        {/* The number is the order the problems happened in. */}
        <span className="text-[12px] text-(--lp-ink-3) tabular-nums">{board.index}</span>
        <span className="min-w-0 truncate text-[13.5px] font-medium text-(--lp-ink)">{board.title}</span>
      </figcaption>
    </motion.figure>
  );
}

function NoBoard() {
  return (
    <figure className={cn(CARD, BOARD_W, "m-0 shrink-0 overflow-hidden")}>
      <span className="flex aspect-video items-center justify-center" style={DOTS}>
        <ChalkMark size={26} color="rgba(18,18,21,0.22)" />
      </span>
      <figcaption className="border-t border-(--lp-line) px-4 py-2.5 text-[13.5px] font-medium text-(--lp-ink-2)">No board from this one</figcaption>
    </figure>
  );
}

// ── The note ───────────────────────────────────────────────────────────────

function Note({ summary, waiting, onPractice }: { summary: SessionSummary | null; waiting: boolean; onPractice: (topic: string) => void }) {
  if (waiting) {
    return (
      <div className={cn(NOTE_GRID, "mt-12")} aria-hidden>
        {[0, 1].map((n) => (
          <div key={n} className="flex flex-col gap-3 border-t border-(--lp-line) pt-5">
            <Skeleton className="h-4 w-24 rounded-[6px]" />
            <Skeleton className="mt-1 h-5 w-full rounded-[8px]" />
            <Skeleton className="h-5 w-11/12 rounded-[8px]" />
            <Skeleton className="h-5 w-4/5 rounded-[8px]" />
          </div>
        ))}
        <Skeleton className="h-[180px] rounded-[20px]" />
      </div>
    );
  }
  if (!summary) return null;

  const skill = summary.stats.skills[0];
  const skillLabel = skill ? (SKILL_LABEL.get(skill) ?? skill) : null;
  const sections = [summary.wins.length > 0, summary.stuck.length > 0, Boolean(summary.next)].filter(Boolean).length;
  if (sections === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.15, ease: EASE }}
      className={cn(NOTE_GRID, "mt-12")}
    >
      {summary.wins.length > 0 && (
        <Passage label="What clicked">
          <Items items={summary.wins} mark="check" />
        </Passage>
      )}
      {summary.stuck.length > 0 && (
        <Passage label="Still shaky">
          <Items items={summary.stuck} mark="ring" />
        </Passage>
      )}
      {/* The one thing to do sits apart from what is only read: the home
          page's card, in the column the eye ends on. */}
      {summary.next && (
        <section className={cn(CARD, "p-6 lg:col-start-3 lg:row-start-1")}>
          <h2 className="m-0 text-[13px] font-medium text-(--lp-ink-2)">Try this next</h2>
          <p className="m-0 mt-3 text-[16px] leading-[1.5] text-(--lp-ink)">{summary.next}</p>
          {skillLabel && (
            <button
              type="button"
              onClick={() => onPractice(skillLabel)}
              className="group/next -ml-2 mt-3 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[10px] px-2 text-left text-[14px] font-medium text-[#1d72dc] outline-none transition-transform duration-150 hover:underline hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) active:scale-[0.98]"
            >
              Practice {skillLabel.toLowerCase()}
              <ArrowRight className="size-3.5 shrink-0 transition-transform duration-150 group-hover/next:translate-x-0.5" strokeWidth={2.4} aria-hidden />
            </button>
          )}
        </section>
      )}
    </motion.div>
  );
}

/** Clicked and shaky side by side, the next step in a card to their right; stacked on a phone. */
const NOTE_GRID = "grid grid-cols-[minmax(0,1fr)] items-start gap-10 md:grid-cols-2 md:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px]";

function Passage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-t border-(--lp-line) pt-5">
      <h2 className="m-0 text-[13px] font-medium text-(--lp-ink-2)">{label}</h2>
      {children}
    </section>
  );
}

/** A check for what clicked; an empty ring, "not yet", for what is still shaky. */
function Items({ items, mark }: { items: string[]; mark: "check" | "ring" }) {
  return (
    <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          {mark === "check" ? (
            <span aria-hidden className="mt-px grid size-6 shrink-0 place-items-center rounded-full bg-(--lp-sky-soft)">
              <Check className="size-3.5 text-(--lp-sky-deep)" strokeWidth={2.5} />
            </span>
          ) : (
            <span aria-hidden className="mt-px grid size-6 shrink-0 place-items-center">
              <span className="size-3 rounded-full border-2 border-(--lp-ink-3)" />
            </span>
          )}
          <span className="min-w-0 text-[16px] leading-[1.5] text-(--lp-ink)">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** No note: it failed, or the session is from before notes were written. */
function Unwritten({ kind, onWrite, busy }: { kind: "failed" | "none"; onWrite: () => void; busy: boolean }) {
  return (
    <section className={cn(PROSE, "mt-12")}>
      <h2 className="m-0 text-[13px] font-medium text-(--lp-ink-2)">Your summary</h2>
      <p className="m-0 mt-3 text-[16px] leading-[1.55] text-(--lp-ink-2)">
        {kind === "failed" ? "This one couldn't be written. Your boards and the conversation are still here." : "No summary was written for this one."}
      </p>
      <button
        type="button"
        onClick={onWrite}
        disabled={busy}
        className="-ml-2 mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] px-2 text-[14px] font-medium text-[#1d72dc] outline-none transition-transform duration-150 hover:underline hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) active:scale-[0.98] disabled:cursor-default disabled:opacity-60 disabled:hover:no-underline"
      >
        {busy && <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
        {kind === "failed" ? "Try again" : "Write one"}
      </button>
    </section>
  );
}

// ── The conversation ───────────────────────────────────────────────────────

function Conversation({ id, mock }: { id: string; mock: MockPayload | null }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "failed">("idle");

  const load = useCallback(async () => {
    setState("loading");
    if (mock) {
      setTurns(mock.turns);
      setState("done");
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/transcript`);
      if (!res.ok) throw new Error(`transcript ${res.status}`);
      const json = (await res.json()) as { turns: Turn[] };
      setTurns(json.turns);
      setState("done");
    } catch {
      setState("failed");
    }
  }, [id, mock]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && state === "idle") void load();
  };

  const entries: TranscriptEntry[] = (turns ?? []).map((t, i) => ({ role: t.role, text: t.text, id: `t${i}`, at: t.at }));

  return (
    <section className="mt-14 border-t border-(--lp-line)">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="conversation"
        className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] cursor-pointer items-center justify-between gap-4 rounded-[10px] px-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
      >
        <span className="flex items-baseline gap-2">
          <span className="text-[15px] font-medium text-(--lp-ink)">The conversation</span>
          {turns && state === "done" && <span className="text-[13px] text-(--lp-ink-3) tabular-nums">{turns.length} turns</span>}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-(--lp-ink-3) transition-transform duration-200 ease-out", open && "rotate-180")} strokeWidth={2.25} aria-hidden />
      </button>
      {open && (
        <motion.div
          id="conversation"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className={cn(PROSE, "pt-1 pb-2")}
        >
          {state === "loading" ? (
            <div className="flex flex-col gap-3" aria-hidden>
              <Skeleton className="h-4 w-12 rounded-[6px]" />
              <Skeleton className="h-5 w-full rounded-[8px]" />
              <Skeleton className="h-5 w-3/4 rounded-[8px]" />
              <Skeleton className="mt-2 h-4 w-8 rounded-[6px]" />
              <Skeleton className="h-8 w-1/2 rounded-[12px]" />
            </div>
          ) : state === "failed" ? (
            <p className="m-0 text-[14px] text-(--lp-ink-2)">
              Couldn&apos;t load the conversation.{" "}
              <button type="button" onClick={() => void load()} className="cursor-pointer font-medium text-[#1d72dc] hover:underline hover:underline-offset-4">
                Try again
              </button>
            </p>
          ) : (
            <TranscriptList transcript={entries} emptyText="Nothing was said in this one." />
          )}
        </motion.div>
      )}
    </section>
  );
}
