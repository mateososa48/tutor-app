// Pure helpers behind the Sessions and Progress pages (Oct 2026): sessions
// grouped by when they happened, practice time week by week, and the run of
// days practised. Local time throughout, and safe across daylight saving
// because every boundary is a calendar date, never a count of milliseconds.

type Timed = { startedAt: number; durationSec: number };

const dayStart = (d: Date, back = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();

/** "This week" (the last seven days), "Last week", then a month, with its year when it is not this one. */
export function timeGroupLabel(ts: number, now = Date.now()): string {
  const d = new Date(now);
  if (ts >= dayStart(d, 6)) return "This week";
  if (ts >= dayStart(d, 13)) return "Last week";
  const date = new Date(ts);
  const month = date.toLocaleDateString("en-US", { month: "long" });
  return date.getFullYear() === d.getFullYear() ? month : `${month} ${date.getFullYear()}`;
}

/** Items in their groups, in the order given (newest first in, newest group first out). */
export function groupByTime<T extends { startedAt: number }>(items: readonly T[], now = Date.now()): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = timeGroupLabel(item.startedAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export type WeekBucket = { start: number; end: number; label: string; seconds: number; current: boolean };

/** The last `weeks` seven-day stretches ending today, oldest first, each labelled by its first day ("Oct 12"). Like the totals, a session under a minute does not count. */
export function weeklyPractice(sessions: readonly Timed[], weeks = 12, now = Date.now()): WeekBucket[] {
  const d = new Date(now);
  const out: WeekBucket[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = dayStart(d, w * 7 + 6);
    const end = dayStart(d, w * 7 - 1);
    const seconds = sessions
      .filter((s) => s.startedAt >= start && s.startedAt < end && (s.durationSec || 0) >= 60)
      .reduce((sum, s) => sum + s.durationSec, 0);
    out.push({
      start,
      end,
      label: new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      seconds,
      current: w === 0,
    });
  }
  return out;
}

/** Days in a row, ending today or yesterday, with at least a minute of practice. */
export function practiceStreak(sessions: readonly Timed[], now = Date.now()): number {
  const d = new Date(now);
  const practised = new Set<number>();
  for (const s of sessions) {
    if ((s.durationSec || 0) < 60) continue;
    const t = new Date(s.startedAt);
    practised.add(new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime());
  }
  // Today not practised yet does not break a run that reached yesterday.
  let back = practised.has(dayStart(d, 0)) ? 0 : 1;
  let run = 0;
  while (practised.has(dayStart(d, back))) {
    run += 1;
    back += 1;
  }
  return run;
}

/** Whole-history totals: time, sessions that really ran, and distinct days practised. */
export function practiceTotals(sessions: readonly Timed[]): { seconds: number; sessions: number; days: number } {
  const ran = sessions.filter((s) => (s.durationSec || 0) >= 60);
  const days = new Set(ran.map((s) => {
    const t = new Date(s.startedAt);
    return `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;
  }));
  return { seconds: ran.reduce((sum, s) => sum + s.durationSec, 0), sessions: ran.length, days: days.size };
}

// ── Skills, as the Progress and Practice pages show them ──────────────────────

export type SkillStatus = "building" | "supported" | "independent_recent" | "review_due" | "retained" | "needs_revisit";

export const SKILL_GROUPS: readonly { key: string; title: string; hint: string; statuses: readonly SkillStatus[]; strength: 1 | 2 | 3 }[] = [
  { key: "revisit", title: "Needs another look", hint: "A mistake came back after you'd had it right.", statuses: ["needs_revisit"], strength: 1 },
  { key: "due", title: "Due for a check", hint: "You did these on your own a while ago. A quick check keeps them.", statuses: ["review_due"], strength: 2 },
  { key: "growing", title: "Getting there", hint: "Right with some help so far.", statuses: ["building", "supported"], strength: 2 },
  { key: "solid", title: "On your own", hint: "Right with no help from the tutor.", statuses: ["independent_recent", "retained"], strength: 3 },
];

/** Skills sorted into the groups above, newest practice first inside each; empty groups are left out. */
export function groupSkills<T extends { status: SkillStatus; latestAttemptAt: number }>(states: readonly T[]) {
  return SKILL_GROUPS.map((group) => ({
    ...group,
    items: states.filter((s) => group.statuses.includes(s.status)).sort((a, b) => b.latestAttemptAt - a.latestAttemptAt),
  })).filter((group) => group.items.length > 0);
}

/** What practice should come next: reviews and revisits first, then the shakiest of the rest. */
export function practiceQueue<T extends { status: SkillStatus; latestAttemptAt: number }>(states: readonly T[], max = 6): T[] {
  const rank: Record<SkillStatus, number> = { needs_revisit: 0, review_due: 1, building: 2, supported: 3, independent_recent: 9, retained: 9 };
  return states
    .filter((s) => rank[s.status] < 9)
    .sort((a, b) => rank[a.status] - rank[b.status] || b.latestAttemptAt - a.latestAttemptAt)
    .slice(0, max);
}
