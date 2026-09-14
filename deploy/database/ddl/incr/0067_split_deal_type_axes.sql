-- 0067_split_deal_type_axes.sql - 商机类型 was two questions in one dropdown.
--
-- Authority: owner, 2026-09-14.
--
-- WHAT IT WAS: yucer_pipeline.deal_type (incr/0060), five values that mix two
-- orthogonal axes - 新签/续费/增购 is what KIND OF TRANSACTION this is,
-- 项目型/产品型 is what FORM the business takes. 0060's own header and
-- docs/20-specs/50-role-permission-catalog.md both named the mixing at ship
-- time and accepted it as the same flat-list simplification every vocabulary
-- here makes. This increment stops accepting it.
--
-- TWO TABLES, because they are two facts about one deal and a deal has both:
--   contract_type  签约类型   新签 / 续签 / 增购
--   business_form  业务形态   项目定制类 / 标化产品类 / 咨询服务类
-- A deal is a 续签 of a 项目定制类 engagement; the old list could say only one
-- of those and made the reader guess which question it had answered.
--
-- 停滞天数覆盖 MOVES TO business_form (incr/0062 put it on deal_type). How long
-- a deal may sit at one stage before the clock caps its forecast band is a fact
-- about DELIVERY COMPLEXITY - a bespoke project negotiates longer than a
-- standard product sale - and nothing about whether that same deal is new
-- business or a renewal.
--
-- ONE DELIBERATE DATA LOSS, stated rather than discovered later: a workspace
-- that had set a stall override on its 新签/续费/增购 rows loses those three
-- numbers. They have no position on the axis the column now belongs to, and
-- inventing one would be this increment asserting something nobody decided.
-- The overrides on 项目型/产品型 travel to their successors below.
--
-- THE OLD TABLE AND COLUMN GO, in this same increment, once backfilled - the
-- established pattern here for replacing a vocabulary (incr/0029 swapped
-- product.category/status for type_id/status_id and dropped both columns on
-- the spot; 0039 and 0040 did the same for 赢丢原因 and 行业分类).
--
-- Idempotent throughout.

-- --- 签约类型 ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS yucer_pipeline.contract_type (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL,                      -- [ref] isolation key
  contract_type_code VARCHAR(32) NOT NULL,               -- anchor, immutable
  name               VARCHAR(64) NOT NULL,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_contract_type_code UNIQUE (workspace_id, contract_type_code)
);

CREATE INDEX IF NOT EXISTS idx_contract_type_ws_sort
  ON yucer_pipeline.contract_type (workspace_id, sort_order);

COMMENT ON TABLE yucer_pipeline.contract_type IS
  '签约类型 - what kind of transaction a deal is: 新签/续签/增购. One axis of the old deal_type; see incr/0067.';

-- --- 业务形态 ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS yucer_pipeline.business_form (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL,                     -- [ref] isolation key
  business_form_code  VARCHAR(32) NOT NULL,              -- anchor, immutable
  name                VARCHAR(64) NOT NULL,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  -- incr/0062's column, on the axis it belongs to. NULL means this form defers
  -- to the workspace's own forecast_threshold.stall_days.
  stall_days_override SMALLINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_business_form_code UNIQUE (workspace_id, business_form_code),
  CONSTRAINT chk_business_form_stall_override
    CHECK (stall_days_override IS NULL OR stall_days_override BETWEEN 1 AND 365)
);

CREATE INDEX IF NOT EXISTS idx_business_form_ws_sort
  ON yucer_pipeline.business_form (workspace_id, sort_order);

COMMENT ON TABLE yucer_pipeline.business_form IS
  '业务形态 - what form the business takes: 项目定制类/标化产品类/咨询服务类, and how long that form may stall. See incr/0067.';

-- --- the starter values, per workspace that already has a deal type ------------
-- Scoped to workspaces that already carry the old vocabulary rather than to
-- "has an opportunity" (0060's scope): a workspace that reached 0060 has the
-- five, and one that never did gets both lists lazily on first contact with
-- the config page, exactly as listDealTypes covered that gap before.
INSERT INTO yucer_pipeline.contract_type (workspace_id, contract_type_code, name, sort_order)
SELECT w.workspace_id, v.code, v.name, v.ord
  FROM (SELECT DISTINCT workspace_id FROM yucer_pipeline.deal_type) w
 CROSS JOIN (VALUES
   ('new_logo',  '新签', 1),
   ('renewal',   '续签', 2),
   ('expansion', '增购', 3)
 ) AS v(code, name, ord)
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_pipeline.contract_type c WHERE c.workspace_id = w.workspace_id
 )
ON CONFLICT (workspace_id, contract_type_code) DO NOTHING;

INSERT INTO yucer_pipeline.business_form (workspace_id, business_form_code, name, sort_order)
SELECT w.workspace_id, v.code, v.name, v.ord
  FROM (SELECT DISTINCT workspace_id FROM yucer_pipeline.deal_type) w
 CROSS JOIN (VALUES
   ('custom_project',   '项目定制类', 1),
   ('standard_product', '标化产品类', 2),
   ('consulting',       '咨询服务类', 3)
 ) AS v(code, name, ord)
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_pipeline.business_form b WHERE b.workspace_id = w.workspace_id
 )
