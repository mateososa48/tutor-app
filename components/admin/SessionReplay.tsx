"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Pause, Play, Search } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { TopBar } from "@/components/app/TopBar";
import type { AdminFrame, AdminSessionDetail } from "@/lib/admin-data";
import {
  analyzeSession,
  buildLog,
  formatClock,
  lastIndexAtOrBefore,
  mergeUtterances,
  speakingIntervals,
  type LogLane,
  type TimelineEvent,
} from "@/lib/session-recording";
import { cn } from "@/lib/utils";

// The admin session replay (Sept 15 2026): the board picture at any moment,
// a timeline of who spoke and what the tutor did, and the full event log, all
// on one clock. Space plays, arrow keys jump, clicking anything seeks.

const LANES: ReadonlyArray<{ lane: LogLane; label: string; dot: string; text: string }> = [
  { lane: "student", label: "Student", dot: "#3d9cff", text: "#1b6ac9" },
  { lane: "tutor", label: "Tutor", dot: "#121215", text: "#3f3f48" },
  { lane: "action", label: "Actions", dot: "#ae3ec9", text: "#8a2aa6" },
  { lane: "board", label: "Board", dot: "#099268", text: "#08795a" },
  { lane: "system", label: "System", dot: "#8a8a94", text: "#5b5b66" },
];
const LANE = Object.fromEntries(LANES.map((l) => [l.lane, l])) as Record<LogLane, (typeof LANES)[number]>;
const TONE = { warn: { dot: "#e8950c", text: "#9a5a00" }, error: { dot: "#e03131", text: "#c62828" } } as const;
const RATES = [1, 2, 4, 8] as const;
const TICK_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map((s) => s * 1000);

function niceTicks(duration: number): number[] {
  const step = TICK_STEPS.find((s) => duration / s <= 8) ?? 3_600_000;
  const out: number[] = [];
  for (let v = 0; v <= duration; v += step) out.push(v);
  return out;
}

function secondsText(ms: number | null): string {
  return ms === null ? "none" : `${(ms / 1000).toFixed(1)} s`;
}

function longDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const r = s % 60;
  return h ? `${h} h ${m} min` : m ? `${m} min ${r} s` : `${r} s`;
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" | "error" }) {
  return (
    <div className="bg-white px-3.5 py-2.5">
      <dt className="text-[11.5px] text-(--lp-ink-2)">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-medium tabular-nums text-(--lp-ink)" style={tone ? { color: TONE[tone].text } : undefined}>
        {value}
      </dd>
    </div>
  );
}

