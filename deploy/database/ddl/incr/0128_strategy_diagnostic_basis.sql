-- SE-01 / #688: preserve legacy points, but never label them as corrected.
-- Old application versions insert the default {} during a rolling upgrade.
-- Corrected captures explicitly insert basis.version = 2. No history rewrite.
ALTER TABLE yucer_gtm.segment_coverage_snapshot
  ADD COLUMN basis JSONB NOT NULL DEFAULT '{}'::jsonb,
  ALTER COLUMN open_pipeline_amount DROP NOT NULL,
  ALTER COLUMN won_amount DROP NOT NULL,
  ADD CONSTRAINT chk_segment_snapshot_basis CHECK (jsonb_typeof(basis) = 'object');

ALTER TABLE yucer_gtm.territory_attainment_snapshot
  ADD COLUMN basis JSONB NOT NULL DEFAULT '{}'::jsonb,
  ALTER COLUMN attained_amount DROP NOT NULL,
  ADD CONSTRAINT chk_territory_snapshot_basis CHECK (jsonb_typeof(basis) = 'object');

CREATE INDEX idx_segment_snapshot_trusted
  ON yucer_gtm.segment_coverage_snapshot (workspace_id, snapshotted_at DESC)
  WHERE basis->'version' = '2'::jsonb;
CREATE INDEX idx_territory_snapshot_trusted
  ON yucer_gtm.territory_attainment_snapshot (workspace_id, snapshotted_at DESC)
  WHERE basis->'version' = '2'::jsonb;

-- Both tables remain append-only. There are no new UPDATE grants.
REVOKE UPDATE ON yucer_gtm.segment_coverage_snapshot FROM yucer_svc;
REVOKE UPDATE ON yucer_gtm.territory_attainment_snapshot FROM yucer_svc;
