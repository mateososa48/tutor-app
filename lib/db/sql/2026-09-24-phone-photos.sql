-- Photos sent from a phone into a session on a laptop (Sept 24 2026): the
-- laptop shows a QR code for a phone link, the phone posts photos to it, and
-- the laptop polls them off. lib/phone-link.ts holds the rules.
--
-- `phone_links.token_hash` is the SHA-256 of the token in the QR code; the
-- token itself is never stored. Photos are deleted as soon as the laptop has
-- them, and whole links (with any photos left) an hour after they expire.
-- Additive and idempotent; run before the code that uses it.
CREATE TABLE IF NOT EXISTS phone_links (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  expires_at bigint NOT NULL,
  opened_at bigint,
  closed_at bigint,
  uploads integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS phone_links_expires_idx ON phone_links (expires_at);

CREATE TABLE IF NOT EXISTS phone_photos (
  id serial PRIMARY KEY,
  link_id text NOT NULL REFERENCES phone_links(id) ON DELETE CASCADE,
  data text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  bytes integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_photos_link_idx ON phone_photos (link_id, id);
