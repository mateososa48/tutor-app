"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, MessagesSquare, Target } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ChalkMark } from "@/components/app/ChalkMark";
import { PetSays } from "@/components/board/PetSays";
import { TranscriptList } from "@/components/session/TranscriptPanel";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SKILL_CATALOG } from "@/lib/skill-catalog";
import { formatRelativeDate } from "@/lib/sessions";
import { useClientReady } from "@/lib/client-ready";
import type { TranscriptEntry } from "@/lib/live-types";
import type { SessionSummary } from "@/lib/session-summary";
import { cn } from "@/lib/utils";
import { SUMMARY_MOCKS, type MockPayload } from "./mock";

// What you see when a session ends, and when you open a past one.
//
// Read top to bottom it answers, in order: how did it go (the headline, and
// the pet saying the recap), the numbers in one strip, what went well and
// what didn't (two titled cards), what to do now (one card, one button), and
// the work itself (the boards, one per problem). The conversation is a button
// in the header that opens a side panel: one click away, never a section.
//
// Every section has a real title (22px, the home page's "Past sessions") and
// one plain sentence under it saying what it is, rather than a 13px grey
// label. Tokens, cards and radii are the home page's.

const CARD = "rounded-[20px] border border-(--lp-line) bg-(--lp-surface)";
const EASE = [0.16, 1, 0.3, 1] as const;
const TITLE = "lp-display m-0 text-[22px] leading-tight text-(--lp-ink)";
const SUBTITLE = "m-0 mt-1 text-[15px] leading-[1.45] text-(--lp-ink-2)";

const DOTS = {
  backgroundImage: "radial-gradient(rgba(18,18,21,0.10) 1px, transparent 1.2px)",
  backgroundSize: "9px 9px",
  backgroundPosition: "4px 4px",
} as const;

const SKILL_LABEL = new Map(SKILL_CATALOG.map((s) => [s.key, s.label]));

