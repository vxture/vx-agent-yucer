-- Least-privilege service role (data_platform_100 section 2.2.4 / governance
-- section 7). The runtime connects as yucer_svc, NOT the DB
-- owner. SELECT/INSERT/DELETE on the contract schemas; NO DDL; NO blanket UPDATE
-- (column-level UPDATE is granted per the whitelist in 98_column_locks.sql).
-- The password is injected at bootstrap (never in the repo).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yucer_svc') THEN
    CREATE ROLE yucer_svc LOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA vx_provision, local_authz, local_usage TO yucer_svc;

GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA vx_provision, local_authz, local_usage
  TO yucer_svc;

-- Domain schemas (added by the product) must grant the service role explicitly;
-- the contract schemas above are the factory baseline.

-- --- yucer product domain schemas (00_baseline.sql section "PRODUCT DOMAIN") ---
-- Same least-privilege shape as the contract schemas: SELECT/INSERT/DELETE only,
-- no DDL, no blanket UPDATE. Column-level UPDATE is whitelisted in
-- 98_column_locks.sql; a domain column that is not listed there is not writable.
GRANT USAGE ON SCHEMA yucer_core, yucer_gtm, yucer_pipeline, yucer_delivery, yucer_agent
  TO yucer_svc;

GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA
  yucer_core, yucer_gtm, yucer_pipeline, yucer_delivery, yucer_agent
  TO yucer_svc;
