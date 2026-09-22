-- The note a student reads after a session (Sept 21 2026), written by a cheap
-- model once the session has ended: lib/session-summary.ts holds the shape.
-- `summary_state` is the worker's queue: 'none' until the session ends,
-- 'pending' while it waits, 'done' once written, 'failed' after the tries run
-- out. Additive and idempotent; run before the code that writes it.
ALTER TABLE tutor_sessions ADD COLUMN IF NOT EXISTS summary jsonb;
ALTER TABLE tutor_sessions ADD COLUMN IF NOT EXISTS summary_state text NOT NULL DEFAULT 'none';
ALTER TABLE tutor_sessions ADD COLUMN IF NOT EXISTS summary_error text;
ALTER TABLE tutor_sessions ADD COLUMN IF NOT EXISTS summary_tries integer NOT NULL DEFAULT 0;

-- The sweeper looks for sessions still waiting, oldest first.
CREATE INDEX IF NOT EXISTS tutor_sessions_summary_pending_idx
  ON tutor_sessions (summary_state, ended_at)
  WHERE summary_state = 'pending';
