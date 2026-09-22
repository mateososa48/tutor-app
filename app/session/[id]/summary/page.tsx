"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ChalkMark } from "@/components/app/ChalkMark";
import { Skeleton } from "@/components/ui/skeleton";
import { SKILL_CATALOG } from "@/lib/skill-catalog";
import { formatDuration, formatRelativeDate } from "@/lib/sessions";
import { useClientReady } from "@/lib/client-ready";
import { cn } from "@/lib/utils";
import type { SessionSummary } from "@/lib/session-summary";

// What you see when a session ends, and when you open a past one.
//
// The home screen's page: the same 1080px column, the same card (one 20px
// radius on one hairline), the same left column beside a 340px side card
// spanning both rows, and the same device of splitting one card with a
// hairline rather than stacking two. The board picture takes the place the
// start card's wave has, because here the picture is the thing worth looking
// at.

const CARD = "rounded-[20px] border border-(--lp-line) bg-(--lp-surface)";
const PAD = "p-6 sm:p-7";
const BAR = "#3d9cff";

const DOTS = {
  backgroundImage: "radial-gradient(rgba(18,18,21,0.10) 1px, transparent 1.2px)",
  backgroundSize: "9px 9px",
  backgroundPosition: "4px 4px",
} as const;

const SKILL_LABEL = new Map(SKILL_CATALOG.map((s) => [s.key, s.label]));

type Payload = { summary: SessionSummary | null; state: string; sessionStatus: string; startedAt: number; durationSec: number };

/** While a summary is being written, and how often to look. */
const POLL_MS = 3000;
const POLL_LIMIT = 40;

export default function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const mounted = useClientReady();
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const polls = useRef(0);

  const load = useCallback(async (): Promise<Payload | null> => {
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
  }, [id, router]);

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

  const retry = async () => {
    setRetrying(true);
    polls.current = 0;
    await fetch(`/api/sessions/${encodeURIComponent(id)}/summary`, { method: "POST" }).catch(() => {});
    await load();
    setRetrying(false);
  };

  const summary = data?.summary ?? null;
  const waiting = !data || (data.state === "pending" && !summary);
  const broken = failed || (data?.state === "failed" && !summary);

  return (
    <AppShell defaultOpen>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1080px] px-6 pt-10 pb-20 sm:px-10 lg:px-14 lg:pt-14">
          <Link
            href="/"
            className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
          >
            <ArrowLeft className="size-4" strokeWidth={2.25} aria-hidden />
            Home
          </Link>

          <Header summary={summary} waiting={waiting} mounted={mounted} startedAt={data?.startedAt ?? 0} durationSec={data?.durationSec ?? 0} />

          <div className="mt-9 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:gap-x-8">
            <BoardCard id={id} className="lg:col-start-1 lg:row-start-1" />
            <SideCard
              className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
              summary={summary}
              waiting={waiting}
              durationSec={data?.durationSec ?? 0}
              onPractice={(topic) => router.push(`/session?topic=${encodeURIComponent(topic)}`)}
            />
            <NotesCard className="lg:col-start-1 lg:row-start-2" summary={summary} waiting={waiting} broken={broken} onRetry={retry} retrying={retrying} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────

function Header({
  summary,
  waiting,
  mounted,
  startedAt,
  durationSec,
}: {
  summary: SessionSummary | null;
  waiting: boolean;
  mounted: boolean;
  startedAt: number;
  durationSec: number;
}) {
  const when = startedAt && mounted ? formatRelativeDate(startedAt) : "";
  const long = durationSec ? formatDuration(durationSec) : "";
  return (
    <header className="mt-5">
      <p className="m-0 flex items-center gap-2 text-[13px] text-(--lp-ink-3)">
        {waiting ? (
          <>
            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            Writing your summary
          </>
        ) : (
          [when, long].filter(Boolean).join(" · ") || " "
        )}
      </p>
      {waiting ? (
        <Skeleton className="mt-4 h-[42px] w-4/5 max-w-[520px] rounded-[10px]" />
      ) : (
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="lp-display m-0 mt-4 text-[clamp(2rem,3.4vw,2.6rem)] leading-[1.05] text-balance text-(--lp-ink)"
        >
          {summary?.headline ?? "That session"}
        </motion.h1>
      )}
      {waiting ? (
        <Skeleton className="mt-3 h-5 w-3/5 max-w-[420px] rounded-[8px]" />
      ) : (
        summary && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            className="m-0 mt-2.5 max-w-[62ch] text-[16px] leading-[1.55] text-(--lp-ink-2)"
          >
            {summary.recap}
          </motion.p>
        )
      )}
    </header>
  );
}

