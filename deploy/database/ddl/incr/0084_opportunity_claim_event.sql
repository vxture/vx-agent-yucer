-- 0084_opportunity_claim_event.sql - 声明变更日志 (deal batch 3).
-- Design: YC-067 §02 (numbered 0082 there - the design's 0082-0090 were
-- tentative, "以合并顺序为准"), YC-065 R2 (declared changes and slippage),
-- R9 (a more optimistic category than the rule's needs a reason).
--
-- WHAT A DEAL CLAIMED, AND WHEN IT CHANGED ITS MIND. Amount, currency,
-- expected close date, forecast category and win rate are claims about the
-- future; the row only ever holds the latest one. A close date moved three
-- times looks exactly like one that never moved - which is the slippage every
-- forecast review asks about and nothing could answer.
--
-- WRITTEN IN THE SAME TRANSACTION AS THE CHANGE, at exactly three points:
-- updateCommercialTerms, applyStageChange (the stage machine moving win rate
-- or category) and replaceOpportunityLines (the lines recomputing the
-- amount). A log that can disagree with the row is worse than no log.
-- An unchanged value writes nothing.
--
-- APPEND-ONLY: SELECT and INSERT, no UPDATE, no DELETE. A correction is a
-- new row. The rows go with their deal (FK ON DELETE CASCADE).
--
-- NO BACKFILL: nothing recorded says who moved a date on which day before
-- this table existed; slippage counts from the day it lands, and the page
-- says so.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_pipeline.opportunity_claim_event (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,                       -- [ref] isolation key
  opportunity_id  UUID NOT NULL,
  field           VARCHAR(24) NOT NULL,
  -- Normalised text: amounts with two decimals, dates YYYY-MM-DD, win rate an
  -- integer. NULL = there was none (unpriced, no date).
  from_value      TEXT,
  to_value        TEXT,
  source          VARCHAR(16) NOT NULL,
  reason          TEXT,
  actor_sub       VARCHAR(128),                        -- NULL = the system (stage machine, line recompute)
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_claim_field CHECK (field IN ('amount', 'currency', 'expected_close_at', 'forecast_category', 'probability')),
  CONSTRAINT chk_claim_source CHECK (source IN ('manual', 'stage_machine', 'proposal', 'lines')),
  -- A change is a change: the same value on both sides is not an event.
  CONSTRAINT chk_claim_changed CHECK (from_value IS DISTINCT FROM to_value),
  CONSTRAINT fk_claim_opportunity FOREIGN KEY (opportunity_id)
    REFERENCES yucer_pipeline.opportunity (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_claim_event_by_opp
  ON yucer_pipeline.opportunity_claim_event (workspace_id, opportunity_id, occurred_at);

GRANT SELECT, INSERT ON yucer_pipeline.opportunity_claim_event TO yucer_svc;
REVOKE UPDATE, DELETE ON yucer_pipeline.opportunity_claim_event FROM yucer_svc;
