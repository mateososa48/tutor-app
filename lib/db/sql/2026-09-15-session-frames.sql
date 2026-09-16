-- Board pictures for the admin session replay (Sept 15 2026). Additive and
-- idempotent: safe to run on any database that has tutor_sessions.
CREATE TABLE IF NOT EXISTS session_frames (
  id serial PRIMARY KEY,
  session_id text NOT NULL REFERENCES tutor_sessions(id) ON DELETE CASCADE,
  offset_ms integer NOT NULL,
  hash text NOT NULL,
  mime text NOT NULL DEFAULT 'image/jpeg',
  width integer NOT NULL DEFAULT 0,
  height integer NOT NULL DEFAULT 0,
  bytes integer NOT NULL DEFAULT 0,
  data text NOT NULL,
  reason text NOT NULL DEFAULT 'board',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_frames_session_offset_idx ON session_frames (session_id, offset_ms);
CREATE UNIQUE INDEX IF NOT EXISTS session_frames_session_hash_idx ON session_frames (session_id, hash);
