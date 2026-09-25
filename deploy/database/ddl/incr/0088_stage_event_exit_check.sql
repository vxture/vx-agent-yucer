-- 0088_stage_event_exit_check.sql - 核验快照 (deal batch 5b).
-- Design: YC-067 §05 (numbered 0085 there - numbers were tentative,
-- "以合并顺序为准"), YC-065 R1.
--
-- WHAT THE STAGE LEFT LOOKED LIKE WHEN THE DEAL LEFT IT:
--   {"stage":"validate","met":[...],"unmet":[...],"unknown":[...]}
-- criteria by NAME at that moment, so renaming or deleting one later does not
-- rewrite what the journal says was checked. Moving on past unmet criteria is
-- allowed but needs a reason (R1: 不硬拦, 须理由); the reason already lives in
-- this row's `reason`, and now the check it answered sits beside it.
--
-- WRITTEN ONLY ON INSERT: the journal is append-only (no UPDATE grant), and
-- the new column rides the existing INSERT. Historical rows are NULL, which
-- reads as "not recorded at the time" - never backfilled from today's data.
--
-- Idempotent throughout.

ALTER TABLE yucer_pipeline.opportunity_stage_event
  ADD COLUMN IF NOT EXISTS exit_check JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stage_event_exit_check') THEN
    ALTER TABLE yucer_pipeline.opportunity_stage_event
      ADD CONSTRAINT chk_stage_event_exit_check
      CHECK (exit_check IS NULL OR jsonb_typeof(exit_check) = 'object');
  END IF;
END $$;
