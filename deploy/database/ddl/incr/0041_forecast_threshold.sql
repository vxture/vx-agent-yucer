-- 0041_forecast_threshold.sql - 预测阈值 stops being three numbers in the build.
--
-- Authority: owner, 2026-09-08 - the pass over what this product still keeps
-- as hard-coded data, taken in batches. This is the third batch.
--
-- WHAT IT WAS: three exported constants in domains/pipeline/lib/forecast-rule.ts
-- - COMMIT_PROBABILITY 80, BEST_CASE_PROBABILITY 50, STALL_DAYS 45. They decide
-- what the forecast review tells a sales leader their book is worth, and
-- changing any of them needed a release.
--
-- WHY THEY ARE DATA AND THE BANDS ARE NOT (ADR-026's test: who may change it,
-- and what breaks if they do). The three BANDS - pipeline / best_case / commit
-- - are a vocabulary the rule branches on and the database CHECK-constrains;
-- inventing a fourth would be a code change everywhere. WHERE THE BANDS START
-- is a company's forecast discipline: 80 is defensible and so is 90, nothing
-- in the product branches on the number, and the two workspaces that disagree
-- about it are both right about themselves.
--
-- ONE ROW PER WORKSPACE, keyed by workspace_id itself. A settings row is not a
-- list, and a table with its own id would allow two rows of thresholds for one
-- workspace - a state with no meaning that some read would then have to pick
-- between.
--
-- NO DELETE GRANT. Every workspace has thresholds; "reset to ours" is an
-- UPDATE back to the defaults, not the absence of a row. A missing row would
-- make the rule fall back to the build, which is the coupling this increment
-- removes.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_pipeline.forecast_threshold (
  workspace_id          UUID PRIMARY KEY,             -- [ref] isolation key
  -- At or above this, a deal's own probability reads as 承诺.
  commit_probability    SMALLINT NOT NULL DEFAULT 80,
  -- At or above this (and below commit), 最好情况.
  best_case_probability SMALLINT NOT NULL DEFAULT 50,
  -- How long at one stage before the clock caps the category one band.
  -- Deliberately NOT judgement.ts's 30-day silence clock: a deal can be
  -- actively worked and still not move, and it is the not-moving this measures.
  stall_days            SMALLINT NOT NULL DEFAULT 45,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_forecast_threshold_commit
    CHECK (commit_probability BETWEEN 1 AND 100),
  CONSTRAINT chk_forecast_threshold_best_case
    CHECK (best_case_probability BETWEEN 1 AND 100),
  -- THE ONE THAT MATTERS. Bands that cross - best_case at or above commit -
  -- would make the ladder unorderable, and every deal would land in whichever
  -- branch the code happened to test first. It is a property of the PAIR, so
  -- neither column's own CHECK can say it.
  CONSTRAINT chk_forecast_threshold_ordered
    CHECK (best_case_probability < commit_probability),
  -- A stall clock of zero days would cap every deal on the day it moved; one
  -- of ten years would never fire. Both are ways of turning the rule off, and
  -- turning it off is not what this column is for.
  CONSTRAINT chk_forecast_threshold_stall
    CHECK (stall_days BETWEEN 1 AND 365)
);

-- The shipped three, for every workspace that already has deals. The DEFAULTs
-- above carry the same numbers, so a fresh row and a seeded one agree.
INSERT INTO yucer_pipeline.forecast_threshold (workspace_id)
SELECT DISTINCT workspace_id FROM yucer_pipeline.opportunity
ON CONFLICT (workspace_id) DO NOTHING;

-- --- grants -----------------------------------------------------------------
-- No DELETE: see the header. INSERT is how a workspace gets its first row, and
-- the three numbers are the only thing anybody may then change.
GRANT SELECT, INSERT ON yucer_pipeline.forecast_threshold TO yucer_svc;
GRANT UPDATE (commit_probability, best_case_probability, stall_days, updated_at)
  ON yucer_pipeline.forecast_threshold TO yucer_svc;
