-- 0060_deal_type.sql - 商机类型 becomes a vocabulary, like every other one.
--
-- Authority: docs/70-workplan/00-index.md's "候选二: 商机类型分轴" (recorded
-- earlier in the same session that produced incr/0057-0059) and the owner's
-- follow-up ruling once asked to name a starter list.
--
-- WHAT IT WAS: nothing. `opportunity` has never carried a type/kind/category
-- column - every deal in the product has been the same shape regardless of
-- whether it is a brand-new logo, a renewal, an expansion, or a project vs. a
-- product sale. This increment builds the classification axis itself; it does
-- NOT build anything that reads it (no split thresholds, no per-type rules -
-- see the plan's own explicit "不做" list).
--
-- SAME SHAPE AS 0039 / 0040 / 0057: an anchor code, a display name, an order,
-- a per-workspace unique index, and a NULLABLE uuid join from the row that
-- uses it - nullable because most deals in the seeded history predate this
-- column and an unclassified deal is honestly absent, not defaulted.
--
-- FIVE STARTER VALUES, mixing two axes on purpose (owner-approved, the same
-- simplification every vocabulary here makes): 新签/续费/增购 are commercial
-- MOTION, 项目型/产品型 are DELIVERY FORM - a tenant renames/reorders/adds/
-- removes exactly as with every other vocabulary in this product.
--
-- Idempotent throughout.

-- --- the deal-type vocabulary ------------------------------------------------
CREATE TABLE IF NOT EXISTS yucer_pipeline.deal_type (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,                        -- [ref] isolation key
  deal_type_code VARCHAR(32) NOT NULL,                  -- anchor, immutable
  name           VARCHAR(64) NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_deal_type_code UNIQUE (workspace_id, deal_type_code)
);

CREATE INDEX IF NOT EXISTS idx_deal_type_ws_sort
  ON yucer_pipeline.deal_type (workspace_id, sort_order);

-- The shipped starter five, per workspace that already has an opportunity -
-- the same backfill scope incr/0057 uses, for the same reason: a genuinely
-- new workspace gets its seed lazily, on first contact with the config page
-- (listDealTypes), which is what covers the gap this backfill cannot reach.
INSERT INTO yucer_pipeline.deal_type (workspace_id, deal_type_code, name, sort_order)
SELECT w.workspace_id, v.code, v.name, v.ord
  FROM (SELECT DISTINCT workspace_id FROM yucer_pipeline.opportunity) w
 CROSS JOIN (VALUES
   ('new_logo',  '新签',  1),
   ('renewal',   '续费',  2),
   ('expansion', '增购',  3),
   ('project',   '项目型', 4),
   ('product',   '产品型', 5)
 ) AS v(code, name, ord)
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_pipeline.deal_type d WHERE d.workspace_id = w.workspace_id
 )
ON CONFLICT (workspace_id, deal_type_code) DO NOTHING;

-- --- the opportunity joins the vocabulary by uuid ----------------------------
ALTER TABLE yucer_pipeline.opportunity
  ADD COLUMN IF NOT EXISTS deal_type_id UUID;

-- NULLABLE, unlike stage: a deal with no type is the ordinary state of every
-- row that predates this column, and there is no "unclassified" row this
-- increment could safely default every existing deal to without asserting
-- something about it nobody actually decided.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_opportunity_deal_type') THEN
    ALTER TABLE yucer_pipeline.opportunity
      ADD CONSTRAINT fk_opportunity_deal_type FOREIGN KEY (deal_type_id)
      REFERENCES yucer_pipeline.deal_type (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opportunity_ws_deal_type
  ON yucer_pipeline.opportunity (workspace_id, deal_type_id);

-- --- grants -----------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON yucer_pipeline.deal_type TO yucer_svc;
-- deal_type_code is the anchor - locked, like every other vocabulary's code.
GRANT UPDATE (name, sort_order, updated_at)
  ON yucer_pipeline.deal_type TO yucer_svc;

-- opportunity: deal_type_id joins the writable set. Restated in full because
-- grants accumulate and REVOKE resets first - the same discipline incr/0034's
-- own restatement note explains.
REVOKE UPDATE ON yucer_pipeline.opportunity FROM yucer_svc;
GRANT UPDATE (name, plan_id, territory_id, owner_sub, stage, forecast_category,
              amount, currency, probability, requirement, deal_type_id,
              expected_close_at, closed_at, status, updated_at, deleted_at)
  ON yucer_pipeline.opportunity TO yucer_svc;