// ── The board ──────────────────────────────────────────────────────────────

function BoardCard({ id, className }: { id: string; className?: string }) {
  const [missing, setMissing] = useState(false);
  return (
    <Link
      href={`/session/${encodeURIComponent(id)}`}
      className={cn(
        CARD,
        "group flex h-[248px] flex-col overflow-hidden outline-none sm:h-[284px]",
        "transition-[translate] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
        "active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      {/* The board is the work, so it is shown whole rather than cropped to
          fill: a board export is wide and flat, and `cover` cut the right of
          it off. The bar below is a row, not an overlay, so nothing sits on
          top of what the student drew. */}
      <span className="flex min-h-0 flex-1 items-center justify-center bg-white p-3" style={missing ? DOTS : undefined}>
        {missing ? (
          <ChalkMark size={26} color="rgba(18,18,21,0.22)" />
        ) : (
          // The session's newest board picture, served to its owner only.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/sessions/${encodeURIComponent(id)}/frames`}
            alt="The whiteboard at the end of the session"
            decoding="async"
            onError={() => setMissing(true)}
            className="max-h-full max-w-full object-contain"
          />
        )}
      </span>
      <span className="flex shrink-0 items-center justify-between gap-3 border-t border-(--lp-line) px-5 py-3">
        <span className="text-[13.5px] font-medium text-(--lp-ink)">{missing ? "No board from this one" : "Your board"}</span>
        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-(--lp-ink-2) transition-colors duration-150 group-hover:text-[#1d72dc]">
          Open it
          <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2.4} aria-hidden />
        </span>
      </span>
    </Link>
  );
}

// ── This session, then what to try ─────────────────────────────────────────

function SideCard({
  summary,
  waiting,
  durationSec,
  onPractice,
  className,
}: {
  summary: SessionSummary | null;
  waiting: boolean;
  /** From the session itself, so the length shows even when no summary was written. */
  durationSec: number;
  onPractice: (topic: string) => void;
  className?: string;
}) {
  const stats = summary?.stats;
  const skill = stats?.skills[0];
  const skillLabel = skill ? (SKILL_LABEL.get(skill) ?? skill) : null;

  return (
    <aside className={cn(CARD, "flex flex-col overflow-hidden", className)}>
      <section className={PAD}>
        <h2 className="m-0 text-[13px] font-medium text-(--lp-ink-2)">This session</h2>
        <p className="lp-display m-0 mt-2 text-[28px] leading-none text-(--lp-ink) tabular-nums">
          {formatDuration(stats?.durationSec || durationSec)}
        </p>
        {waiting ? (
          <Skeleton className="mt-6 h-[86px] rounded-[10px]" />
        ) : !stats ? (
          <p className="m-0 mt-4 text-[14px] leading-[1.5] text-(--lp-ink-2)">The rest of this one wasn&apos;t worked out.</p>
        ) : (
          <>
            <dl className="m-0 mt-6 flex flex-col gap-0">
              {stats.checked > 0 && (
                <Stat label="Answers right" value={`${stats.correct} of ${stats.checked}`} bar={stats.correct / stats.checked} />
              )}
              {stats.independent > 0 && <Stat label="With no help first" value={String(stats.independent)} />}
              {stats.pictures > 0 && <Stat label="Pictures drawn" value={String(stats.pictures)} />}
              {stats.checked === 0 && stats.pictures === 0 && (
                <p className="m-0 text-[14px] leading-[1.5] text-(--lp-ink-2)">Nothing was checked in this one.</p>
              )}
            </dl>
            {stats.skills.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {stats.skills.map((key) => (
                  <span key={key} className="rounded-[8px] bg-(--lp-gray) px-2.5 py-1 text-[12.5px] font-medium text-(--lp-ink-2)">
                    {SKILL_LABEL.get(key) ?? key}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {(waiting || summary?.next) && <div aria-hidden className="h-px shrink-0 bg-(--lp-line)" />}

      {(waiting || summary?.next) && (
      <section className={cn(PAD, "flex flex-1 flex-col")}>
        <h2 className="m-0 text-[15px] font-medium text-(--lp-ink-2)">Try this next</h2>
        {waiting ? (
          <Skeleton className="mt-4 h-[72px] rounded-[12px]" />
        ) : summary?.next ? (
          <>
            <p className="m-0 mt-3 text-[16px] leading-[1.5] text-(--lp-ink)">{summary.next}</p>
            {skillLabel && (
              <button
                type="button"
                onClick={() => onPractice(skillLabel)}
                className="group/next mt-auto -mx-2 inline-flex min-h-11 w-[calc(100%+1rem)] cursor-pointer items-center gap-1.5 rounded-[10px] px-2 pt-6 text-left text-[13px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-[#1d72dc] focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
              >
                Practice {skillLabel.toLowerCase()}
                <ArrowRight className="size-3.5 transition-transform duration-150 group-hover/next:translate-x-0.5" strokeWidth={2.4} aria-hidden />
              </button>
            )}
          </>
        ) : null}
      </section>
      )}
    </aside>
  );
}

function Stat({ label, value, bar }: { label: string; value: string; bar?: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-(--lp-line) py-2.5 last:border-b-0">
      <dt className="m-0 text-[14px] text-(--lp-ink-2)">{label}</dt>
      <dd className="m-0 flex items-center gap-2.5">
        {bar !== undefined && (
          <span aria-hidden className="flex h-1.5 w-12 overflow-hidden rounded-full bg-(--lp-gray-2)">
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: Math.max(0.04, bar) }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={{ originX: 0, background: BAR }}
              className="h-full w-full"
            />
          </span>
        )}
        <span className="text-[14px] font-medium text-(--lp-ink) tabular-nums">{value}</span>
      </dd>
    </div>
  );
}

// ── What clicked, and what is still shaky ──────────────────────────────────

function NotesCard({
  summary,
  waiting,
  broken,
  onRetry,
  retrying,
  className,
}: {
  summary: SessionSummary | null;
  waiting: boolean;
  broken: boolean;
  onRetry: () => void;
  retrying: boolean;
  className?: string;
}) {
  if (broken) {
    return (
      <section className={cn(CARD, PAD, className)}>
        <h2 className="m-0 text-[15px] font-medium text-(--lp-ink-2)">Your summary</h2>
        <p className="m-0 mt-2.5 max-w-[46ch] text-[14.5px] leading-[1.5] text-(--lp-ink-2)">
          This one couldn&apos;t be written. The board and the transcript are still here.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[10px] px-2 text-[13px] font-medium text-[#1d72dc] outline-none hover:underline focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) disabled:opacity-60"
        >
          {retrying && <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
          {retrying ? "Trying again" : "Try again"}
        </button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className={cn(CARD, "flex flex-col overflow-hidden", className)}>
        <div className={PAD}>
          <Skeleton className="h-4 w-28 rounded-[6px]" />
          <Skeleton className="mt-4 h-5 w-full rounded-[8px]" />
          <Skeleton className="mt-2.5 h-5 w-4/5 rounded-[8px]" />
        </div>
        <div aria-hidden className="h-px shrink-0 bg-(--lp-line)" />
        <div className={PAD}>
          <Skeleton className="h-4 w-24 rounded-[6px]" />
          <Skeleton className="mt-4 h-5 w-3/4 rounded-[8px]" />
        </div>
      </section>
    );
  }

  const wins = summary?.wins ?? [];
  const stuck = summary?.stuck ?? [];
  if (wins.length === 0 && stuck.length === 0) return null;

  return (
    <section className={cn(CARD, "flex flex-col overflow-hidden", className)}>
      {wins.length > 0 && (
        <Notes
          title="What clicked"
          items={wins}
          icon={<Check className="size-3.5 text-(--lp-sky-deep)" strokeWidth={3} aria-hidden />}
          tint="bg-(--lp-sky-soft)"
        />
      )}
      {wins.length > 0 && stuck.length > 0 && <div aria-hidden className="h-px shrink-0 bg-(--lp-line)" />}
      {stuck.length > 0 && (
        <Notes
          title="Still shaky"
          items={stuck}
          icon={<Sparkles className="size-3.5 text-(--lp-ink-2)" strokeWidth={2.5} aria-hidden />}
          tint="bg-(--lp-gray)"
        />
      )}
    </section>
  );
}

function Notes({ title, items, icon, tint }: { title: string; items: string[]; icon: React.ReactNode; tint: string }) {
  return (
    <section className={PAD}>
      <h2 className="m-0 text-[15px] font-medium text-(--lp-ink-2)">{title}</h2>
      <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
        {items.map((item, i) => (
          <motion.li
            key={item}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] }}
            className="flex gap-3"
          >
            <span aria-hidden className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", tint)}>
              {icon}
            </span>
            <span className="min-w-0 text-[16px] leading-[1.5] text-(--lp-ink)">{item}</span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
