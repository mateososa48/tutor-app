import type { TranscriptEntry } from "./gemini-live";

export type { TranscriptEntry };

export type SavedSession = {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  transcript: TranscriptEntry[];
};

const KEY = "tutor_sessions";

export function newSessionId(): string {
  return `session_${Date.now()}`;
}

export function loadSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSession[];
    return parsed.sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    return [];
  }
}

export function saveSession(session: SavedSession): void {
  try {
    const existing = loadSessions();
    const filtered = existing.filter((s) => s.id !== session.id);
    filtered.unshift(session);
    localStorage.setItem(KEY, JSON.stringify(filtered));
  } catch {
    // Silently handle quota errors
  }
}

export function getSessionById(id: string): SavedSession | null {
  const sessions = loadSessions();
  return sessions.find((s) => s.id === id) ?? null;
}

export function getRecentSessions(limit = 8): SavedSession[] {
  return loadSessions().slice(0, limit);
}

export function formatRelativeDate(ts: number): string {
  const now = new Date();
  const date = new Date(ts);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (ts >= todayStart) return `Today at ${timeStr}`;
  if (ts >= yesterdayStart) return `Yesterday at ${timeStr}`;
  if (ts >= weekStart) {
    const day = date.toLocaleDateString("en-US", { weekday: "short" });
    return `${day} at ${timeStr}`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDuration(sec: number): string {
  if (sec < 60) return "< 1 min";
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (hrs === 0) return `${mins} min`;
  return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}
