-- 0096_forecast_manager_call.sql - 主管预估数 on the forecast snapshot.
-- Design: YC-067 section 06 (numbered 0086 there - "以合并顺序为准"), YC-065 R9.
--
-- A snapshot records what the RULE computed: four category totals. The number a
-- manager actually calls in the forecast meeting is often different, and it is
-- the number the business plans against - so it is recorded beside the
-- computed ones, with who submitted the snapshot (never recorded until now).
-- Accuracy is then measured for both: did the rule know, and did the manager.
--
-- WRITTEN ONLY ON INSERT, like every column of this table: UPDATE stays
-- revoked. Changing the call is submitting another snapshot, which is what
-- keeps "what was called at period start" answerable.
--
-- Historical snapshots read NULL: "not recorded then", not "no call".
-- Idempotent throughout.

ALTER TABLE yucer_pipeline.forecast_snapshot
  ADD COLUMN IF NOT EXISTS call_amount NUMERIC(18, 2),   -- NULL = no call given this time
  ADD COLUMN IF NOT EXISTS call_note TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by_sub VARCHAR(128);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_forecast_snapshot_call_amount') THEN
    ALTER TABLE yucer_pipeline.forecast_snapshot
      ADD CONSTRAINT chk_forecast_snapshot_call_amount CHECK (call_amount IS NULL OR call_amount >= 0);
  END IF;
  -- A note explains a number; a note with no number has nothing to explain.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_forecast_snapshot_call_note') THEN
    ALTER TABLE yucer_pipeline.forecast_snapshot
      ADD CONSTRAINT chk_forecast_snapshot_call_note CHECK (call_amount IS NOT NULL OR call_note IS NULL);
  END IF;
END $$;

-- No grant change: yucer_svc holds table-level INSERT (which covers new
-- columns) and no UPDATE, and neither changes.
