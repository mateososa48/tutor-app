-- Step B of the event numbering fix (Sept 16 2026). Run only AFTER the code
-- from step A is deployed everywhere (production included): until then an old
-- server can still write a duplicate seq and the index would reject it.
-- Idempotent.

-- Anything old code collided on between step A and now gets renumbered first.
WITH collided AS (
  SELECT DISTINCT session_id FROM session_events GROUP BY session_id, seq HAVING count(*) > 1
), renumbered AS (
  SELECT e.id, ROW_NUMBER() OVER (PARTITION BY e.session_id ORDER BY e.seq, e.offset_ms, e.id) AS rn
  FROM session_events e JOIN collided c USING (session_id)
)
UPDATE session_events s SET seq = r.rn FROM renumbered r WHERE s.id = r.id AND s.seq <> r.rn;

UPDATE tutor_sessions t SET event_seq = m.max_seq
FROM (SELECT session_id, MAX(seq) AS max_seq FROM session_events GROUP BY session_id) m
WHERE t.id = m.session_id AND t.event_seq < m.max_seq;

CREATE UNIQUE INDEX IF NOT EXISTS session_events_session_seq_uidx ON session_events (session_id, seq);
DROP INDEX IF EXISTS session_events_session_seq_idx;
