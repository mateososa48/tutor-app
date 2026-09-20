-- Onboarding record (Sept 20 2026): who set the account up, a student or a
-- parent, and for a parent what they said was going on, as
-- { by, concern?, note? } (lib/onboarding.ts). Additive and idempotent; run
-- before the code that writes it is deployed. Older profiles keep '{}', which
-- the prompt reads as "nothing known".
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding jsonb NOT NULL DEFAULT '{}'::jsonb;
