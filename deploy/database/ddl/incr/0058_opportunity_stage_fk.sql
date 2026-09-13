-- 0058_opportunity_stage_fk.sql - opportunity.stage's CHECK becomes a
-- composite FK into the workspace's own stage_definition (0057).
--
-- chk_opportunity_stage forbade any string outside the shipped seven,
-- everywhere, forever. A composite FK forbids any string outside THIS
-- WORKSPACE's rows - the same enforcement, scoped where the vocabulary now
-- lives. Separate increment from 0057 on purpose: 0057 is reviewable as "add
-- the vocabulary", this one is "cut the old CHECK over" - a rollback seam if
-- the FK ever needs revisiting without touching the vocabulary table itself.
--
-- ON DELETE RESTRICT, deliberately strict: opportunity_stage_event is
-- append-only and journals every stage a deal ever passed through, so in
-- practice a stage code that was EVER used - even by a deal closed and
-- forgotten years ago - can never be deleted. Renaming stays how a tenant
-- "retires" a stage from view; deletion is only for a stage added and
-- abandoned with zero history. planStageRemoval (stage.ts) gives a clean
-- RuleResult refusal before the raw FK error would ever fire.
--
-- Idempotent throughout.

ALTER TABLE yucer_pipeline.opportunity DROP CONSTRAINT IF EXISTS chk_opportunity_stage;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_opportunity_stage') THEN
    ALTER TABLE yucer_pipeline.opportunity
      ADD CONSTRAINT fk_opportunity_stage
      FOREIGN KEY (workspace_id, stage)
      REFERENCES yucer_pipeline.stage_definition (workspace_id, stage_code)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- opportunity_stage_event.to_stage is NOT NULL; from_stage is nullable (the
-- first event of a deal's life has none) - a composite FK is skipped when
-- either referencing column is NULL, which is standard Postgres MATCH SIMPLE
-- behaviour and exactly what is wanted for from_stage here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_opportunity_stage_event_to_stage') THEN
    ALTER TABLE yucer_pipeline.opportunity_stage_event
      ADD CONSTRAINT fk_opportunity_stage_event_to_stage
      FOREIGN KEY (workspace_id, to_stage)
      REFERENCES yucer_pipeline.stage_definition (workspace_id, stage_code)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_opportunity_stage_event_from_stage') THEN
    ALTER TABLE yucer_pipeline.opportunity_stage_event
      ADD CONSTRAINT fk_opportunity_stage_event_from_stage
      FOREIGN KEY (workspace_id, from_stage)
      REFERENCES yucer_pipeline.stage_definition (workspace_id, stage_code)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- A composite FK needs a matching index on the referencing side for lookup
-- performance (Postgres does not create one automatically). idx_opportunity_ws_stage
-- (00_baseline.sql) already covers opportunity's own (workspace_id, stage).
CREATE INDEX IF NOT EXISTS idx_opportunity_stage_event_ws_from_stage
  ON yucer_pipeline.opportunity_stage_event (workspace_id, from_stage);
CREATE INDEX IF NOT EXISTS idx_opportunity_stage_event_ws_to_stage
  ON yucer_pipeline.opportunity_stage_event (workspace_id, to_stage);
