-- 0044_pricing_policy.sql - 计价规则: the currency a workspace prices in.
--
-- Authority: owner, 2026-09-09 - "需要币种设置，系统统一应用".
--
-- WHAT IT WAS: the string "CNY" in eleven places - the line pricer's fallback,
-- the pipeline's default line currency, lead conversion, the price book's
-- column, and four pages' "if no row has an amount, assume". Eleven copies of
-- one decision, none of them a workspace's.
--
-- ONE ROW PER WORKSPACE, IN THE CATALOGUE'S SCHEMA. Pricing is the catalogue's
-- (ADR-017 gave the floor price its own permission there), and ADR-014's rule
-- is that everyone reads the catalogue and nobody else writes it - which is
-- exactly the shape a default currency has: the pipeline, conversion and every
-- roll-up read it; only whoever may set prices may change it.
--
-- THE CODE IS ISO 4217 AND NOTHING ELSE IS CHECKED. Three capitals is what the
-- database can say; whether XYZ is a currency is not, and a reference table of
-- currencies (yucer_ref, like the administrative tree) is the honest next step
-- if a tenant ever types one wrong. Named here so it is a decision deferred and
-- not one missed.
--
-- No DELETE grant: every workspace prices in something, and "back to yuan" is
-- an update.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_catalog.pricing_policy (
  workspace_id     UUID PRIMARY KEY,                    -- [ref] isolation key
  default_currency CHAR(3) NOT NULL DEFAULT 'CNY',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_pricing_policy_currency CHECK (default_currency ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE yucer_catalog.pricing_policy IS
  '计价规则 - the currency a workspace quotes in by default. One row per workspace; see incr/0044.';

-- Every workspace that already prices or sells gets the yuan it was assuming.
INSERT INTO yucer_catalog.pricing_policy (workspace_id, default_currency)
SELECT DISTINCT workspace_id, 'CNY' FROM yucer_catalog.product
UNION
SELECT DISTINCT workspace_id, 'CNY' FROM yucer_pipeline.opportunity
ON CONFLICT (workspace_id) DO NOTHING;

GRANT SELECT, INSERT ON yucer_catalog.pricing_policy TO yucer_svc;
GRANT UPDATE (default_currency, updated_at) ON yucer_catalog.pricing_policy TO yucer_svc;
