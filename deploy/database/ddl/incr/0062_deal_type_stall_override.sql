-- 0062_deal_type_stall_override.sql - a deal type may set its own stall clock.
--
-- Authority: docs/70-workplan/00-index.md's "候选二: 商机类型分轴" second
-- layer, deferred by incr/0060/0061 ("不做") until the classification axis
-- itself existed. It now does; this is that layer.
--
-- WHAT IT ADDS: an OPTIONAL override on yucer_pipeline.deal_type
-- (incr/0060) for the same stall_days concept incr/0041's forecast_threshold
-- already owns at workspace scope. NULL (the default for every seeded row
-- and every lazily-seeded workspace) means "no override - use this
-- workspace's own forecast_threshold.stall_days", so a tenant that never
-- opens this field sees no change at all.
--
-- WHY A COLUMN ON deal_type, NOT A NEW TABLE. A (deal_type_id, stall_days)
-- table would need deal_type_id as its own primary key to mean anything - at
-- which point it is a column split across two tables for no reason - or it
-- would allow more than one row per type, the exact "state with no meaning"
-- forecast_threshold's own header already rejects for itself. This is a fact
-- about the row, not about a relationship.
--
-- SAME BOUNDS AS forecast_threshold.stall_days (chk_forecast_threshold_stall,
-- incr/0041): 1 to 365. A zero-day override would cap a deal the day it
-- moved; the column simply being NULL is how "no override" is spelled, not a
-- number of days that means "off".
--
-- ADDITIVE GRANT, deliberately not the REVOKE-then-restate form incr/0040 and
-- incr/0060 used for their own tables: a separate, independently-running
-- session is hardening deal_type's cross-workspace FKs in this same window,
-- and two increments that each REVOKE and fully restate UPDATE on
-- yucer_pipeline.deal_type would silently drop whichever one runs first.
-- column-locks.test.ts's own parser unions multiple GRANT UPDATE statements
-- on one table as long as nothing REVOKEs between them, so this is a legal,
-- narrower way to add one column's write grant.
--
-- Idempotent throughout.

ALTER TABLE yucer_pipeline.deal_type
  ADD COLUMN IF NOT EXISTS stall_days_override SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_deal_type_stall_override'
  ) THEN
    ALTER TABLE yucer_pipeline.deal_type
      ADD CONSTRAINT chk_deal_type_stall_override
      CHECK (stall_days_override IS NULL OR stall_days_override BETWEEN 1 AND 365);
  END IF;
END $$;

-- --- grants -------------------------------------------------------------
-- Who may write this specific column is narrower than who may rename/reorder
-- the type (pipeline.dealType, incr/0061): the service layer's own
-- permission gate keeps them apart, this grant only says the service role
-- itself may write it either way.
GRANT UPDATE (stall_days_override, updated_at)
  ON yucer_pipeline.deal_type TO yucer_svc;
