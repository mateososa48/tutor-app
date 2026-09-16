import type { TranscriptEntry } from "./live-types";

export type { TranscriptEntry };

export type SessionStatus = "active" | "paused" | "ended";

export type SavedSession = {
  id: string;
  userId: string;
  title: string;
  status: SessionStatus;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  lastActiveAt: number;
  pausedAt: number | null;
  transcript: TranscriptEntry[];
  createdAt: string;
};

export type SessionEvent = {
  id: number;
  sessionId: string;
  seq: number;
  offsetMs: number;
  kind:
    | "transcript.entry"
    | "whiteboard.snapshot"
    | "board.update.ready"
    | "board.update.failed"
    | "session.paused"
    | "session.resumed"
    | "session.ended";
  actor: "student" | "tutor" | "system";
  payload: Record<string, unknown>;
  createdAt: string;
};

export async function createSession(title?: string): Promise<string | null> {
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(title ? { title } : {}),
    });
    if (!res.ok) return null;
    const { id } = await res.json();
    return id ?? null;
  } catch {
    return null;
  }
}

export async function loadSessions(limit = 20): Promise<SavedSession[]> {
  try {
    const res = await fetch(`/api/sessions?limit=${limit}`);
    if (!res.ok) return [];
    return (await res.json()) as SavedSession[];
  } catch {
    return [];
  }
}

export async function getRecentSessions(limit = 8): Promise<SavedSession[]> {
  return loadSessions(limit);
}

export async function getSessionById(
  id: string,
): Promise<{ session: SavedSession; events: SessionEvent[] } | null> {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function patchSession(
  id: string,
  patch: Partial<Pick<SavedSession, "status" | "title" | "endedAt" | "durationSec" | "transcript">>,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function appendEvent(
  sessionId: string,
  ev: {
    kind: SessionEvent["kind"];
    actor: SessionEvent["actor"];
    offsetMs: number;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ev),
    });
  } catch {}
}

export async function sendHeartbeat(sessionId: string, durationSec: number): Promise<void> {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationSec }),
    });
  } catch {}
}

export async function pauseSession(sessionId: string): Promise<void> {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/pause`, {
      method: "POST",
    });
  } catch {}
}

export function sendPauseBeacon(sessionId: string): void {
  try {
    const url = `/api/sessions/${encodeURIComponent(sessionId)}/pause`;
    const blob = new Blob([""], { type: "text/plain" });
    navigator.sendBeacon(url, blob);
  } catch {}
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
