"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { AppShell } from "@/components/app/AppShell";
import { Icon } from "@/components/app/Icon";
import { CARD, EmptyNote, PageBody, PageHeader, Panel, PanelLink, ROW_LINE, Strength } from "@/components/app/page-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { practiceQueue, SKILL_GROUPS } from "@/lib/app-stats";
import { useClientReady } from "@/lib/client-ready";
import { shortDay } from "@/lib/home-stats";
import type { LearnerSkillState } from "@/lib/learning-evidence";
import { loadLearningOverviewClient } from "@/lib/learning-client";
import { matchLevel } from "@/lib/profile-options";
import { gradeNumber, lessonsForGrade, STAGED_LESSONS, type StagedLesson } from "@/lib/staged-lessons";
import { SKILL_CATALOG } from "@/lib/skill-catalog";
import { cn } from "@/lib/utils";

// Two ways to practise, both a tap from a session. Reviews come from the
// record: skills that slipped, that are due a spaced check, or that only went
// right with help, and each opens a session on that skill. Lessons are the ten
// staged ones (lib/staged-lessons.ts): each carries a rehearsed plan (three
// problems, the mistake to expect, the first picture) that rides into the
// session's instructions, so it runs like something prepared.

// Each lesson's grade band, from the catalog skill it sits on.
const LESSON_BANDS: Record<string, [number, number]> = Object.fromEntries(
  STAGED_LESSONS.map((l) => {
    const [lo, hi] = (SKILL_CATALOG.find((s) => s.key === l.skillKey)?.gradeBand ?? "5-12").split("-").map(Number);
    return [l.key, [Math.max(5, lo), Math.min(12, hi)] as [number, number]];
  }),
);

function inBand(lesson: StagedLesson, grade: string | null | undefined): boolean {
  const g = gradeNumber(grade);
  const band = LESSON_BANDS[lesson.key];
  return g !== null && Boolean(band) && g >= band[0] && g <= band[1];
}

// "today" and "yesterday" read lowercase mid-sentence; dates and weekdays keep their capitals.
const lowerDay = (day: string) => (day === "Today" || day === "Yesterday" ? day.toLowerCase() : day);

const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

function gradeText(lesson: StagedLesson) {
  const [lo, hi] = LESSON_BANDS[lesson.key] ?? [5, 12];
  return lo === hi ? `${ordinal(lo)} grade` : `${ordinal(lo)} to ${ordinal(hi)} grade`;
}

const WHY: Record<string, string> = Object.fromEntries(SKILL_GROUPS.flatMap((g) => g.statuses.map((s) => [s, g.title])));

