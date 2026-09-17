import type { SavedSession, TranscriptEntry } from "./sessions";

// Pure helpers behind the home page: the week's practice time, the short dates
// in the session list, and a title and one-line recap for each session.

type Timed = Pick<SavedSession, "startedAt" | "durationSec">;

export type WeekDay = { start: number; label: string; seconds: number; today: boolean };
export type WeekStats = { days: WeekDay[]; totalSec: number; activeDays: number };

/** The last seven days, oldest first, ending today (local time, safe across DST). */
export function weekStats(sessions: Timed[], now = Date.now()): WeekStats {
  const d = new Date(now);
  const days: WeekDay[] = [];
  for (let back = 6; back >= 0; back--) {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back + 1).getTime();
    const seconds = sessions
      .filter((s) => s.startedAt >= start && s.startedAt < end)
      .reduce((sum, s) => sum + Math.max(0, s.durationSec || 0), 0);
    days.push({ start, label: new Date(start).toLocaleDateString("en-US", { weekday: "narrow" }), seconds, today: back === 0 });
  }
  return {
    days,
    totalSec: days.reduce((sum, day) => sum + day.seconds, 0),
    activeDays: days.filter((day) => day.seconds >= 60).length,
  };
}

/** "0 min", "45 min", "1 h 24 min", "2 h". */
export function formatWeekTotal(sec: number): string {
  const total = Math.round(Math.max(0, sec) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "Today", "Yesterday", a weekday within the week, then "Sep 8" (and the year when it differs). */
export function shortDay(ts: number, now = Date.now()): string {
  const d = new Date(now);
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const yesterday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime();
  const weekAgo = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6).getTime();
  const date = new Date(ts);
  if (ts >= today) return "Today";
  if (ts >= yesterday) return "Yesterday";
  if (ts >= weekAgo) return date.toLocaleDateString("en-US", { weekday: "long" });
  const sameYear = date.getFullYear() === d.getFullYear();
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/** "Yesterday, 18 min"; just the day when the session never really ran. */
export function sessionMeta(session: Timed, now = Date.now()): string {
  const day = shortDay(session.startedAt, now);
  if (!session.durationSec || session.durationSec < 30) return day;
  return `${day}, ${Math.max(1, Math.round(session.durationSec / 60))} min`;
}

const GENERIC_TITLES = new Set(["", "session", "untitled", "new session"]);

function firstSentence(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const cut = clean.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? clean;
  return cut.length > max ? `${cut.slice(0, max - 1).trimEnd()}…` : cut;
}

// The intake's opening line reads "I need help with: X I uploaded… Please teach me in…".
function studentAsk(text: string): string {
  const topic = text.replace(/^I need help with:\s*/i, "").split(/\s(?:I uploaded|Please teach me in)\b/)[0];
  return topic.trim();
}

/**
 * What the list shows for a session. Sessions don't store a recap yet, so the
 * second line is the tutor's last sentence; untitled sessions are named after
 * what the student asked first.
 */
export function sessionHeadline(session: Pick<SavedSession, "title"> & { transcript?: TranscriptEntry[] | null }): {
  title: string;
  recap: string;
} {
  const transcript = Array.isArray(session.transcript) ? session.transcript : [];
  const firstStudent = transcript.find((e) => e.role === "student" && e.text?.trim());
  const lastTutor = [...transcript].reverse().find((e) => e.role === "tutor" && e.text?.trim());
  const ask = firstStudent ? firstSentence(studentAsk(firstStudent.text), 60) : "";
  const generic = GENERIC_TITLES.has(session.title.trim().toLowerCase());
  const title = generic ? ask || "Untitled session" : session.title.trim();
  const recap = lastTutor ? firstSentence(lastTutor.text, 80) : "";
  return { title, recap: recap && recap !== title ? recap : "" };
}
