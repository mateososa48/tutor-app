-- Step A of the event numbering fix (Sept 16 2026). Run BEFORE deploying the
-- code that uses it (lib/db/session-events.ts). Purely additive and
-- idempotent: two new columns, and the new counter filled in. Old code
-- ignores both columns; existing rows are not changed.
--
-- Why: the events route read the highest seq and then inserted after it, so
-- concurrent requests handed out the same numbers and replayed transcripts
-- came back shuffled. The session row now carries the counter, bumped in the
-- same statement as the insert. Existing duplicate seqs are renumbered later,
-- in step B, just before the unique index.

ALTER TABLE tutor_sessions ADD COLUMN IF NOT EXISTS event_seq integer NOT NULL DEFAULT 0;
ALTER TABLE session_events ADD COLUMN IF NOT EXISTS client_seq integer;

-- Start every session's counter at its highest seq.
UPDATE tutor_sessions t SET event_seq = m.max_seq
FROM (SELECT session_id, MAX(seq) AS max_seq FROM session_events GROUP BY session_id) m
WHERE t.id = m.session_id AND t.event_seq < m.max_seq;
