-- Operator procedures (ARCHITECTURE.md section 16). Run with psql against the
-- app database, setting the variable first, e.g.:
--
--   psql "$DATABASE_URL" -v email='friend@example.com' -f docs/operations.sql
--
-- or copy a single block into a psql session after `\set email 'friend@example.com'`.
-- Every block runs in its own transaction. Values are passed as psql variables
-- (:'email'), never pasted into the SQL text.
--
-- This file is a collection of procedures: do NOT run it as a whole. Copy the
-- block you need.

-- ---------------------------------------------------------------------------
-- Invite a user (allowlist). Emails are stored lowercased and trimmed.
-- Alternatively add the address to ALLOWED_EMAILS and restart (insert-only).
-- ---------------------------------------------------------------------------
BEGIN;
INSERT INTO allowed_emails (email, note)
VALUES (lower(btrim(:'email')), 'invited by operator')
ON CONFLICT (email) DO NOTHING;
COMMIT;

-- ---------------------------------------------------------------------------
-- Remove a user's access. Deleting the allowlist row blocks future sign-ins;
-- deleting the sessions ends current ones immediately (ARCHITECTURE 8.4).
-- Also remove the address from ALLOWED_EMAILS, or the next restart re-adds it.
-- Their data stays until the account is deleted.
-- ---------------------------------------------------------------------------
BEGIN;
DELETE FROM allowed_emails WHERE email = lower(btrim(:'email'));
DELETE FROM session
WHERE user_id IN (SELECT id FROM "user" WHERE lower(email) = lower(btrim(:'email')));
COMMIT;

-- ---------------------------------------------------------------------------
-- List a user's active sessions (no tokens).
-- ---------------------------------------------------------------------------
SELECT s.id, s.created_at, s.expires_at, s.user_agent
FROM session s
JOIN "user" u ON u.id = s.user_id
WHERE lower(u.email) = lower(btrim(:'email')) AND s.expires_at > now()
ORDER BY s.created_at DESC;

-- ---------------------------------------------------------------------------
-- Delete an account. Cascades to sessions, accounts, and settings (and, in
-- later phases, vocabulary, cards, review logs, and reports). Remove the
-- allowlist entry too, or the person can sign up again.
-- ---------------------------------------------------------------------------
BEGIN;
DELETE FROM "user" WHERE lower(email) = lower(btrim(:'email'));
DELETE FROM allowed_emails WHERE email = lower(btrim(:'email'));
COMMIT;
