"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "@/components/app/AppShell";
import { Icon } from "@/components/app/Icon";
import { CARD, EmptyNote, PageBody, PageHeader, Panel, PanelLink, PRIMARY_BUTTON, ROW_LINE, Segmented, StatStrip, Strength } from "@/components/app/page-kit";
import { sessionHref } from "@/components/app/SessionListRow";
import { useSessionList } from "@/components/app/useSessionList";
import { Skeleton } from "@/components/ui/skeleton";
import { groupSkills, practiceStreak, practiceTotals, weeklyPractice } from "@/lib/app-stats";
import { useClientReady } from "@/lib/client-ready";
import { formatWeekTotal, sessionHeadline, shortDay } from "@/lib/home-stats";
import type { LearnerSkillState } from "@/lib/learning-evidence";
import { loadLearningOverviewClient } from "@/lib/learning-client";
import { readSummary } from "@/lib/session-summary";
import type { SavedSession } from "@/lib/sessions";
import { cn } from "@/lib/utils";

// What the record says, and only what it says: time at the board from the
// sessions, skills from answers the tutor checked (lib/learning-evidence.ts),
// and what clicked from the notes written after each session. Nothing here is
// estimated, and an empty record says so.

type Range = 4 | 12;

export function ProgressView() {
  const mounted = useClientReady();
  const { sessions } = useSessionList(200);
  const [skills, setSkills] = useState<LearnerSkillState[] | null | "failed">(null);
  const [range, setRange] = useState<Range>(12);

  useEffect(() => {
    if (!mounted) return;
    void loadLearningOverviewClient().then((overview) => setSkills(overview ? overview.states : "failed"));
  }, [mounted]);

  const totals = sessions ? practiceTotals(sessions) : null;
  const streak = sessions ? practiceStreak(sessions) : 0;
  const weeks = useMemo(() => (sessions ? weeklyPractice(sessions, range) : null), [sessions, range]);
  const ownSkills = Array.isArray(skills) ? skills.filter((s) => s.status === "independent_recent" || s.status === "retained" || s.status === "review_due").length : null;

  return (
    <AppShell bar>
      <PageBody>
        <PageHeader title="Progress" lede="How much you've practised, and what your tutor has seen you do. Skills only count answers it checked." />

        <StatStrip
          className="mt-8"
          items={[
            { label: "Time at the board", value: totals ? formatWeekTotal(totals.seconds) : "–" },
            { label: "Sessions", value: totals ? totals.sessions : "–" },
            { label: "Days in a row", value: sessions ? streak : "–" },
            { label: "Skills on your own", value: ownSkills ?? "–" },
          ]}
        />

        <div className="mt-5 flex flex-col gap-5">
          <Panel
            title="Time at the board"
            description={weeks ? weekSentence(weeks) : " "}
            action={
              <Segmented<Range>
                size="sm"
                label="Weeks shown"
                value={range}
                onChange={setRange}
                options={[
                  { value: 4, label: "4 weeks" },
                  { value: 12, label: "12 weeks" },
                ]}
              />
            }
          >
            {weeks ? <WeekChart weeks={weeks} /> : <Skeleton className="m-6 h-[180px] rounded-[12px]" />}
          </Panel>

          <SkillsPanel skills={skills} />

          <Clicked sessions={sessions} />
        </div>
      </PageBody>
    </AppShell>
  );
}

function weekSentence(weeks: ReturnType<typeof weeklyPractice>): string {
  const total = weeks.reduce((s, w) => s + w.seconds, 0);
  const active = weeks.filter((w) => w.seconds >= 60).length;
  if (total < 60) return `Nothing yet in the last ${weeks.length} weeks.`;
  return `${formatWeekTotal(total)} over the last ${weeks.length} weeks, practising in ${active} of them.`;
}

