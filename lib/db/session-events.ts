// Appends recorded events to a session in one statement (Sept 16 2026).
//
// The old routes read the session's highest seq and then inserted after it,
// so two requests at once could hand out the same numbers, and a replayed
// transcript came back word-shuffled. Here the UPDATE of the session's counter
// locks that row until the INSERT in the same statement is done, so a second
// writer waits and continues after it. neon-http has no interactive
// transactions, which is why this is one statement.
//
// Needs lib/db/sql/2026-09-16-event-seq.sql (step A) on the database first.
import { sql } from "drizzle-orm";
import { db } from "./client";

export type NewSessionEvent = {
  kind: string;
  actor: string;
  offsetMs: number;
  payload: Record<string, unknown>;
  cseq?: number | null;
};

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

/** Store events after the session's last one. Returns the highest seq written (0 if the session is gone). */
export async function appendSessionEvents(sessionId: string, events: NewSessionEvent[], now = Date.now()): Promise<number> {
  if (events.length === 0) return 0;
  const n = events.length;
  const list = JSON.stringify(
    events.map((e) => ({ kind: e.kind, actor: e.actor, offsetMs: e.offsetMs, payload: e.payload, cseq: typeof e.cseq === "number" ? e.cseq : null })),
  );
  const result = await db.execute(sql`
    WITH bumped AS (
      UPDATE tutor_sessions
         SET event_seq = GREATEST(
               event_seq,
               (SELECT COALESCE(MAX(seq), 0) FROM session_events WHERE session_id = ${sessionId})
             ) + ${n},
             last_active_at = GREATEST(last_active_at, ${now})
       WHERE id = ${sessionId}
       RETURNING event_seq
    )
    INSERT INTO session_events (session_id, seq, offset_ms, kind, actor, payload, client_seq)
    SELECT ${sessionId},
           bumped.event_seq - ${n} + e.ord::int,
           (e.value->>'offsetMs')::int,
           e.value->>'kind',
           e.value->>'actor',
           e.value->'payload',
           (e.value->>'cseq')::int
      FROM bumped, jsonb_array_elements(${list}::jsonb) WITH ORDINALITY AS e(value, ord)
    RETURNING seq`);
  return rowsOf(result).reduce((max, r) => Math.max(max, Number(r.seq) || 0), 0);
}
