-- 0033_funnel_exit.sql - why anything left the funnel.
--
-- Authority: owner, 2026-09-06, choosing between the two shapes in
-- design_yucer_110 section 2.2 - 一张 funnel_exit 表（跨段可查）.
--
-- WHAT WAS MISSING. Five stages, five ways to end, and not one of them
-- recorded a reason:
--
--   signal   dismissed / duplicate
--   lead     disqualified
--   opportunity  lost / abandoned
--   project  cancelled
--   revenue  written_off
--
-- Each was a single word in a status column. The reasons for WINNING were
-- recorded (win_loss_review carries competitor and lessons); the reasons for
-- losing mostly were not, which is the half a funnel exists to answer.
--
-- ONE TABLE, NOT THREE COLUMNS ON FIVE TABLES, and the owner picked it
-- knowing the trade. The question this data is for is CROSS-STAGE - "this
-- year's demand, which stage leaks most and why" - and five sets of columns
-- answer it only through a five-way UNION that has to be rewritten every time
-- a stage is added. One table answers it with one GROUP BY.
--
-- THE COST, STATED RATHER THAN DISCOVERED LATER: `subject_id` is a POLYMORPHIC
-- reference. It points at one of five tables and the database cannot constrain
-- which, so there is no foreign key here and a deleted subject leaves its exit
-- row behind. This repo has no other table shaped like this, and that is worth
-- knowing before a second one is written. Two things keep it honest:
--   - `stage` and `outcome` are CHECKed against each other below, so a row
--     cannot claim a lead was `written_off`;
--   - the orphan case is real but harmless in the one place it can happen. A
--     lead is the only funnel subject this product hard-deletes, and deleting
--     one is "this record should never have existed" - so an exit note about
--     it should not survive either. `deleteLead` clears them in the same
--     transaction; nothing else deletes a subject at all.
--
-- WHY yucer_pipeline. The funnel is D5/D6's concept - signal, lead and
-- opportunity all live here and the delivery stages are its tail. Putting it
-- in yucer_delivery would make the two ends of one idea live apart, and there
-- is no shared schema in this product to put it in instead.
--
-- APPEND-ONLY. A correction is a new row, like account_relation,
-- opportunity_stage_event, forecast_snapshot, agent_message and
-- milestone_change (incr/0032). Somebody's account of why a deal died is a
-- record, not a field to be tidied.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_pipeline.funnel_exit (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,                       -- [ref]

  -- WHICH STAGE, and it is what makes the polymorphic id readable: without it
  -- a UUID here could belong to any of five tables and no reader could tell.
  stage          VARCHAR(16) NOT NULL
                   CONSTRAINT chk_funnel_exit_stage
                   CHECK (stage IN ('signal', 'lead', 'opportunity', 'project', 'revenue')),
  subject_id     UUID NOT NULL,                       -- [ref] polymorphic, see header

  -- HOW IT ENDED, and the pair is checked together. A `lead` that claims it
  -- was `written_off` is not a typo to be read around later - it is a row that
  -- would be counted under a stage it never belonged to.
  outcome        VARCHAR(24) NOT NULL,
  CONSTRAINT chk_funnel_exit_outcome CHECK (
    (stage = 'signal'      AND outcome IN ('dismissed', 'duplicate'))
    -- ONE TERMINAL STATE FOR A LEAD, because that is all lead.status has.
    -- 判定不合格 and 终结 are two different business moments and they both end
    -- here; what separates them is the REASON, not a second status. Inventing
    -- an outcome the subject's own column cannot hold would leave this table
    -- disagreeing with the row it describes.
    OR (stage = 'lead'        AND outcome IN ('disqualified'))
    OR (stage = 'opportunity' AND outcome IN ('lost', 'abandoned'))
    OR (stage = 'project'     AND outcome IN ('cancelled'))
    OR (stage = 'revenue'     AND outcome IN ('written_off'))
  ),

  -- WHY, from a controlled list. Free text alone cannot be grouped, and the
  -- whole point of this table is the group-by; a code alone cannot carry the
  -- detail, which is what `note` is for.
  reason_code    VARCHAR(32) NOT NULL
                   CONSTRAINT chk_funnel_exit_reason
                   CHECK (reason_code IN (
                     'duplicate',           -- the same thing recorded twice
                     'not_a_fit',           -- we do not sell what they need
                     'no_budget',
                     'no_decision',         -- it never got decided, it just stopped
                     'lost_to_competitor',
                     'timing',              -- real, but not now
                     'customer_withdrew',   -- they cancelled the project itself
                     'unreachable',
                     'other'
                   )),
  note           VARCHAR(500),
  -- 'other' MUST SAY WHAT. A catch-all with no sentence behind it turns the
  -- whole vocabulary into one bucket within a quarter - everybody picks the
  -- option that never argues back.
  CONSTRAINT chk_funnel_exit_other_note CHECK (
    reason_code <> 'other' OR (note IS NOT NULL AND length(btrim(note)) > 0)
  ),

  decided_by_sub VARCHAR(128) NOT NULL,               -- [ref] one of OUR users
  decided_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The cross-stage question this table exists for: which stage, what reason.
CREATE INDEX IF NOT EXISTS idx_funnel_exit_ws_stage
  ON yucer_pipeline.funnel_exit (workspace_id, stage, decided_at DESC);

-- And the per-row lookup: why did THIS lead end.
CREATE INDEX IF NOT EXISTS idx_funnel_exit_subject
  ON yucer_pipeline.funnel_exit (subject_id, decided_at DESC);

-- --- the review table stops refusing abandoned deals -------------------------
-- opportunity.status has allowed 'abandoned' since the baseline; this CHECK
-- allowed only won and lost, so an abandoned deal could not have a review row
-- written for it AT ALL. It was not that nobody wrote them - the database
-- refused. A deal somebody walked away from has lessons in it too.
ALTER TABLE yucer_pipeline.win_loss_review
  DROP CONSTRAINT IF EXISTS chk_win_loss_review_outcome;
ALTER TABLE yucer_pipeline.win_loss_review
  ADD CONSTRAINT chk_win_loss_review_outcome
  CHECK (outcome IN ('won', 'lost', 'abandoned'));

-- --- grants -----------------------------------------------------------------
-- 97 cannot grant on a table created after it ran and 98 cannot lock one that
-- did not exist when it ran, so this file carries both halves (incr/README).
GRANT SELECT, INSERT ON yucer_pipeline.funnel_exit TO yucer_svc;

-- APPEND-ONLY, and DELETE stays granted for exactly one case: a hard-deleted
-- lead takes its exit rows with it, because "this record should never have
-- existed" cannot leave a note behind explaining why it ended.
GRANT DELETE ON yucer_pipeline.funnel_exit TO yucer_svc;
REVOKE UPDATE ON yucer_pipeline.funnel_exit FROM yucer_svc;
