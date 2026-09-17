// Queries behind the admin pages (Sept 15 2026). Server only; callers check
// getAdminSession() first.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessionEvents, sessionFrames, tutorSessions, users } from "@/lib/db/schema";
import { mergeUtterances, type TimelineEvent } from "@/lib/session-recording";

export type AdminSessionRow = {
  id: string;
  title: string;
  status: string;
  startedAt: number;
  durationSec: number;
  userName: string | null;
  userEmail: string | null;
  studentLines: number;
  tutorLines: number;
  toolCalls: number;
  toolErrors: number;
  interruptions: number;
  reconnects: number;
  errors: number;
  frames: number;
  /** Whether the session was recorded in detail (older sessions only have transcripts and snapshots). */
  recorded: boolean;
};

export type AdminSessionDetail = {
  id: string;
  title: string;
  status: string;
  startedAt: number;
  durationSec: number;
  userName: string | null;
  userEmail: string | null;
};

export type AdminFrame = { id: number; offsetMs: number; width: number; height: number; bytes: number; reason: string };

export async function loadAdminSessionList(limit = 300): Promise<AdminSessionRow[]> {
  const rows = await db
    .select({
      id: tutorSessions.id,
      title: tutorSessions.title,
      status: tutorSessions.status,
      startedAt: tutorSessions.startedAt,
      durationSec: tutorSessions.durationSec,
      userName: users.name,
      userEmail: users.email,
    })
    .from(tutorSessions)
    .leftJoin(users, eq(users.id, tutorSessions.userId))
    .orderBy(desc(tutorSessions.startedAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const debugMessage = sql<string | null>`${sessionEvents.payload}->>'message'`;
  const debugKind = sql<string | null>`${sessionEvents.payload}->>'kind'`;
  const debugFailed = sql<boolean | null>`(${sessionEvents.payload}->'payload'->>'success') = 'false'`;

  const [speech, debugRows, toolRows, frameRows, recordedRows] = await Promise.all([
    db
      .select({
        sessionId: sessionEvents.sessionId,
        seq: sessionEvents.seq,
        offsetMs: sessionEvents.offsetMs,
        actor: sessionEvents.actor,
        role: sql<string | null>`${sessionEvents.payload}->>'role'`,
        text: sql<string>`coalesce(left(${sessionEvents.payload}->>'text', 1), '')`,
      })
      .from(sessionEvents)
      .where(and(inArray(sessionEvents.sessionId, ids), eq(sessionEvents.kind, "transcript.entry"))),
    db
      .select({ sessionId: sessionEvents.sessionId, message: debugMessage, kind: debugKind, failed: debugFailed, n: sql<number>`count(*)::int` })
      .from(sessionEvents)
      .where(and(inArray(sessionEvents.sessionId, ids), eq(sessionEvents.kind, "live.debug")))
      .groupBy(sessionEvents.sessionId, debugMessage, debugKind, debugFailed),
    db
      .select({
        sessionId: sessionEvents.sessionId,
        n: sql<number>`count(*)::int`,
        failed: sql<number>`(count(*) filter (where ${sessionEvents.payload}->>'success' = 'false'))::int`,
      })
      .from(sessionEvents)
      .where(and(inArray(sessionEvents.sessionId, ids), eq(sessionEvents.kind, "tool.call")))
      .groupBy(sessionEvents.sessionId),
    db
      .select({ sessionId: sessionFrames.sessionId, n: sql<number>`count(*)::int` })
      .from(sessionFrames)
      .where(inArray(sessionFrames.sessionId, ids))
      .groupBy(sessionFrames.sessionId),
    db
      .select({ sessionId: sessionEvents.sessionId, n: sql<number>`count(*)::int` })
      .from(sessionEvents)
      .where(and(inArray(sessionEvents.sessionId, ids), inArray(sessionEvents.kind, ["session.started", "live.debug", "tool.call", "board.frame"])))
      .groupBy(sessionEvents.sessionId),
  ]);

  const speechBySession = new Map<string, TimelineEvent[]>();
  for (const r of speech) {
    const list = speechBySession.get(r.sessionId) ?? [];
    list.push({ seq: r.seq, offsetMs: r.offsetMs, kind: "transcript.entry", actor: r.actor, payload: { role: r.role ?? r.actor, text: r.text } });
    speechBySession.set(r.sessionId, list);
  }
  const count = (list: typeof debugRows, sessionId: string, test: (r: (typeof debugRows)[number]) => boolean) =>
    list.filter((r) => r.sessionId === sessionId && test(r)).reduce((sum, r) => sum + r.n, 0);

  return rows.map((row) => {
    const utterances = mergeUtterances(speechBySession.get(row.id) ?? []);
    const responses = count(debugRows, row.id, (r) => r.message === "tool_response_sent");
    const responseFailures = count(debugRows, row.id, (r) => r.message === "tool_response_sent" && r.failed === true);
    const tool = toolRows.find((r) => r.sessionId === row.id);
    const pageReconnects = count(debugRows, row.id, (r) => r.message === "live_session_reconnecting");
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      startedAt: row.startedAt,
      durationSec: row.durationSec,
      userName: row.userName,
      userEmail: row.userEmail,
      studentLines: utterances.filter((u) => u.role === "student").length,
      tutorLines: utterances.filter((u) => u.role === "tutor").length,
      toolCalls: responses > 0 ? responses : (tool?.n ?? 0),
      toolErrors: responses > 0 ? responseFailures : (tool?.failed ?? 0),
      interruptions: count(debugRows, row.id, (r) => r.message === "interrupted"),
      reconnects: pageReconnects > 0 ? pageReconnects : count(debugRows, row.id, (r) => r.message === "reconnect_scheduled"),
      errors: count(debugRows, row.id, (r) => r.kind === "error"),
      frames: frameRows.find((r) => r.sessionId === row.id)?.n ?? 0,
      recorded: (recordedRows.find((r) => r.sessionId === row.id)?.n ?? 0) > 0,
    };
  });
}

export async function loadAdminSession(id: string): Promise<{ session: AdminSessionDetail; events: TimelineEvent[]; frames: AdminFrame[] } | null> {
  const [row] = await db
    .select({
      id: tutorSessions.id,
      title: tutorSessions.title,
      status: tutorSessions.status,
      startedAt: tutorSessions.startedAt,
      durationSec: tutorSessions.durationSec,
      userName: users.name,
      userEmail: users.email,
    })
    .from(tutorSessions)
    .leftJoin(users, eq(users.id, tutorSessions.userId))
    .where(eq(tutorSessions.id, id))
    .limit(1);
  if (!row) return null;

  const [eventRows, frames] = await Promise.all([
    db
      .select({
        seq: sessionEvents.seq,
        cseq: sessionEvents.clientSeq,
        offsetMs: sessionEvents.offsetMs,
        kind: sessionEvents.kind,
        actor: sessionEvents.actor,
        // Board snapshots are large tldraw stores; the replay uses pictures instead.
        payload: sql<Record<string, unknown>>`case when ${sessionEvents.kind} = 'whiteboard.snapshot' then '{}'::jsonb else ${sessionEvents.payload} end`,
      })
      .from(sessionEvents)
      .where(eq(sessionEvents.sessionId, id))
      .orderBy(asc(sessionEvents.seq)),
    db
      .select({ id: sessionFrames.id, offsetMs: sessionFrames.offsetMs, width: sessionFrames.width, height: sessionFrames.height, bytes: sessionFrames.bytes, reason: sessionFrames.reason })
      .from(sessionFrames)
      .where(eq(sessionFrames.sessionId, id))
      .orderBy(asc(sessionFrames.offsetMs), asc(sessionFrames.id)),
  ]);

  return {
    session: row,
    events: eventRows.map((e) => ({ ...e, payload: e.payload ?? {} })),
    frames,
  };
}