function WeekChart({ weeks }: { weeks: ReturnType<typeof weeklyPractice> }) {
  const max = Math.max(...weeks.map((w) => w.seconds), 15 * 60);
  const every = weeks.length > 6 ? 3 : 1;
  return (
    <div className="px-5 pt-5 pb-5 sm:px-6">
      <div role="list" aria-label="Minutes practised each week" className="flex h-[180px] items-end gap-2 sm:gap-3">
        {weeks.map((w) => {
          const minutes = Math.round(w.seconds / 60);
          const height = w.seconds < 60 ? 4 : Math.max(10, (w.seconds / max) * 150);
          return (
            <div key={w.start} role="listitem" aria-label={`Week of ${w.label}: ${minutes} minutes`} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <span
                className={cn(
                  "text-[12px] font-medium text-(--lp-ink-2) tabular-nums transition-opacity duration-150",
                  w.current && minutes > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
              >
                {minutes > 0 ? `${minutes}m` : ""}
              </span>
              <span
                className="w-full max-w-[44px] rounded-[6px] transition-[height] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                style={{ height, background: w.seconds < 60 ? "var(--lp-gray-2)" : w.current ? "#3a80ef" : "var(--lp-sky)" }}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-2.5 flex gap-2 sm:gap-3">
        {weeks.map((w, i) => (
          <span key={w.start} className={cn("min-w-0 flex-1 overflow-visible text-center text-[12px] whitespace-nowrap tabular-nums", w.current ? "font-medium text-(--lp-ink)" : "text-(--lp-ink-3)")}>
            {w.current ? "Now" : (weeks.length - 1 - i) % every === 0 ? w.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function SkillsPanel({ skills }: { skills: LearnerSkillState[] | null | "failed" }) {
  if (skills === null)
    return (
      <Panel title="Skills">
        <div className="flex flex-col gap-3 p-5 sm:p-6">
          <Skeleton className="h-12 rounded-[12px]" />
          <Skeleton className="h-12 rounded-[12px]" />
        </div>
      </Panel>
    );
  if (skills === "failed")
    return (
      <Panel title="Skills">
        <EmptyNote>Your skills couldn&apos;t load right now. Try again in a moment.</EmptyNote>
      </Panel>
    );
  const groups = groupSkills(skills);
  if (groups.length === 0)
    return (
      <Panel title="Skills">
        <EmptyNote action={<Link href="/session" className={PRIMARY_BUTTON}>Start a session</Link>}>
          Skills show up here once your tutor has checked some of your answers. Each one says whether you got it with help or on your own.
        </EmptyNote>
      </Panel>
    );
  return (
    <Panel title="Skills" description="From every answer your tutor checked." action={<PanelLink href="/practice">Practice</PanelLink>}>
      <div className="flex flex-col pt-2 pb-2">
        {groups.map((group) => (
          <div key={group.key} className={cn("border-t px-5 pt-4 pb-2 first:border-t-0 sm:px-6", ROW_LINE)}>
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="m-0 text-[13.5px] font-semibold text-(--lp-ink)">{group.title}</h3>
              <span className="text-[12.5px] text-(--lp-ink-3) tabular-nums">{group.items.length}</span>
            </div>
            <p className="m-0 mt-0.5 text-[13px] text-(--lp-ink-2)">{group.hint}</p>
            <ul className="m-0 mt-2 flex list-none flex-col p-0">
              {group.items.map((skill) => (
                <li key={skill.skillKey} className="flex items-center gap-4 py-2.5">
                  <Strength value={group.strength} label={group.title} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14.5px] font-medium text-(--lp-ink)">{skill.label}</span>
                    <span className="truncate text-[13px] text-(--lp-ink-2)">
                      {skill.correctCount} of {skill.attemptCount} right
                      {skill.independentCorrectCount > 0 ? `, ${skill.independentCorrectCount} with no help` : ""} · {shortDay(skill.latestAttemptAt)}
                    </span>
                  </span>
                  {group.key !== "solid" && (
                    <Link
                      href={`/session?topic=${encodeURIComponent(skill.label)}`}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[8px] px-2 text-[13px] font-medium text-(--lp-ink-2) outline-none transition-colors duration-150 hover:text-[#1d72dc] focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
                    >
                      Practice
                      <Icon icon={ArrowRight02Icon} size={14} />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Clicked({ sessions }: { sessions: SavedSession[] | null }) {
  const notes = useMemo(() => {
    if (!sessions) return null;
    const wins: { text: string; session: SavedSession }[] = [];
    const stuck: { text: string; session: SavedSession }[] = [];
    for (const s of sessions) {
      const summary = readSummary(s.summary);
      if (!summary) continue;
      for (const w of summary.wins) if (wins.length < 5) wins.push({ text: w, session: s });
      for (const t of summary.stuck) if (stuck.length < 4) stuck.push({ text: t, session: s });
      if (wins.length >= 5 && stuck.length >= 4) break;
    }
    return { wins, stuck };
  }, [sessions]);

  if (!notes) return null;
  if (notes.wins.length === 0 && notes.stuck.length === 0)
    return (
      <Panel title="What clicked lately">
        <EmptyNote>After each session your tutor writes down what went well and what&apos;s still shaky. The latest show up here.</EmptyNote>
      </Panel>
    );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2">
      <NoteList title="What clicked lately" items={notes.wins} tone="win" />
      <NoteList title="Still shaky" items={notes.stuck} tone="stuck" empty="Nothing shaky in your latest sessions." />
    </div>
  );
}

function NoteList({
  title,
  items,
  tone,
  empty,
}: {
  title: string;
  items: { text: string; session: SavedSession }[];
  tone: "win" | "stuck";
  empty?: string;
}) {
  return (
    <section className={cn(CARD, "px-5 pt-5 pb-4 sm:px-6")}>
      <h2 className="m-0 text-[16px] font-semibold text-(--lp-ink)">{title}</h2>
      {items.length === 0 ? (
        <p className="m-0 mt-2 text-[14px] text-(--lp-ink-2)">{empty}</p>
      ) : (
        <ul className="m-0 mt-3 flex list-none flex-col gap-3.5 p-0">
          {items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                  tone === "win" ? "bg-(--lp-sky-soft) text-(--lp-sky-deep)" : "bg-(--lp-gray) text-(--lp-ink-2)",
                )}
              >
                {tone === "win" ? <Icon icon={CheckmarkCircle02Icon} size={14} /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[14.5px] leading-[1.5] text-(--lp-ink)">{item.text}</span>
                <Link
                  href={sessionHref(item.session)}
                  className="mt-0.5 inline-block rounded-[4px] text-[12.5px] text-(--lp-ink-3) outline-none hover:text-(--lp-ink-2) focus-visible:ring-2 focus-visible:ring-(--lp-sky)"
                >
                  {sessionHeadline(item.session).title} · {shortDay(item.session.startedAt)}
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
