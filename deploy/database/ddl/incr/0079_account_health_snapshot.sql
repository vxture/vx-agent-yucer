-- 0079_account_health_snapshot.sql - the health score's history.
--
-- Authority: owner ruling 2026-09-24 (YC-021 advanced tier). Two acceptance
-- sentences need a PAST score and nothing kept one:
--   L5 变化归因   "为什么从 58 掉到 34" - which factor moved, by how much.
--   L6 采纳后成效回看 - did the health score change N days after a proposal
--                    was accepted.
-- account.health_score is one column, overwritten on every recompute, and the
-- delivery factor reads project.health, which is overwritten too - so a past
-- score cannot be re-derived honestly. It has to be written down when it is
-- computed.
--
-- APPEND-ONLY, the shape of renewal_event and opportunity_stage_event: a
-- snapshot is what the rules said at that moment. SELECT and INSERT only - no
-- UPDATE, no DELETE, no updated_at.
--
-- `contributions` is the factor breakdown exactly as deriveHealth returned it
-- ({factor, points, reason}[]), so attribution compares like with like and a
-- future sixth factor needs no column. `source` says which writer: a person's
-- recompute, or the nightly health sweep. A writer skips the insert when the
-- score and the breakdown are unchanged since the last row, so the table grows
-- with change, not with the calendar.
--
-- CASCADE with the account, like every other per-account child table (0004,
-- 0026, 0074): accounts are soft-deleted in practice, and a hard delete takes
-- the history with it rather than being blocked by it.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_core.account_health_snapshot (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                     -- [ref] isolation key
  account_id    UUID NOT NULL,
  score         SMALLINT NOT NULL,
  contributions JSONB NOT NULL,
  source        VARCHAR(16) NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_account_health_snapshot_score CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT chk_account_health_snapshot_source CHECK (source IN ('recompute', 'sweep')),
  CONSTRAINT chk_account_health_snapshot_contributions CHECK (jsonb_typeof(contributions) = 'array'),
  CONSTRAINT fk_account_health_snapshot_account FOREIGN KEY (account_id)
    REFERENCES yucer_core.account (id) ON DELETE CASCADE
);

COMMENT ON TABLE yucer_core.account_health_snapshot IS
  '健康分快照 - score + factor breakdown at the time it was computed, append-only. See incr/0079.';

CREATE INDEX IF NOT EXISTS idx_account_health_snapshot_ws_account
  ON yucer_core.account_health_snapshot (workspace_id, account_id, computed_at DESC);

-- --- grants -----------------------------------------------------------------
--
-- Append-only is expressed by the grant. 97 ran before this table existed, so
-- without this line the service role could not read or write it at all.
GRANT SELECT, INSERT ON yucer_core.account_health_snapshot TO yucer_svc;