ON CONFLICT (workspace_id, business_form_code) DO NOTHING;

-- A RENAMED row keeps the workspace's own wording; an untouched one takes the
-- new shipped name. The `name <> <old default>` guard is what separates the
-- two, and it is why 续费 becomes 续签 for everybody who never renamed it
-- while a workspace that calls it 「年度续约」 keeps that. Order carries over
-- either way - a workspace that reordered meant it.
UPDATE yucer_pipeline.contract_type c
   SET name = CASE
         WHEN d.name <> v.old_default THEN d.name
         ELSE c.name
       END,
       sort_order = d.sort_order,
       updated_at = now()
  FROM yucer_pipeline.deal_type d
  JOIN (VALUES
    ('new_logo',  '新签'),
    ('renewal',   '续费'),
    ('expansion', '增购')
  ) AS v(code, old_default) ON v.code = d.deal_type_code
 WHERE d.workspace_id = c.workspace_id
   AND d.deal_type_code = c.contract_type_code;

-- 项目型/产品型 travel to their successors under their new names unless the
-- workspace had renamed them, and carry their stall override either way.
UPDATE yucer_pipeline.business_form b
   SET name = CASE
         WHEN d.name <> v.old_default THEN d.name
         ELSE b.name
       END,
       stall_days_override = d.stall_days_override,
       updated_at = now()
  FROM yucer_pipeline.deal_type d
  JOIN (VALUES
    ('project', '项目型',  'custom_project'),
    ('product', '产品型', 'standard_product')
  ) AS v(code, old_default, new_code) ON v.code = d.deal_type_code
 WHERE d.workspace_id = b.workspace_id
   AND b.business_form_code = v.new_code;

-- --- the opportunity joins both vocabularies ----------------------------------
ALTER TABLE yucer_pipeline.opportunity
  ADD COLUMN IF NOT EXISTS contract_type_id UUID;
ALTER TABLE yucer_pipeline.opportunity
  ADD COLUMN IF NOT EXISTS business_form_id UUID;

-- Both nullable, for 0060's own reason: an unclassified deal is honestly
-- absent, not defaulted - and now a deal can genuinely know one axis and not
-- the other, which is precisely what the old single column could not express.
UPDATE yucer_pipeline.opportunity o
   SET contract_type_id = c.id
  FROM yucer_pipeline.deal_type d
  JOIN yucer_pipeline.contract_type c
    ON c.workspace_id = d.workspace_id AND c.contract_type_code = d.deal_type_code
 WHERE o.deal_type_id = d.id
   AND d.deal_type_code IN ('new_logo', 'renewal', 'expansion');

UPDATE yucer_pipeline.opportunity o
   SET business_form_id = b.id
  FROM yucer_pipeline.deal_type d
  JOIN yucer_pipeline.business_form b
    ON b.workspace_id = d.workspace_id
   AND b.business_form_code = CASE d.deal_type_code
         WHEN 'project' THEN 'custom_project'
         WHEN 'product' THEN 'standard_product'
       END
 WHERE o.deal_type_id = d.id
   AND d.deal_type_code IN ('project', 'product');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_opportunity_contract_type') THEN
    ALTER TABLE yucer_pipeline.opportunity
      ADD CONSTRAINT fk_opportunity_contract_type FOREIGN KEY (contract_type_id)
      REFERENCES yucer_pipeline.contract_type (id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_opportunity_business_form') THEN
    ALTER TABLE yucer_pipeline.opportunity
      ADD CONSTRAINT fk_opportunity_business_form FOREIGN KEY (business_form_id)
      REFERENCES yucer_pipeline.business_form (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opportunity_ws_contract_type
  ON yucer_pipeline.opportunity (workspace_id, contract_type_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_ws_business_form
  ON yucer_pipeline.opportunity (workspace_id, business_form_id);

-- --- the old axis goes, now that both halves of it are carried ----------------
-- The column first: fk_opportunity_deal_type and idx_opportunity_ws_deal_type
-- are dropped with it, which is what makes the table droppable.
ALTER TABLE yucer_pipeline.opportunity DROP COLUMN IF EXISTS deal_type_id;
DROP TABLE IF EXISTS yucer_pipeline.deal_type;

-- --- grants -------------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON yucer_pipeline.contract_type TO yucer_svc;
GRANT UPDATE (name, sort_order, updated_at)
  ON yucer_pipeline.contract_type TO yucer_svc;

GRANT SELECT, INSERT, DELETE ON yucer_pipeline.business_form TO yucer_svc;
GRANT UPDATE (name, sort_order, stall_days_override, updated_at)
  ON yucer_pipeline.business_form TO yucer_svc;

-- opportunity: deal_type_id leaves the writable set, the two new columns join
-- it. Restated in full because grants accumulate and REVOKE resets first - the
-- same discipline incr/0060's own restatement note explains.
REVOKE UPDATE ON yucer_pipeline.opportunity FROM yucer_svc;
GRANT UPDATE (name, plan_id, territory_id, owner_sub, stage, forecast_category,
              amount, currency, probability, requirement,
              contract_type_id, business_form_id,
              expected_close_at, closed_at, status, updated_at, deleted_at)
  ON yucer_pipeline.opportunity TO yucer_svc;
