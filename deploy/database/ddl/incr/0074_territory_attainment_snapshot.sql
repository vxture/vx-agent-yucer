-- 11a-2: territory attainment snapshots (workplan batch 11a).
--
-- Same reasoning as 0073: sales_target stores the TARGET, and the pipeline
-- tables store the individual deals, but nothing records the aggregate
-- attainment at a point in time. Without this, "are we on track" is a
-- question the system can answer today but cannot answer historically, and
-- "were we on track last month" is the question the strategy layer exists
-- to answer.
--
-- Append-only, same discipline as forecast_snapshot and 0073.

CREATE TABLE IF NOT EXISTS yucer_gtm.territory_attainment_snapshot (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  territory_id      UUID NOT NULL,
  period            VARCHAR(32) NOT NULL,
  snapshotted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_amount     NUMERIC(18, 2) NOT NULL DEFAULT 0
                      CONSTRAINT chk_terr_snap_target
                      CHECK (target_amount >= 0),
  attained_amount   NUMERIC(18, 2) NOT NULL DEFAULT 0
                      CONSTRAINT chk_terr_snap_attained
                      CHECK (attained_amount >= 0),
  currency          VARCHAR(8) NOT NULL DEFAULT 'CNY',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_terr_snap_territory
    FOREIGN KEY (territory_id) REFERENCES yucer_gtm.territory (id) ON DELETE CASCADE,
  CONSTRAINT uidx_terr_snap_ws_terr_period_at
    UNIQUE (workspace_id, territory_id, period, snapshotted_at)
);

CREATE INDEX IF NOT EXISTS idx_terr_snap_ws_territory
  ON yucer_gtm.territory_attainment_snapshot (workspace_id, territory_id, period, snapshotted_at DESC);

-- 97's GRANT ON ALL TABLES runs at grant time, before this increment exists.
GRANT SELECT, INSERT, DELETE ON yucer_gtm.territory_attainment_snapshot TO yucer_svc;

-- Append-only: no UPDATE grant at all.
REVOKE UPDATE ON yucer_gtm.territory_attainment_snapshot FROM yucer_svc;