type Payload = { summary: SessionSummary | null; state: string; sessionStatus: string; title: string; startedAt: number; durationSec: number; sessionNumber?: number };
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
  const [talkOpen, setTalkOpen] = useState(false);
  const transcript = useTranscript(id, mock);
  const openTalk = () => {
    setTalkOpen(true);
    if (transcript.state === "idle") void transcript.load();
  };
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

  const skill = summary?.stats.skills[0];
  const skillLabel = skill ? (SKILL_LABEL.get(skill) ?? skill) : null;

  return (
    <AppShell defaultOpen>
      <MotionConfig reducedMotion="user">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1080px] px-6 pt-10 pb-24 sm:px-10 lg:px-14 lg:pt-14">
            <Link
              href="/"
              className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-[8px] px-2 text-[14px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
            >
              <ArrowLeft className="size-4" strokeWidth={2.25} aria-hidden />
              Home
            </Link>

            <Header
              data={data}
              summary={summary}
              waiting={waiting}
              missing={broken ? "failed" : unwritten ? "none" : null}
              busy={retrying}
              onWrite={write}
              mounted={mounted}
              onConversation={openTalk}
            />

            <Stats data={data} boards={boards} />

            <Notes summary={summary} waiting={waiting} />

            {summary?.next && (
              <Next text={summary.next} onPractice={skillLabel ? () => router.push(`/session?topic=${encodeURIComponent(skillLabel)}`) : undefined} />
            )}

            <Boards id={id} boards={boards} />
          </div>
        </div>
        <Conversation transcript={transcript} open={talkOpen} onOpenChange={setTalkOpen} />
      </MotionConfig>
    </AppShell>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────

function Header({
  data,
  summary,
  waiting,
  missing,
  busy,
  onWrite,
  mounted,
  onConversation,
}: {
  data: Payload | null;
  summary: SessionSummary | null;
  waiting: boolean;
  /** No note to show: writing it failed, or it was never written. */
  missing: "failed" | "none" | null;
  busy: boolean;
  onWrite: () => void;
  mounted: boolean;
  onConversation: () => void;
}) {
  const when = data?.startedAt && mounted ? formatRelativeDate(data.startedAt) : "";
  // With no note, the heading is the session's own name.
  const fallback = data?.title && data.title !== "Session" ? data.title : "Your session";

  // What the pet says. The recap is written to the student ("You worked
  // through..."), so it reads as the tutor talking to them. When there is no
  // recap it says why, in its own words, and the button that fixes it sits
  // under its bubble.
  const said = busy ? undefined : summary ? summary.recap : missing === "failed" ? "I couldn't write this one. Your boards and the conversation are all still here." : missing === "none" ? "I didn't write a summary for this session. Want me to write one now?" : undefined;
  const thinking = busy || waiting ? "Writing your summary" : undefined;

  return (
    <header className="mt-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-10">
        <div className="min-w-0">
          <p className="m-0 min-h-5 text-[14px] text-(--lp-ink-2)">{when || " "}</p>
          {!data ? (
            <Skeleton className="mt-3 h-[42px] w-4/5 max-w-[520px] rounded-[10px]" />
          ) : (
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="lp-display m-0 mt-2 max-w-[22ch] text-[clamp(2rem,3.4vw,2.6rem)] leading-[1.06] text-balance text-(--lp-ink)"
            >
              {summary?.headline ?? fallback}
            </motion.h1>
          )}
        </div>

        {/* The conversation's home: one click away from anywhere on the page,
            and out of the way of everyone who only wants the note. */}
        <button type="button" onClick={onConversation} className={cn(PILL, "self-start md:self-end")}>
          <MessagesSquare className="size-4" strokeWidth={2} aria-hidden />
          Read the conversation
        </button>
      </div>

      {data && (
        <PetSays className="mt-8 max-w-[780px]" text={said} thinking={thinking} puzzled={missing === "failed"}>
          {missing && (
            <button type="button" onClick={onWrite} disabled={busy} className={PILL}>
              {missing === "failed" ? "Try again" : "Write one"}
            </button>
          )}
        </PetSays>
      )}
    </header>
  );
}

/** The quiet secondary button: the conversation, try again, open the board. */
const PILL =
  "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-(--lp-line) bg-(--lp-surface) px-4 text-[14px] font-medium text-(--lp-ink) outline-none transition-[background-color,transform] duration-150 hover:bg-(--lp-gray) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) active:scale-[0.97] disabled:cursor-default disabled:opacity-60";

// ── The numbers ────────────────────────────────────────────────────────────

/** One cell: a value, `null` while it loads, `undefined` when there is nothing to say. */
type Cell = { label: string; value: ReactNode | null | undefined };

const COLS: Record<number, string> = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" };

/**
 * The counts as a strip: one bordered row, each cell a small label over a big
 * number. Only numbers every session has: an answer count exists only when
 * the tutor checked answers, which most sessions so far never did, so it is
 * not here (Mateo, Sept 22). A cell with nothing to say is dropped.
 */
function Stats({ data, boards }: { data: Payload | null; boards: Board[] | null }) {
  const seconds = data?.durationSec ?? 0;
  const minutes = Math.max(1, Math.round(seconds / 60));
  const nth = data?.sessionNumber ?? 0;

  const cells: Cell[] = [
    {
      label: "Time",
      value: !data ? null : seconds ? (
        <>
          {minutes}
          <Unit>min</Unit>
        </>
      ) : undefined,
    },
    { label: "Problems", value: boards === null ? null : boards.length > 0 ? String(boards.length) : undefined },
    { label: "Sessions so far", value: !data ? null : nth > 0 ? String(nth) : undefined },
  ];
  const shown = cells.filter((c) => c.value !== undefined);
  if (shown.length === 0) return null;
  const odd = shown.length % 2 === 1;

  return (
    <dl className={cn(CARD, "m-0 mt-10 grid grid-cols-2 gap-px overflow-hidden bg-(--lp-line)", COLS[shown.length])}>
      {shown.map((cell, i) => (
        <div key={cell.label} className={cn("bg-(--lp-surface) px-5 py-5 sm:px-6", odd && i === shown.length - 1 && "max-md:col-span-2")}>
          <dt className="text-[14px] font-medium text-(--lp-ink-2)">{cell.label}</dt>
          <dd className="lp-display m-0 mt-2.5 text-[32px] leading-none text-(--lp-ink) tabular-nums sm:text-[34px]">
            {cell.value === null ? <Skeleton className="h-8 w-16 rounded-[8px]" /> : cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Unit({ children }: { children: ReactNode }) {
  return <span className="ml-1 text-[18px] text-(--lp-ink-2)">{children}</span>;
}

// ── What clicked, what's still shaky ───────────────────────────────────────

function Notes({ summary, waiting }: { summary: SessionSummary | null; waiting: boolean }) {
  if (waiting) {
    return (
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2" aria-hidden>
        {[0, 1].map((n) => (
          <div key={n} className={cn(CARD, "flex flex-col gap-3 p-6 sm:p-7")}>
            <Skeleton className="h-6 w-36 rounded-[8px]" />
            <Skeleton className="h-4 w-48 rounded-[6px]" />
            <Skeleton className="mt-3 h-5 w-full rounded-[8px]" />
            <Skeleton className="h-5 w-11/12 rounded-[8px]" />
            <Skeleton className="h-5 w-4/5 rounded-[8px]" />
          </div>
        ))}
      </div>
    );
  }
  if (!summary) return null;

  const cards = [
    summary.wins.length > 0 && { title: "What clicked", sub: "Things you did well this session.", items: summary.wins, mark: "check" as const },
    summary.stuck.length > 0 && { title: "Still shaky", sub: "Worth another look next time.", items: summary.stuck, mark: "ring" as const },
  ].filter(Boolean) as Array<{ title: string; sub: string; items: string[]; mark: "check" | "ring" }>;
  if (cards.length === 0) return null;

  return (
    <div className={cn("mt-4 grid grid-cols-[minmax(0,1fr)] gap-4", cards.length === 2 && "md:grid-cols-2")}>
      {cards.map((card, i) => (
        <motion.section
          key={card.title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 + i * 0.06, ease: EASE }}
          className={cn(CARD, "p-6 sm:p-7")}
        >
          <h2 className={TITLE}>{card.title}</h2>
          <p className={SUBTITLE}>{card.sub}</p>
          <Items items={card.items} mark={card.mark} />
        </motion.section>
      ))}
    </div>
  );
}

/** A check for what clicked; an empty ring, "not yet", for what is still shaky. */
function Items({ items, mark }: { items: string[]; mark: "check" | "ring" }) {
  return (
    <ul className="m-0 mt-5 flex list-none flex-col gap-4 p-0">
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

// ── What to do next ────────────────────────────────────────────────────────

/**
 * The page's one action, as a card in the same family as the two above it:
 * the title, the sentence at reading size, and the app's black button. It was
 * a pale-sky banner with the sentence at display size, which shouted.
 */
function Next({ text, onPractice }: { text: string; onPractice?: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.22, ease: EASE }}
      className={cn(CARD, "mt-4 flex flex-col gap-5 p-6 sm:p-7 md:flex-row md:items-center md:justify-between md:gap-10")}
    >
      <div className="flex min-w-0 gap-4">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-(--lp-sky-soft)">
          <Target className="size-5 text-(--lp-sky-deep)" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className={TITLE}>Try this next</h2>
          <p className="m-0 mt-1.5 max-w-[60ch] text-[16px] leading-[1.55] text-(--lp-ink)">{text}</p>
        </div>
      </div>
      {onPractice && (
        <button
          type="button"
          onClick={onPractice}
          className="btn-gloss btn-gloss-lift ml-15 inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 self-start rounded-[12px] px-5 text-[15px] font-medium outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) md:ml-0 md:self-center"
        >
          Start practice
          <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
        </button>
      )}
    </motion.section>
  );
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
  const sub =
    boards === null ? " " : count === 0 ? "Nothing was drawn in this one." : count === 1 ? "The board from this session." : `One for each problem, in the order you did them.`;

  return (
    <section className="mt-16" aria-labelledby="boards-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="boards-heading" className={TITLE}>
            {count === 1 ? "Your board" : "Your boards"}
          </h2>
          <p className={SUBTITLE}>{sub}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {scrollable && (
            <span className="hidden items-center gap-1.5 md:flex">
              <Arrow dir={-1} disabled={!edges.left} onClick={() => step(-1)} />
              <Arrow dir={1} disabled={!edges.right} onClick={() => step(1)} />
            </span>
          )}
          {count > 0 && (
            <Link
              href={`/session/${encodeURIComponent(id)}`}
              className={cn(PILL, "self-start")}
            >
              Open the board
              <ArrowRight className="size-3.5" strokeWidth={2.4} aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {/* The strip bleeds into the page gutters so cards scroll under them
          rather than stopping at the text's edge; the fades say there is more. */}
      <div className="relative mt-5">
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
              <Skeleton className={cn(BOARD_W, "h-[290px] shrink-0 rounded-[20px]")} />
              <Skeleton className={cn(BOARD_W, "h-[290px] shrink-0 rounded-[20px]")} />
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
      className="grid size-10 cursor-pointer place-items-center rounded-full border border-(--lp-line) bg-(--lp-surface) text-(--lp-ink) outline-none transition-[background-color,transform] duration-150 hover:bg-(--lp-gray) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) active:scale-[0.96] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-(--lp-surface) disabled:active:scale-100"
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
      <figcaption className="flex items-baseline gap-3 border-t border-(--lp-line) px-5 py-3.5">
        {/* The number is the order the problems happened in. */}
        <span className="text-[14px] text-(--lp-ink-3) tabular-nums">{board.index}</span>
        <span className="min-w-0 truncate text-[15px] font-medium text-(--lp-ink)">{board.title}</span>
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
      <figcaption className="border-t border-(--lp-line) px-5 py-3.5 text-[15px] font-medium text-(--lp-ink-2)">No board from this one</figcaption>
    </figure>
  );
}

// ── The conversation ───────────────────────────────────────────────────────

/**
 * Everything that was said, in a side panel: from the right on a laptop, the
 * whole screen on a phone. Loaded the first time it opens, then kept.
 */
type Transcript = { turns: Turn[] | null; state: "idle" | "loading" | "done" | "failed"; load: () => Promise<void> };

/** The transcript, fetched once on demand: the page starts it when the panel is opened. */
function useTranscript(id: string, mock: MockPayload | null): Transcript {
  const [turns, setTurns] = useState<Turn[] | null>(null);
  const [state, setState] = useState<Transcript["state"]>("idle");

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

  return { turns, state, load };
}

function Conversation({ transcript, open, onOpenChange }: { transcript: Transcript; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { turns, state, load } = transcript;
  const change = (next: boolean) => {
    onOpenChange(next);
    if (next && state === "idle") void load();
  };

  const entries: TranscriptEntry[] = (turns ?? []).map((t, i) => ({ role: t.role, text: t.text, id: `t${i}`, at: t.at }));

  return (
    <Sheet open={open} onOpenChange={change}>
      {/* The sheet's own width rules are keyed on data-side, so the override
          has to be too: plain w-full lost to its 75% and 384px cap. */}
      <SheetContent side="right" className="gap-0 bg-(--lp-surface) p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[460px]">
        <div className="border-b border-(--lp-line) px-6 pt-6 pb-5 pr-14">
          <SheetTitle className="lp-display text-[22px] leading-tight font-normal text-(--lp-ink)">The conversation</SheetTitle>
          <SheetDescription className="mt-1 text-[15px] text-(--lp-ink-2)">
            {state === "done" && turns ? `Everything you and your tutor said, ${turns.length} turns.` : "Everything you and your tutor said, in order."}
          </SheetDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {state === "loading" || state === "idle" ? (
            <div className="flex flex-col gap-3" aria-hidden>
              <Skeleton className="h-4 w-12 rounded-[6px]" />
              <Skeleton className="h-5 w-full rounded-[8px]" />
              <Skeleton className="h-5 w-3/4 rounded-[8px]" />
              <Skeleton className="mt-2 h-4 w-8 rounded-[6px]" />
              <Skeleton className="h-8 w-1/2 rounded-[12px]" />
            </div>
          ) : state === "failed" ? (
            <p className="m-0 text-[15px] text-(--lp-ink-2)">
              Couldn&apos;t load the conversation.{" "}
              <button type="button" onClick={() => void load()} className="cursor-pointer font-medium text-[#1d72dc] hover:underline hover:underline-offset-4">
                Try again
              </button>
            </p>
          ) : (
            <TranscriptList transcript={entries} emptyText="Nothing was said in this one." />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
