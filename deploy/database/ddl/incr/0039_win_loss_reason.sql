-- 0039_win_loss_reason.sql - 赢丢原因成为工作区自己的词表。
--
-- Authority: owner, 2026-09-08, sweeping the data still hard-coded in the
-- build (ADR-026's inventory). This one was both a vocabulary and a hole.
--
-- WHAT IT WAS: six values in `domains/pipeline/store.ts` - price / fit /
-- timing / competitor / no_decision / other - and a column that accepted
-- anything:
--
--     primary_reason VARCHAR(64)     -- no CHECK, no FK, no vocabulary
--
-- Two problems, and the second is the one that made this first in the queue:
--
--   1. WHY DEALS ARE LOST IS THE WORKSPACE'S OWN QUESTION. "被集成商截胡" and
--      "预算冻结" are the reasons a particular company actually loses on, and
--      neither is in our six. A list nobody can extend gets used as "other",
--      and 赢丢复盘 then reports that most losses have no reason.
--   2. NOTHING ENFORCED THE SIX. The rule layer's union type is a compile-time
--      claim about a column that would hold any string a bug wrote into it -
--      and the review roster groups by that column.
--
-- SAME SHAPE AS THE CATALOGUE VOCABULARIES (0028 type, 0029 status, 0037
-- unit): an anchor code, a display name, an order, per workspace, and the
-- review joins it by uuid. Consistency here is not tidiness - it is the
-- difference between one configuration pattern and four.
--
-- OUTCOME STAYS A CHECK, and that is the line between the two. won/lost is a
-- state the rule layer branches on (planWinLossReview refuses a reason on a
-- win it cannot explain); the REASON is content the workspace writes. The
-- first is a state machine, the second is data.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_pipeline.win_loss_reason (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                          -- [ref] isolation key
  reason_code  VARCHAR(32) NOT NULL,                   -- anchor, immutable
  name         VARCHAR(64) NOT NULL,
  -- Which outcome it explains. A reason may serve both (competitor), so this
  -- is not one column with three values but the honest pair: a won-only reason
  -- must not be offered on a loss.
  for_won      BOOLEAN NOT NULL DEFAULT TRUE,
  for_lost     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_win_loss_reason_code UNIQUE (workspace_id, reason_code),
  -- A reason that explains neither outcome can never be chosen; it is a row
  -- somebody meant to delete.
  CONSTRAINT chk_win_loss_reason_use CHECK (for_won OR for_lost)
);

CREATE INDEX IF NOT EXISTS idx_win_loss_reason_ws_sort
  ON yucer_pipeline.win_loss_reason (workspace_id, sort_order);

-- The shipped six, for every workspace that already has reviews. Guarded on an
-- EMPTY vocabulary so a tenant's deletions do not resurrect on a re-run - the
-- same guard 0029 and 0037 use. A fresh workspace gets the same set from the
-- service's first-contact seeding.
INSERT INTO yucer_pipeline.win_loss_reason
  (workspace_id, reason_code, name, for_won, for_lost, sort_order)
SELECT w.workspace_id, v.code, v.name, v.won, v.lost, v.ord
  FROM (SELECT DISTINCT workspace_id FROM yucer_pipeline.win_loss_review) w
 CROSS JOIN (VALUES
   ('price',       '价格',     TRUE,  TRUE,  1),
   ('fit',         '方案匹配', TRUE,  TRUE,  2),
   ('timing',      '时机',     TRUE,  TRUE,  3),
   ('competitor',  '竞争对手', TRUE,  TRUE,  4),
   ('no_decision', '客户未决', FALSE, TRUE,  5),
   ('other',       '其他',     TRUE,  TRUE,  6)
 ) AS v(code, name, won, lost, ord)
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_pipeline.win_loss_reason r WHERE r.workspace_id = w.workspace_id
 )
ON CONFLICT (workspace_id, reason_code) DO NOTHING;

-- Whatever a workspace already recorded, kept: a review's reason is evidence,
-- and a value outside our six is still what somebody concluded.
INSERT INTO yucer_pipeline.win_loss_reason
  (workspace_id, reason_code, name, for_won, for_lost, sort_order)
SELECT DISTINCT r.workspace_id, r.primary_reason, r.primary_reason, TRUE, TRUE, 99
  FROM yucer_pipeline.win_loss_review r
 WHERE r.primary_reason IS NOT NULL
   AND r.primary_reason <> ''
ON CONFLICT (workspace_id, reason_code) DO NOTHING;

-- --- the review joins the vocabulary by uuid ---------------------------------
ALTER TABLE yucer_pipeline.win_loss_review
  ADD COLUMN IF NOT EXISTS primary_reason_id UUID;

UPDATE yucer_pipeline.win_loss_review v
   SET primary_reason_id = r.id
  FROM yucer_pipeline.win_loss_reason r
 WHERE v.primary_reason_id IS NULL
   AND r.workspace_id = v.workspace_id
   AND r.reason_code = v.primary_reason;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_win_loss_review_reason') THEN
    ALTER TABLE yucer_pipeline.win_loss_review
      ADD CONSTRAINT fk_win_loss_review_reason FOREIGN KEY (primary_reason_id)
      REFERENCES yucer_pipeline.win_loss_reason (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_win_loss_review_reason
  ON yucer_pipeline.win_loss_review (workspace_id, primary_reason_id);

-- The free-text column leaves, exactly as category / status / unit did before
-- it. NULLABLE stays nullable: a review may legitimately have no reason yet -
-- the deal closed and nobody has said why, which is the state the roster is
-- built to surface.
ALTER TABLE yucer_pipeline.win_loss_review DROP COLUMN IF EXISTS primary_reason;

-- --- grants -----------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON yucer_pipeline.win_loss_reason TO yucer_svc;
-- reason_code is the anchor - locked, like every other vocabulary's code.
GRANT UPDATE (name, for_won, for_lost, sort_order, updated_at)
  ON yucer_pipeline.win_loss_reason TO yucer_svc;

-- win_loss_review: primary_reason leaves the writable set, the uuid takes its
-- place. Restated whole (REVOKE resets, then the full grant).
REVOKE UPDATE ON yucer_pipeline.win_loss_review FROM yucer_svc;
GRANT UPDATE (outcome, primary_reason_id, competitor, lessons, reviewer_sub, reviewed_at, updated_at)
  ON yucer_pipeline.win_loss_review TO yucer_svc;
