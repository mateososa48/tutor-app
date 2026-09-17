"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ChalkMark } from "@/components/app/ChalkMark";
import { FooterWave } from "@/components/landing/FooterWave";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

// Home (Mateo's Figma, Sept 16): a greeting, a card that starts a session over
// a slow voice wave, the earlier sessions with a picture of each board, and a
// side column with this week's practice and what the tutor remembers.

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function today(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

const CARD = "rounded-[20px] border border-(--lp-line) bg-(--lp-surface)";
const SHOWN = 6;

export default function HomePage() {
  const mounted = useClientReady();
  const router = useRouter();
  const { data: auth } = useSession();
  const [sessions, setSessions] = useState<SavedSession[] | null>(null);
  const [notes, setNotes] = useState<string[] | null>(null);

  useEffect(() => {
    if (!mounted) return;
    // Enough to cover the week's chart as well as the list.
    loadSessions(60).then(setSessions);
    fetch("/api/profile/notes")
      .then((res) => (res.ok ? res.json() : { notes: [] }))
      .then((data: { notes?: string[] }) => setNotes([...(data.notes ?? [])].reverse()))
      .catch(() => setNotes([]));
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

          <div className="mt-9 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
            <div className="flex min-w-0 flex-col gap-6">
              <StartCard onStart={() => router.push("/session")} />
              <EarlierCard sessions={sessions} onOpen={(id) => router.push(`/session/${id}`)} onDelete={remove} />
            </div>
            {/* Stacked sheets: each tucks over the bottom of the one above. */}
            <div className="flex flex-col">
              <WeekCard sessions={sessions} className="relative z-0 pb-12" />
              <MemoryCard notes={notes} className="relative z-10 -mt-6" />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── Start ──────────────────────────────────────────────────────────────────

// The landing footer's voice wave, lighter, drifting at half speed.
const WAVE = {
  background: [1, 1, 1] as [number, number, number],
  top: [0.62, 0.79, 1] as [number, number, number],
  deep: [0.38, 0.64, 0.98] as [number, number, number],
  ink: [0.3, 0.58, 0.96] as [number, number, number],
};

function StartCard({ onStart }: { onStart: () => void }) {
  return (
    <button
      type="button"
      onClick={onStart}
      className={cn(
        CARD,
        "group relative isolate flex h-[212px] w-full cursor-pointer flex-col justify-start overflow-hidden text-left outline-none lg:w-[73%]",
        "transition-[translate] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)",
        "active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      )}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[56%]">
        <FooterWave className="absolute inset-0" {...WAVE} edge={14} swing={1.2} reserve={14} waveScale={2.2} speed={0.45} />
      </span>
      <span className="flex items-start justify-between gap-4 p-6">
        <span className="min-w-0">
          <span className="block text-[18px] leading-tight font-semibold text-(--lp-ink)">Start a new session</span>
          <span className="mt-1.5 block text-[14px] text-(--lp-ink-2)">Tell your tutor what you&apos;re stuck on.</span>
        </span>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--lp-ink) text-white transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 group-active:scale-95">
          <Plus className="size-5" strokeWidth={2.4} />
        </span>
      </span>
    </button>
  );
}

// ── Earlier ────────────────────────────────────────────────────────────────

function EarlierCard({
  sessions,
  onOpen,
  onDelete,
}: {
  sessions: SavedSession[] | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = sessions ? (all ? sessions : sessions.slice(0, SHOWN)) : null;

  return (
    <section className={cn(CARD, "px-5 pt-6 pb-3 sm:px-7")}>
      <h2 className="lp-display m-0 text-[22px] text-(--lp-ink)">Earlier</h2>
      {shown === null ? (
        <div className="mt-4 flex flex-col gap-3 pb-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[46px] rounded-[10px]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="m-0 mt-3 pb-4 text-[14px] text-(--lp-ink-2)">Your sessions will show up here.</p>
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
        // A board picture from the session (the newest one), served per user.
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

// ── This week ──────────────────────────────────────────────────────────────

function WeekCard({ sessions, className }: { sessions: SavedSession[] | null; className?: string }) {
  const stats = useMemo(() => (sessions ? weekStats(sessions) : null), [sessions]);
  const peak = stats ? Math.max(60, ...stats.days.map((d) => d.seconds)) : 60;
  const label = stats
    ? stats.days.map((d) => `${new Date(d.start).toLocaleDateString("en-US", { weekday: "long" })}: ${formatWeekTotal(d.seconds)}`).join(", ")
    : "";

  return (
    <section className={cn(CARD, "p-6", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[13px] font-medium text-(--lp-ink-2)">This week</h2>
        {stats && <span className="text-[12px] text-(--lp-ink-3) tabular-nums">{stats.activeDays} of 7 days</span>}
      </div>
      {stats ? (
        <>
          <p className="lp-display m-0 mt-2 text-[28px] leading-none text-(--lp-ink) tabular-nums">{formatWeekTotal(stats.totalSec)}</p>
          <div role="img" aria-label={`Practice time this week. ${label}.`} className="mt-6 grid grid-cols-7 gap-2">
            {stats.days.map((day, i) => {
              const ran = day.seconds >= 60;
              return (
                <div key={day.start} className="flex flex-col items-center gap-2">
                  <div className="flex h-[68px] w-full items-end">
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.5, delay: 0.04 * i, ease: [0.16, 1, 0.3, 1] }}
                      style={{ height: ran ? `${Math.max(12, (day.seconds / peak) * 100)}%` : 3, originY: 1 }}
                      className={cn(
                        "w-full rounded-[5px]",
                        !ran ? "bg-(--lp-gray-2)" : day.today ? "bg-[#1d72dc]" : "bg-(--lp-sky)",
                      )}
                    />
                  </div>
                  <span className={cn("text-[11px]", day.today ? "font-semibold text-(--lp-ink)" : "text-(--lp-ink-3)")}>{day.label}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          <Skeleton className="h-7 w-32 rounded-[8px]" />
          <Skeleton className="h-[88px] rounded-[10px]" />
        </div>
      )}
    </section>
  );
}

// ── What the tutor remembers ───────────────────────────────────────────────

function MemoryCard({ notes, className }: { notes: string[] | null; className?: string }) {
  return (
    <section className={cn(CARD, "p-6 pb-7", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[13px] font-medium text-(--lp-ink-2)">Your tutor remembers</h2>
        <Link
          href="/settings"
          className="rounded-[6px] text-[12.5px] font-medium text-(--lp-ink-2) outline-none hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
        >
          Edit
        </Link>
      </div>
      {notes === null ? (
        <div className="mt-4 flex flex-col gap-2.5">
          {[80, 64, 72].map((w) => (
            <Skeleton key={w} className="h-4 rounded-[6px]" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <p className="m-0 mt-3 text-[14px] leading-[1.5] text-(--lp-ink-2)">
          Nothing yet. As you work together, your tutor notes what helps you.
        </p>
      ) : (
        <ul className="m-0 mt-3.5 flex list-none flex-col gap-2.5 p-0">
          {notes.slice(0, 5).map((note) => (
            <li key={note} className="text-[14.5px] leading-[1.45] text-(--lp-ink)">
              {note}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