export function PracticeView() {
  const mounted = useClientReady();
  const [skills, setSkills] = useState<LearnerSkillState[] | null | "failed">(null);
  const [grade, setGrade] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!mounted) return;
    void loadLearningOverviewClient().then((overview) => setSkills(overview ? overview.states : "failed"));
    fetch("/api/onboarding")
      .then((res) => (res.ok ? res.json() : null))
      .then((row: { gradeLevel?: string | null } | null) => setGrade(row?.gradeLevel ?? null))
      .catch(() => setGrade(null));
  }, [mounted]);

  const queue = Array.isArray(skills) ? practiceQueue(skills, 6) : null;
  const gradeLabel = grade ? matchLevel(grade)?.label ?? grade : null;
  const ordered = grade === undefined ? null : lessonsForGrade(grade, STAGED_LESSONS.length);
  const fits = ordered ? ordered.filter((l) => inBand(l, grade)).length : 0;
  const picked = ordered ? ordered.slice(0, Math.max(4, Math.min(fits, 6))) : null;
  const more = ordered && picked ? ordered.slice(picked.length) : null;

  return (
    <AppShell bar>
      <PageBody>
        <PageHeader
          title="Practice"
          lede="Short sessions on what's worth another go. Pick one and the tutor starts with a plan for it."
        />

        <Panel
          className="mt-8"
          title="Worth another go"
          description="From your checked answers, most urgent first."
          action={Array.isArray(skills) && skills.length > 0 ? <PanelLink href="/progress">All skills</PanelLink> : undefined}
        >
          {queue === null && skills !== "failed" ? (
            <div className="flex flex-col gap-3 p-5 sm:p-6">
              <Skeleton className="h-12 rounded-[12px]" />
              <Skeleton className="h-12 rounded-[12px]" />
            </div>
          ) : skills === "failed" ? (
            <EmptyNote>Your skills couldn&apos;t load right now. The lessons below still work.</EmptyNote>
          ) : queue && queue.length === 0 ? (
            <EmptyNote>
              {Array.isArray(skills) && skills.length > 0
                ? "Nothing is due. Everything you've practised, you've done on your own lately. A lesson below is a good next step."
                : "Once your tutor has checked a few of your answers, the skills worth another go show up here. Until then, try a lesson."}
            </EmptyNote>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0 pt-2 pb-2">
              {queue!.map((skill) => (
                <li key={skill.skillKey} className={cn("flex items-center gap-4 border-t px-5 py-3.5 first:border-t-0 sm:px-6", ROW_LINE)}>
                  <Strength value={skill.status === "needs_revisit" || skill.status === "building" ? 1 : 2} label={WHY[skill.status]} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-medium text-(--lp-ink)">{skill.label}</span>
                    <span className="truncate text-[13px] text-(--lp-ink-2)">
                      {WHY[skill.status]} · last practised {lowerDay(shortDay(skill.latestAttemptAt))}
                    </span>
                  </span>
                  <StartLink href={`/session?topic=${encodeURIComponent(skill.label)}`} label={`Practise ${skill.label}`} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <section className="mt-12" aria-labelledby="lessons-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="lessons-heading" className="lp-display m-0 text-[22px] font-medium text-(--lp-ink)">
                Lessons
              </h2>
              <p className="m-0 mt-1 text-[14px] text-(--lp-ink-2)">
                Three problems each, from a warm-up to a stretch.{gradeLabel ? ` Picked for ${gradeLabel.toLowerCase()} first.` : ""}
              </p>
            </div>
            {!gradeLabel && grade === null && (
              <Link href="/tutor#about" className="rounded-[6px] text-[13px] font-medium text-(--lp-ink-2) outline-none hover:text-(--lp-ink) focus-visible:ring-2 focus-visible:ring-(--lp-sky)">
                Add your grade
              </Link>
            )}
          </div>

          {picked === null ? (
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[196px] rounded-[20px]" />
              ))}
            </div>
          ) : (
            <>
              <ul className="m-0 mt-5 grid list-none grid-cols-[minmax(0,1fr)] gap-4 p-0 md:grid-cols-2">
                {picked.map((lesson) => (
                  <LessonCard key={lesson.key} lesson={lesson} />
                ))}
              </ul>
              {more && more.length > 0 && <MoreLessons lessons={more} />}
            </>
          )}
        </section>
      </PageBody>
    </AppShell>
  );
}

function StartLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-(--lp-line-strong) bg-white px-3 text-[13px] font-medium text-(--lp-ink) outline-none transition-[background-color,scale] duration-150 hover:bg-(--lp-gray)/70 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow) motion-reduce:active:scale-100"
    >
      Start
      <Icon icon={ArrowRight02Icon} size={14} />
    </Link>
  );
}

function LessonCard({ lesson }: { lesson: StagedLesson }) {
  return (
    <li className={cn(CARD, "group flex flex-col p-5 transition-[border-color] duration-150 hover:border-(--lp-ink)/15 sm:p-6")}>
      <div className="flex items-start gap-4">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-(--lp-sky-tint) text-[22px]">
          {lesson.emoji}
        </span>
        <div className="min-w-0">
          <h3 className="m-0 text-[16px] leading-[1.3] font-semibold text-(--lp-ink)">{lesson.label}</h3>
          <p className="m-0 mt-1 text-[14px] leading-[1.45] text-(--lp-ink-2)">{lesson.blurb}</p>
        </div>
      </div>
      <ol className="m-0 mt-4 flex list-none flex-col gap-1.5 rounded-[12px] bg-(--lp-gray)/55 p-0 px-3.5 py-3">
        {lesson.problems.map((problem, i) => (
          <li key={i} className="flex min-w-0 gap-2.5 text-[13.5px] leading-[1.4]">
            <span className="w-14 shrink-0 text-(--lp-ink-3)">{["Warm-up", "Main", "Stretch"][i]}</span>
            <span className="min-w-0 truncate text-(--lp-ink)">{problem}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[12.5px] text-(--lp-ink-3)">{gradeText(lesson)}</span>
        <StartLink href={`/session?lesson=${encodeURIComponent(lesson.key)}`} label={`Start the ${lesson.label} lesson`} />
      </div>
    </li>
  );
}

function MoreLessons({ lessons }: { lessons: StagedLesson[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      {open ? (
        <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-4 p-0 md:grid-cols-2">
          {lessons.map((lesson) => (
            <LessonCard key={lesson.key} lesson={lesson} />
          ))}
        </ul>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-[10px] px-2 text-[13.5px] font-medium text-(--lp-ink-2) outline-none hover:text-(--lp-ink) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
        >
          {lessons.length} more lessons
        </button>
      )}
    </div>
  );
}
