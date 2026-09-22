-- 11a-1: segment coverage snapshots (workplan batch 11a).
--
-- What does this table answer that yucer_gtm.market_segment cannot?
-- market_segment.criteria is a FILTER - which accounts match RIGHT NOW.
-- Nothing records what the answer WAS at any earlier point, so there is no
-- trend: "coverage is rising" and "coverage is falling" both look the same as
-- "coverage is 47" if the only data point is the present. forecast_snapshot
-- already solved this problem for pipeline/revenue; this is the same structure
-- for the strategy layer.
--
-- Append-only, like forecast_snapshot: UPDATE is revoked, and a correction is
-- a new row. The scheduler writes one row per (workspace, segment) at the
-- configured cadence; a manual trigger can write an additional point.

CREATE TABLE IF NOT EXISTS yucer_gtm.segment_coverage_snapshot (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID NOT NULL,
  segment_id             UUID NOT NULL,
  snapshotted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched_account_count  INTEGER NOT NULL
                           CONSTRAINT chk_seg_snap_account_count
                           CHECK (matched_account_count >= 0),
  open_pipeline_amount   NUMERIC(18, 2) NOT NULL DEFAULT 0
                           CONSTRAINT chk_seg_snap_pipeline
                           CHECK (open_pipeline_amount >= 0),
  won_amount             NUMERIC(18, 2) NOT NULL DEFAULT 0
                           CONSTRAINT chk_seg_snap_won
                           CHECK (won_amount >= 0),
  currency               VARCHAR(8) NOT NULL DEFAULT 'CNY',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_seg_snap_segment
    FOREIGN KEY (segment_id) REFERENCES yucer_gtm.market_segment (id) ON DELETE CASCADE,
  CONSTRAINT uidx_seg_snap_ws_seg_at
    UNIQUE (workspace_id, segment_id, snapshotted_at)
);

CREATE INDEX IF NOT EXISTS idx_seg_snap_ws_segment
  ON yucer_gtm.segment_coverage_snapshot (workspace_id, segment_id, snapshotted_at DESC);

-- 97's GRANT ON ALL TABLES runs at grant time, before this increment exists.
GRANT SELECT, INSERT, DELETE ON yucer_gtm.segment_coverage_snapshot TO yucer_svc;

-- Append-only: no UPDATE grant at all.
REVOKE UPDATE ON yucer_gtm.segment_coverage_snapshot FROM yucer_svc;
