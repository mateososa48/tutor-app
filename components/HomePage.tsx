"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ChalkMark } from "@/components/app/ChalkMark";
import { FooterWave } from "@/components/landing/FooterWave";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteSession, loadSessions, type SavedSession } from "@/lib/sessions";
import { formatWeekTotal, sessionHeadline, sessionMeta, weekStats } from "@/lib/home-stats";
import { useClientReady } from "@/lib/client-ready";
import { cn } from "@/lib/utils";
import { loadLearningOverviewClient } from "@/lib/learning-client";
import type { LearningOverview } from "@/lib/learning-overview";
import { homeFocusItems } from "@/lib/home-focus";

// Home (Mateo's Figma, Sept 16): a greeting, a card that starts a session over
// a slow wave in the chart's blues, the past sessions with a picture of each
// board, and one tall side card with this week's practice and what to work on.
// On phones the side card comes before the list, so the week isn't buried.

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function today(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// One surface and one padding scale for every card on the page.
const CARD = "rounded-[20px] border border-(--lp-line) bg-(--lp-surface)";
const PAD = "p-6 sm:p-7";
const SHOWN = 6;

// The chart's two blues; the start card's wave uses the same pair.
const BAR = "#3d9cff";
const BAR_TODAY = "#3a80ef";
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

export default function HomePage() {
  const mounted = useClientReady();
  const router = useRouter();
  const { data: auth } = useSession();
  const [sessions, setSessions] = useState<SavedSession[] | null>(null);
  const [learning, setLearning] = useState<LearningOverview | null>(null);
  const [learningLoaded, setLearningLoaded] = useState(false);

  const reloadLearning = useCallback(async () => {
    setLearningLoaded(false);
    const overview = await loadLearningOverviewClient();
    setLearning(overview);
    setLearningLoaded(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Enough sessions to cover the week's chart; learning evidence loads in parallel.
    void Promise.all([loadSessions(60), loadLearningOverviewClient()]).then(([nextSessions, overview]) => {
      setSessions(nextSessions);
      setLearning(overview);
      setLearningLoaded(true);
    });
  }, [mounted]);

  async function remove(id: string) {
    setSessions((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    await deleteSession(id);
  }

  const firstName = auth?.user?.name?.split(" ")[0];

  return (
    <AppShell defaultOpen>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1080px] px-6 pt-12 pb-20 sm:px-10 lg:px-14 lg:pt-16">
          <header>
            <p className="m-0 text-[13px] text-(--lp-ink-3)">{mounted ? today() : " "}</p>
            <h1 className="lp-display m-0 mt-5 text-[clamp(2rem,3.4vw,2.6rem)] leading-[1.05] text-(--lp-ink)">
              {mounted ? `${greeting()}${firstName ? `, ${firstName}` : ""}.` : " "}
            </h1>
            <p className="m-0 mt-2.5 text-[16px] text-(--lp-ink-2)">What are you working on today?</p>
          </header>

          {/* Desktop: start card and past sessions on the left, the side card spanning both rows. */}
          <div className="mt-9 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:gap-x-8">
            <StartCard className="lg:col-start-1 lg:row-start-1" onStart={() => router.push("/session")} />
            <SideCard
              className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
              sessions={sessions}
              learning={learning}
              learningLoaded={learningLoaded}
              onRetryLearning={reloadLearning}
              onPractice={(topic) => router.push(`/session?topic=${encodeURIComponent(topic)}`)}
            />
            <PastSessions
              className="lg:col-start-1 lg:row-start-2"
              sessions={sessions}
              onOpen={(id) => router.push(`/session/${id}`)}
              onDelete={remove}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── Start ──────────────────────────────────────────────────────────────────

// A vertical gradient: a pale sky at the crest, through the bar blue, to the
// today blue at the bottom of the card. Tuned in a standalone render of the
// shader: about a fifth of the band changes every 1.5 s, crests stay 25px
// clear of the top, and no white shows through at the bottom.
const WAVE = { background: rgb("#ffffff"), top: rgb("#b2d6ff"), deep: rgb(BAR_TODAY), ink: rgb(BAR_TODAY) };

function StartCard({ onStart, className }: { onStart: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onStart}
      className={cn(
        CARD,
        "group relative isolate flex h-[212px] w-full cursor-pointer flex-col justify-start overflow-hidden text-left outline-none",
        "transition-[translate] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
        "active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[60%]">
        <FooterWave className="absolute inset-0" {...WAVE} edge={18} swing={1.7} reserve={30} waveScale={2.2} speed={1.9} ramp={0.38} />
      </span>
      <span className={cn("flex w-full items-start justify-between gap-4", PAD)}>
        <span className="min-w-0">
          <span className="block text-[19px] leading-tight font-semibold text-(--lp-ink)">Start a new session</span>
          <span className="mt-1.5 block text-[14.5px] text-(--lp-ink-2)">Type the problem or add a photo of it.</span>
        </span>
        {/* The glossy black button material (.btn-gloss, as on sign-in) with its top
            sheen always on. Hovering the card only grows it a little: the wrapper
            carries the grow, and the pinned background keeps the class's own hover
            brightening from kicking in. */}
        <span className="shrink-0 transition-[scale] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.08] group-active:scale-95 motion-reduce:transition-none">
          <span
            className="btn-gloss relative flex size-11 items-center justify-center overflow-hidden rounded-full"
            style={{ background: "linear-gradient(180deg, #2c2c32 0%, #19191d 100%)" }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0)_62%)]"
            />
            <Plus className="relative size-5" strokeWidth={2.4} />
          </span>
        </span>
      </span>
    </button>
  );
}

// ── Past sessions ──────────────────────────────────────────────────────────

function PastSessions({
  sessions,
  onOpen,
  onDelete,
  className,
}: {
  sessions: SavedSession[] | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const shown = sessions ? (all ? sessions : sessions.slice(0, SHOWN)) : null;

  return (
    <section className={cn(CARD, "px-5 pt-6 pb-3 sm:px-7 sm:pt-7", className)}>
      <h2 className="lp-display m-0 text-[22px] text-(--lp-ink)">Past sessions</h2>
      {shown === null ? (
        <div className="mt-4 flex flex-col gap-3 pb-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[46px] rounded-[10px]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="m-0 mt-3 pb-4 text-[14.5px] text-(--lp-ink-2)">Your sessions will show up here once you&apos;ve had one.</p>
      ) : (
        <ul className="m-0 mt-2 flex list-none flex-col p-0">
          <AnimatePresence initial={false}>
            {shown.map((s) => (
              <SessionRow key={s.id} session={s} onOpen={() => onOpen(s.id)} onDelete={() => onDelete(s.id)} />
            ))}
          </AnimatePresence>
        </ul>
      )}
      {sessions && sessions.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="-ml-2 mt-1 mb-1 cursor-pointer rounded-[8px] px-2 py-1.5 text-[13px] font-medium text-(--lp-ink-2) outline-none hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
        >
          {all ? "Show fewer" : `Show all ${sessions.length}`}
        </button>
      )}
    </section>
  );
}

const DOTS = {
  backgroundImage: "radial-gradient(rgba(18,18,21,0.12) 1px, transparent 1.2px)",
  backgroundSize: "7px 7px",
  backgroundPosition: "3px 3px",
} as const;

function Thumb({ id, picture }: { id: string; picture: boolean }) {
  const [failed, setFailed] = useState(false);
  const missing = !picture || failed;
  return (
    <span
      aria-hidden
      className="flex h-[46px] w-[64px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white shadow-[0_0_0_1px_rgba(18,18,21,0.08)]"
      style={missing ? DOTS : undefined}
    >
      {missing ? (
        <ChalkMark size={18} color="rgba(18,18,21,0.28)" />
      ) : (
        // The session's newest board picture, served to its owner only.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/sessions/${encodeURIComponent(id)}/frames`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover object-left-top"
        />
      )}
    </span>
  );
}

function SessionRow({ session, onOpen, onDelete }: { session: SavedSession; onOpen: () => void; onDelete: () => void }) {
  const { title, recap } = sessionHeadline(session);
  return (
    <motion.li
      layout
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
      className="group -mx-2 border-b border-(--lp-line) last:border-b-0"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="my-1 flex cursor-pointer items-center gap-4 rounded-[12px] px-2 py-2.5 outline-none transition-colors duration-150 hover:bg-(--lp-gray)/70 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
      >
        <Thumb id={session.id} picture={Boolean(session.hasPicture)} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-medium text-(--lp-ink)">{title}</span>
          {recap && <span className="truncate text-[13.5px] text-(--lp-ink-2)">{recap}</span>}
        </span>
        <span className="hidden shrink-0 text-[13px] text-(--lp-ink-3) tabular-nums sm:block">{sessionMeta(session)}</span>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${title}`}
                onClick={(e) => e.stopPropagation()}
                className="-mr-1 text-(--lp-ink-3) opacity-0 transition-opacity group-hover:opacity-100 hover:text-(--danger) focus-visible:opacity-100 data-open:opacity-100"
              />
            }
          >
            <Trash2 className="size-4" />
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-[16px]">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this session?</AlertDialogTitle>
              <AlertDialogDescription>
                The board and transcript for &ldquo;{title}&rdquo; will be gone for good.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Keep it</AlertDialogCancel>
              <AlertDialogAction
                className="bg-(--danger) text-white hover:bg-[#b8261a]"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </motion.li>
  );
}

// ── Side card: this week, then what to work on ─────────────────────────────

function SideCard({
  sessions,
  learning,
  learningLoaded,
  onRetryLearning,
  onPractice,
  className,
}: {
  sessions: SavedSession[] | null;
  learning: LearningOverview | null;
  learningLoaded: boolean;
  onRetryLearning: () => void;
  onPractice: (topic: string) => void;
  className?: string;
}) {
  return (
    <aside className={cn(CARD, "flex flex-col overflow-hidden", className)}>
      <WeekSection sessions={sessions} />
      <div aria-hidden className="h-px shrink-0 bg-(--lp-line)" />
      <FocusSection learning={learning} loaded={learningLoaded} onRetry={onRetryLearning} onPractice={onPractice} />
    </aside>
  );
}

function WeekSection({ sessions }: { sessions: SavedSession[] | null }) {
  const stats = useMemo(() => (sessions ? weekStats(sessions) : null), [sessions]);
  const peak = stats ? Math.max(60, ...stats.days.map((d) => d.seconds)) : 60;

  return (
    <section className={PAD}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[13px] font-medium text-(--lp-ink-2)">This week</h2>
        {stats && <span className="text-[12px] text-(--lp-ink-3) tabular-nums">{stats.activeDays} of 7 days</span>}
      </div>
      {stats ? (
        <>
          <p className="lp-display m-0 mt-2 text-[28px] leading-none text-(--lp-ink) tabular-nums">{formatWeekTotal(stats.totalSec)}</p>
          <div role="group" aria-label="Practice time per day" className="mt-9 grid grid-cols-7 gap-2">
            {stats.days.map((day, i) => {
              const ran = day.seconds >= 60;
              const name = day.today ? "Today" : new Date(day.start).toLocaleDateString("en-US", { weekday: "long" });
              const tip = `${name}, ${ran ? formatWeekTotal(day.seconds) : "no practice"}`;
              return (
                <Tooltip key={day.start}>
                  <TooltipTrigger
                    render={
                      <div
                        tabIndex={0}
                        aria-label={tip}
                        className="group/bar flex cursor-default flex-col items-center gap-2 rounded-[6px] outline-none focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
                      />
                    }
                  >
                    <div className="flex h-[76px] w-full items-end">
                      <motion.div
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: 0.5, delay: 0.04 * i, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                          height: ran ? `${Math.max(12, (day.seconds / peak) * 100)}%` : 4,
                          originY: 1,
                          background: !ran ? "var(--lp-gray-2)" : day.today ? BAR_TODAY : BAR,
                        }}
                        className="w-full rounded-[6px] transition-opacity duration-150 group-hover/bar:opacity-80"
                      />
                    </div>
                    <span className={cn("text-[11px]", day.today ? "font-semibold text-(--lp-ink)" : "text-(--lp-ink-3)")}>
                      {day.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    {tip}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          <Skeleton className="h-7 w-32 rounded-[8px]" />
          <Skeleton className="h-[96px] rounded-[10px]" />
        </div>
      )}
    </section>
  );
}

function FocusSection({ learning, loaded, onRetry, onPractice }: {
  learning: LearningOverview | null;
  loaded: boolean;
  onRetry: () => void;
  onPractice: (topic: string) => void;
}) {
  const items = homeFocusItems(learning?.focus ?? []);
  return (
    <section className={cn(PAD, "flex flex-1 flex-col")}>
      <h2 className="m-0 text-[15px] font-medium text-(--lp-ink-2)">What to work on next</h2>
      {!loaded ? (
        <div className="mt-4 flex flex-col gap-4" aria-label="Loading learning focus">
          <Skeleton className="h-[72px] rounded-[12px]" />
          <Skeleton className="h-[72px] rounded-[12px]" />
        </div>
      ) : learning === null ? (
        <div className="mt-4 rounded-[14px] bg-(--lp-gray)/55 p-4">
          <p className="m-0 text-[14.5px] leading-[1.45] text-(--lp-ink-2)">Your learning focus couldn&apos;t load right now.</p>
          <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-[10px] px-2 text-[13px] font-medium text-[#1d72dc] outline-none hover:underline focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)">
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="m-0 mt-4 text-[14.5px] leading-[1.5] text-(--lp-ink-2)">
          Checked work from your tutoring sessions will show up here.
        </p>
      ) : (
      <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
        {items.map((item) => (
          <li key={item.skill}>
            <button
              type="button"
              onClick={() => onPractice(item.skill)}
              className="group/focus -mx-3 flex w-[calc(100%+1.5rem)] cursor-pointer items-start gap-3 rounded-[14px] px-3 py-3 text-left outline-none transition-colors duration-150 hover:bg-(--lp-gray)/70 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] leading-snug font-medium text-(--lp-ink)">{item.skill}</span>
                <span className="mt-1 block text-[14.5px] leading-[1.45] text-(--lp-ink-2)">{item.note}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-(--lp-ink-2) transition-colors duration-150 group-hover/focus:text-[#1d72dc]">
                  Practice this
                  <ArrowRight className="size-3.5 transition-transform duration-150 group-hover/focus:translate-x-0.5" strokeWidth={2.4} />
                </span>
              </span>
              <Strength value={item.strength} label={item.label} />
            </button>
          </li>
        ))}
      </ul>
      )}
      {items.length > 0 && (
        <p className="m-0 mt-auto pt-6 text-[12.5px] leading-[1.45] text-(--lp-ink-2)">
          Based on checked answers and the help used.
        </p>
      )}
    </section>
  );
}

function Strength({ value, label }: { value: 1 | 2 | 3; label: string }) {
  return (
    <span role="img" aria-label={label} title={label} className="mt-1 flex shrink-0 items-end gap-[3px]">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className="w-[5px] rounded-full"
          style={{ height: 6 + n * 4, background: n <= value ? BAR : "var(--lp-gray-2)" }}
        />
      ))}
    </span>
  );
}