function FilterChip({ pressed, onClick, dot, children }: { pressed: boolean; onClick: () => void; dot?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-medium outline-none transition-[background-color,color,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-(--lp-sky)/40 active:scale-[0.97]",
        pressed ? "border-(--lp-ink) bg-(--lp-ink) text-white" : "border-(--lp-line-strong) bg-white text-(--lp-ink-2) hover:text-(--lp-ink)",
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </button>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-(--lp-ink-2) outline-none transition-colors duration-150 hover:bg-(--lp-gray) hover:text-(--lp-ink) focus-visible:ring-2 focus-visible:ring-(--lp-sky)/40 disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

export function SessionReplay({ session, events, frames }: { session: AdminSessionDetail; events: TimelineEvent[]; frames: AdminFrame[] }) {
  const log = useMemo(() => buildLog(events), [events]);
  const duration = useMemo(() => {
    let last = 0;
    for (const e of events) last = Math.max(last, e.offsetMs);
    for (const f of frames) last = Math.max(last, f.offsetMs);
    return Math.max(session.durationSec * 1000, last + 1500, 1000);
  }, [events, frames, session.durationSec]);
  const analysis = useMemo(() => analyzeSession(events, duration), [events, duration]);
  const utterances = useMemo(() => mergeUtterances(events), [events]);
  const speaking = useMemo(() => speakingIntervals(events), [events]);

  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<(typeof RATES)[number]>(2);
  const [lanes, setLanes] = useState<ReadonlySet<LogLane>>(() => new Set(LANES.map((l) => l.lane)));
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [everything, setEverything] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const seek = (ms: number) => {
    const next = Math.min(duration, Math.max(0, ms));
    tRef.current = next;
    setT(next);
  };

  // Playback moves the clock in real time, times the chosen speed.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const next = Math.min(duration, tRef.current + (now - last) * rate);
      last = now;
      tRef.current = next;
      setT(next);
      if (next >= duration) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, duration]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const jump = (e.shiftKey ? 30_000 : 5000) * (e.key === "ArrowRight" ? 1 : -1);
        const next = Math.min(duration, Math.max(0, tRef.current + jump));
        tRef.current = next;
        setT(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duration]);

  const frameIndex = lastIndexAtOrBefore(frames, t);
  const frame = frameIndex >= 0 ? frames[frameIndex] : null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return log.filter(
      (e) =>
        (everything || !e.hidden) &&
        lanes.has(e.lane) &&
        (!issuesOnly || e.issue) &&
        (!q || `${e.title}\n${e.detail ?? ""}`.toLowerCase().includes(q)),
    );
  }, [log, everything, lanes, issuesOnly, query]);
  const activeIndex = lastIndexAtOrBefore(visible, t);
  const activeKey = activeIndex >= 0 ? visible[activeIndex].key : null;

  useEffect(() => {
    if (playing) activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeKey, playing]);

  const pct = (ms: number) => `${(Math.min(duration, Math.max(0, ms)) / duration) * 100}%`;
  const span = (ms: number) => `max(3px, ${(Math.max(0, ms) / duration) * 100}%)`;
  const seekFromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    seek(((e.clientX - rect.left) / rect.width) * duration);
  };

  const tutorBars = speaking.length
    ? speaking.map((s) => ({ startMs: s.startMs, endMs: s.endMs, label: "Tutor voice" }))
    : utterances.filter((u) => u.role === "tutor").map((u) => ({ startMs: u.startMs, endMs: u.endMs + 400, label: u.text }));
  const timelineLanes: Array<{ key: string; label: string; marks: ReactNode }> = [
    {
      key: "student",
      label: "Student",
      marks: utterances
        .filter((u) => u.role === "student")
        .map((u, i) => (
          <span key={i} title={`${formatClock(u.startMs)} ${u.text}`} className="absolute inset-y-[3px] rounded-[3px]" style={{ left: pct(u.startMs), width: span(u.endMs - u.startMs + 400), background: LANE.student.dot }} />
        )),
    },
    {
      key: "tutor",
      label: "Tutor",
      marks: tutorBars.map((b, i) => (
        <span key={i} title={`${formatClock(b.startMs)} ${b.label}`} className="absolute inset-y-[3px] rounded-[3px]" style={{ left: pct(b.startMs), width: span(b.endMs - b.startMs), background: LANE.tutor.dot }} />
      )),
    },
    {
      key: "action",
      label: "Actions",
      marks: log
        .filter((e) => e.lane === "action" && !e.hidden)
        .map((e) => (
          <span key={e.key} title={`${formatClock(e.offsetMs)} ${e.title}`} className="absolute inset-y-[2px] w-[3px] -translate-x-1/2 rounded-full" style={{ left: pct(e.offsetMs), background: e.tone === "error" ? TONE.error.dot : LANE.action.dot }} />
        )),
    },
    {
      key: "board",
      label: "Board",
      marks: frames.map((f) => (
        <span key={f.id} title={`${formatClock(f.offsetMs)} board picture (${f.reason})`} className="absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-[2px]" style={{ left: pct(f.offsetMs), background: LANE.board.dot }} />
      )),
    },
    {
      key: "issues",
      label: "Issues",
      marks: analysis.flags.map((f, i) => (
        <span key={i} title={`${formatClock(f.offsetMs)} ${f.label}`} className="absolute top-1/2 size-[8px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1.5px]" style={{ left: pct(f.offsetMs), background: TONE[f.tone].dot }} />
      )),
    },
  ];

  const student = session.userName ?? session.userEmail ?? "Unknown student";
  const toggleLane = (lane: LogLane) =>
    setLanes((prev) => {
      const next = new Set(prev);
      if (next.has(lane)) next.delete(lane);
      else next.add(lane);
      return next;
    });

  return (
    <AppShell defaultOpen={false}>
      <TopBar
        actions={
          <div className="flex items-center gap-1.5">
            {(["md", "json"] as const).map((format) => (
              <a
                key={format}
                href={`/api/admin/sessions/${encodeURIComponent(session.id)}/export?format=${format}`}
                aria-label={`Export as ${format === "md" ? "Markdown" : "JSON"}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-(--lp-line-strong) bg-white px-2 text-[12.5px] font-medium text-(--lp-ink) outline-none transition-colors duration-150 hover:bg-(--lp-gray) focus-visible:ring-2 focus-visible:ring-(--lp-sky)/40 sm:px-2.5"
              >
                <Download className="size-3.5" strokeWidth={2.2} />
                <span className="hidden sm:inline">{format === "md" ? "Markdown" : "JSON"}</span>
              </a>
            ))}
          </div>
        }
      >
        <Link href="/admin" aria-label="Back to sessions" className="inline-flex shrink-0 items-center gap-1 rounded-md py-1 pr-1.5 text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-(--lp-ink) focus-visible:ring-2 focus-visible:ring-(--lp-sky)/40">
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Sessions</span>
        </Link>
        <span aria-hidden className="h-4 w-px shrink-0 bg-(--lp-line-strong)" />
        <span className="truncate font-medium text-(--lp-ink)">{student}</span>
        <span className="hidden min-w-0 truncate text-(--lp-ink-2) md:inline">
          {session.title} ·{" "}
          <time suppressHydrationWarning dateTime={new Date(session.startedAt).toISOString()}>
            {new Date(session.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </time>
        </span>
      </TopBar>

      <main className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        <div className="mx-auto grid w-full max-w-[1560px] gap-5 px-4 py-4 sm:px-5 sm:py-5 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
          <section aria-label="Replay" className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <dl className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-(--lp-line) bg-(--lp-line) sm:grid-cols-3 xl:grid-cols-5">
              <Stat label="Length" value={longDuration(analysis.durationMs)} />
              <Stat label="Lines, student / tutor" value={`${analysis.studentTurns} / ${analysis.tutorTurns}`} />
              <Stat label="Tool calls" value={analysis.toolCalls} />
              <Stat label="Failed tools" value={analysis.toolErrors} tone={analysis.toolErrors ? "error" : undefined} />
              <Stat label="Errors" value={analysis.errors} tone={analysis.errors ? "error" : undefined} />
              <Stat label="Interruptions" value={analysis.interruptions} tone={analysis.interruptions ? "warn" : undefined} />
              <Stat label="Reconnects" value={analysis.reconnects} tone={analysis.reconnects ? "warn" : undefined} />
              <Stat label="Reply time, median / slowest" value={`${secondsText(analysis.medianReplyMs)} / ${secondsText(analysis.slowestReplyMs)}`} />
              <Stat label="Longest silence" value={secondsText(analysis.longestSilenceMs || null)} tone={analysis.longestSilenceMs >= 20_000 ? "warn" : undefined} />
              <Stat label="Board pictures" value={frames.length} />
            </dl>

            <figure className="shrink-0 overflow-hidden rounded-[14px] border border-(--lp-line) bg-white">
              <div className="relative aspect-[16/10] w-full bg-[#fbfbfc]">
                {frame ? (
                  // eslint-disable-next-line @next/next/no-img-element -- recorded pictures come from an admin API route
                  <img key={frame.id} src={`/api/admin/frames/${frame.id}`} alt={`The board at ${formatClock(frame.offsetMs)}`} className="absolute inset-0 size-full object-contain" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center px-8 text-center text-[13.5px] leading-relaxed text-(--lp-ink-2)">
                    {frames.length === 0 ? "No board pictures in this session. Sessions recorded from Sept 15 2026 on have them." : "The first board picture comes later. Press play or pick a moment."}
                  </div>
                )}
              </div>
              <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-(--lp-line) px-3.5 py-2 text-[12.5px] text-(--lp-ink-2)">
                {frame ? (
                  <>
                    <span className="font-medium text-(--lp-ink)">Board at {formatClock(frame.offsetMs)}</span>
                    <span>{frame.reason}</span>
                    <span className="tabular-nums">
                      Picture {frameIndex + 1} of {frames.length}
                    </span>
                  </>
                ) : (
                  <span>No picture yet</span>
                )}
                <span className="ml-auto flex gap-0.5">
                  <IconButton label="Previous picture" disabled={frameIndex <= 0} onClick={() => seek(frames[frameIndex - 1].offsetMs)}>
                    <ChevronLeft className="size-4" />
                  </IconButton>
                  <IconButton label="Next picture" disabled={frameIndex >= frames.length - 1} onClick={() => seek(frames[frameIndex + 1].offsetMs)}>
                    <ChevronRight className="size-4" />
                  </IconButton>
                </span>
              </figcaption>
            </figure>

            <div className="shrink-0 rounded-[14px] border border-(--lp-line) bg-white px-4 pt-3 pb-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!playing && t >= duration) seek(0);
                    setPlaying((p) => !p);
                  }}
                  aria-label={playing ? "Pause" : "Play"}
                  className="grid size-9 place-items-center rounded-full bg-(--lp-ink) text-white outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-(--lp-sky) focus-visible:ring-offset-2 active:scale-95"
                >
                  {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="size-4 translate-x-px" fill="currentColor" />}
                </button>
                <span className="font-mono text-[13px] tabular-nums text-(--lp-ink)">
                  {formatClock(t)} <span className="text-(--lp-ink-2)">/ {formatClock(duration)}</span>
                </span>
                <div role="radiogroup" aria-label="Playback speed" className="ml-auto flex rounded-full border border-(--lp-line-strong) p-0.5">
                  {RATES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={rate === r}
                      onClick={() => setRate(r)}
                      className={cn(
                        "h-6 min-w-9 rounded-full px-2 text-[12px] font-medium tabular-nums outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-(--lp-sky)/40",
                        rate === r ? "bg-(--lp-ink) text-white" : "text-(--lp-ink-2) hover:text-(--lp-ink)",
                      )}
                    >
                      {r}×
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex gap-3">
                <div aria-hidden className="w-[52px] shrink-0 pt-[22px] text-[11px] text-(--lp-ink-2)">
                  {timelineLanes.map((l) => (
                    <div key={l.key} className="flex h-[18px] items-center" style={{ marginBottom: 6 }}>
                      {l.label}
                    </div>
                  ))}
                </div>
                <div
                  ref={trackRef}
                  role="slider"
                  tabIndex={0}
                  aria-label="Session time"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration)}
                  aria-valuenow={Math.round(t)}
                  aria-valuetext={formatClock(t)}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setPlaying(false);
                    seekFromPointer(e);
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons === 1) seekFromPointer(e);
                  }}
                  className="relative min-w-0 flex-1 cursor-pointer touch-none rounded-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-(--lp-sky)/40"
                >
                  <div className="relative h-[22px] text-[10.5px] text-(--lp-ink-2) tabular-nums">
                    {niceTicks(duration).map((tick) => (
                      <span key={tick} className="absolute top-0 -translate-x-1/2 whitespace-nowrap first:translate-x-0" style={{ left: pct(tick) }}>
                        {formatClock(tick).replace(/\.0$/, "")}
                      </span>
                    ))}
                  </div>
                  {timelineLanes.map((l) => (
                    <div key={l.key} className="relative h-[18px] overflow-hidden rounded-[4px] bg-(--lp-gray)" style={{ marginBottom: 6 }}>
                      {l.marks}
                    </div>
                  ))}
                  <span aria-hidden className="pointer-events-none absolute top-[18px] bottom-0 w-[2px] -translate-x-1/2 rounded-full bg-(--lp-sky)" style={{ left: pct(t) }} />
                </div>
              </div>
              <p className="mt-1 text-[11.5px] text-(--lp-ink-2)">Space plays or pauses. Arrow keys jump 5 seconds, 30 with Shift. Hover a mark to read it.</p>
            </div>
          </section>

          <section aria-label="Everything that happened" className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-[14px] border border-(--lp-line) bg-white lg:min-h-0">
            <div className="flex flex-col gap-2 border-b border-(--lp-line) px-3 py-3">
              <label className="relative block">
                <span className="sr-only">Search the session</span>
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-(--lp-ink-2)" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search words, tools, errors"
                  className="h-8 w-full rounded-[8px] border border-(--lp-line-strong) bg-white pr-2.5 pl-8 text-[13px] text-(--lp-ink) outline-none placeholder:text-(--lp-ink-2) focus-visible:border-(--lp-sky) focus-visible:ring-2 focus-visible:ring-(--lp-sky)/25"
                />
              </label>
              <div className="flex flex-wrap items-center gap-1">
                {LANES.map((l) => (
                  <FilterChip key={l.lane} pressed={lanes.has(l.lane)} onClick={() => toggleLane(l.lane)} dot={l.dot}>
                    {l.label}
                  </FilterChip>
                ))}
                <span aria-hidden className="mx-0.5 h-5 w-px bg-(--lp-line)" />
                <FilterChip pressed={issuesOnly} onClick={() => setIssuesOnly((v) => !v)}>
                  Issues only
                </FilterChip>
                <FilterChip pressed={everything} onClick={() => setEverything((v) => !v)}>
                  Every event
                </FilterChip>
              </div>
              <p className="text-[12px] text-(--lp-ink-2) tabular-nums">
                {visible.length} of {log.length} entries
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {visible.length === 0 ? (
                <p className="px-6 py-10 text-center text-[13.5px] text-(--lp-ink-2)">Nothing matches these filters.</p>
              ) : (
                visible.map((e, i) => {
                  const active = i === activeIndex;
                  const open = expanded.has(e.key);
                  const long = (e.detail?.split("\n").length ?? 0) > 4 || (e.detail?.length ?? 0) > 320;
                  const tone = e.tone === "default" ? null : TONE[e.tone];
                  const spoken = e.lane === "student" || e.lane === "tutor";
                  return (
                    <div
                      key={e.key}
                      ref={active ? activeRowRef : undefined}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setPlaying(false);
                        seek(e.offsetMs);
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") {
                          setPlaying(false);
                          seek(e.offsetMs);
                        }
                      }}
                      className={cn(
                        "grid cursor-pointer grid-cols-[52px_minmax(0,1fr)] gap-x-3 border-b border-(--lp-line)/70 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-(--lp-gray)/60 focus-visible:bg-(--lp-sky-tint)",
                        active && "bg-(--lp-sky-tint) hover:bg-(--lp-sky-tint)",
                      )}
                    >
                      <span className="pt-px font-mono text-[11.5px] text-(--lp-ink-2) tabular-nums">{formatClock(e.offsetMs)}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: tone?.text ?? LANE[e.lane].text }}>
                          <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: tone?.dot ?? LANE[e.lane].dot }} />
                          {LANE[e.lane].label}
                          {e.endMs !== undefined && e.endMs - e.offsetMs >= 900 && (
                            <span className="font-normal text-(--lp-ink-2) tabular-nums">· {((e.endMs - e.offsetMs) / 1000).toFixed(1)} s</span>
                          )}
                        </div>
                        <p className={cn("mt-0.5 text-[13.5px] leading-snug break-words text-(--lp-ink)", !spoken && "font-medium")}>{e.title}</p>
                        {e.detail && (
                          <>
                            <pre className={cn("mt-1 font-mono text-[11.5px] leading-[1.55] break-words whitespace-pre-wrap text-(--lp-ink-2)", long && !open && "line-clamp-4")}>{e.detail}</pre>
                            {long && (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setExpanded((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(e.key)) next.delete(e.key);
                                    else next.add(e.key);
                                    return next;
                                  });
                                }}
                                className="mt-1 rounded-sm text-[12px] font-medium text-[#1b6ac9] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-(--lp-sky)/40"
                              >
                                {open ? "Show less" : "Show all"}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
