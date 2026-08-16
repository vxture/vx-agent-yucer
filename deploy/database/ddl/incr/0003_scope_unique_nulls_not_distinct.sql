-- 0003_scope_unique_nulls_not_distinct.sql - make the scope tuples actually unique.
--
-- THE DEFECT: Postgres UNIQUE treats NULLs as DISTINCT by default, so a unique
-- constraint over columns that are NULL does not constrain anything. Both of
-- these tuples carry NULLs for exactly their most important case:
--
--   yucer_gtm.sales_target        (workspace_id, period, scope_type,
--                                  territory_id, owner_sub, metric)
--   yucer_pipeline.forecast_snapshot (workspace_id, period, scope_type,
--                                  territory_id, owner_sub, snapshot_at)
--
-- A WORKSPACE-scope row has territory_id = NULL AND owner_sub = NULL. So
-- uidx_sales_target_scope, which the port documents as making the scope tuple a
-- target's IDENTITY ("a different scope is a different target, and the old one
-- is closed rather than edited"), was inert for the workspace-level target -
-- the one every other number is measured against. The same workspace target
-- could be inserted any number of times, and nothing would complain.
--
-- forecast_snapshot is worse in kind, because it is APPEND-ONLY: its uniqueness
-- is the whole of "one snapshot per scope per instant". Without it the same
-- workspace snapshot could be written twice for the same instant, and forecast
-- accuracy would be computed from a number that exists twice.
--
-- THE FIX: NULLS NOT DISTINCT (Postgres 15+), which makes two NULLs compare as
-- equal for uniqueness. This is a tightening only - every pair that collided
-- before still collides, and two different workspaces still never collide,
-- because workspace_id leads the tuple and is NOT NULL.
--
-- Idempotent: the constraint is dropped by name and rebuilt.

-- --- yucer_gtm.sales_target -------------------------------------------------
ALTER TABLE yucer_gtm.sales_target
  DROP CONSTRAINT IF EXISTS uidx_sales_target_scope;

ALTER TABLE yucer_gtm.sales_target
  ADD CONSTRAINT uidx_sales_target_scope
  UNIQUE NULLS NOT DISTINCT (workspace_id, period, scope_type, territory_id, owner_sub, metric);

-- --- yucer_pipeline.forecast_snapshot ---------------------------------------
ALTER TABLE yucer_pipeline.forecast_snapshot
  DROP CONSTRAINT IF EXISTS uidx_forecast_snapshot_scope_at;

ALTER TABLE yucer_pipeline.forecast_snapshot
  ADD CONSTRAINT uidx_forecast_snapshot_scope_at
  UNIQUE NULLS NOT DISTINCT (workspace_id, period, scope_type, territory_id, owner_sub, snapshot_at);
