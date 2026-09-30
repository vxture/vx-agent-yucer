-- 0103_member_identity_line.sql - the member cache keeps what a roster needs
-- to tell two people apart: a face and one identifying line.
--
-- Authority: the owner's report of 2026-09-29 (every member rendered as a bare
-- sub) and ruling on the line under a name: ONE of phone > email > user_no,
-- the first the member has. user_no is the platform's stable readable id
-- (T-1234567890, ten digits).
--
-- All four are a PLATFORM DISPLAY CACHE, like display_name: written from the
-- member's own access token on each sighting (authz/context.ts), never
-- authoritative, may go stale until that member signs in again. user_no is not
-- on the token yet; the column waits for it.
--
-- Idempotent throughout.

ALTER TABLE local_authz.member
  ADD COLUMN IF NOT EXISTS phone       VARCHAR(32),
  ADD COLUMN IF NOT EXISTS email       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS user_no     VARCHAR(32),
  ADD COLUMN IF NOT EXISTS picture_url VARCHAR(512);

-- --- grants -----------------------------------------------------------------
-- Restated in full because grants accumulate (98_column_locks.sql, 0022).
REVOKE UPDATE ON local_authz.member FROM yucer_svc;
GRANT UPDATE (display_name, avatar_hash, phone, email, user_no, picture_url, status, scope, updated_at)
  ON local_authz.member TO yucer_svc;
