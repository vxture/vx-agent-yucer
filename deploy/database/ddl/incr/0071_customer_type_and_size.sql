-- 0071_customer_type_and_size.sql - 客户分类's other two vocabularies.
--
-- Authority: owner, 2026-09-16 - 客户分类 (行业分类 renamed) grows from one
-- vocabulary to three: 行业, 客户类型, 客户规模. All three answer the same
-- question - how is a customer filed - which is why they live on one admin
-- page and in one D4 domain, as three INDEPENDENT vocabularies (the product
-- config trio's own rule, 2026-09-05): none of them knows the other two
-- exist.
--
-- BRAND NEW COLUMNS, unlike incr/0040's industry migration: there was no
-- prior free-text customer_type or customer_size field to carry forward, so
-- there is no backfill pass here - just the vocabulary, the join, and a
-- starter set.
--
-- NOT account.employee_count. That is a raw headcount the customer reports;
-- customer_size is the BAND the workspace itself sells against (集团客户 /
-- 大型企业 / 中型企业 / ...). A count does not derive a band on its own - the
-- boundary is a commercial decision, not a formula - so the two columns stay
-- independent, the same way incr/0024's own comment keeps employee_count a
-- count rather than a name.
--
-- SAME SHAPE AS INDUSTRY: an anchor code, a display name, an order, a
-- per-workspace unique index, a NULLABLE uuid join (most customers arrive
-- unclassified, and that is honestly absent rather than defaulted).
--
-- Idempotent throughout.

-- --- 客户类型 ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS yucer_core.customer_type (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL,
  customer_type_code VARCHAR(32) NOT NULL,
  name               VARCHAR(64) NOT NULL,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_customer_type_code UNIQUE (workspace_id, customer_type_code)
);

CREATE INDEX IF NOT EXISTS idx_customer_type_ws_sort
  ON yucer_core.customer_type (workspace_id, sort_order);

-- Five, not a finer cut: 直销 / 渠道 / 代理 / 合作伙伴 / 内部 is how a sales
-- org actually tells customers apart when deciding who owns the relationship
-- and how a deal is priced. A workspace that sells differently renames or
-- adds to this from the admin page; these are a starting point, not a
-- standard.
INSERT INTO yucer_core.customer_type (workspace_id, customer_type_code, name, sort_order)
SELECT w.workspace_id, v.code, v.name, v.ord
  FROM (SELECT DISTINCT workspace_id FROM yucer_core.account) w
 CROSS JOIN (VALUES
   ('direct',  '直销客户', 1),
   ('channel', '渠道客户', 2),
   ('agent',   '代理商',   3),
   ('partner', '合作伙伴', 4),
   ('internal','内部客户', 5)
 ) AS v(code, name, ord)
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_core.customer_type t WHERE t.workspace_id = w.workspace_id
 )
ON CONFLICT (workspace_id, customer_type_code) DO NOTHING;

ALTER TABLE yucer_core.account
  ADD COLUMN IF NOT EXISTS customer_type_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_account_customer_type') THEN
    ALTER TABLE yucer_core.account
      ADD CONSTRAINT fk_account_customer_type FOREIGN KEY (customer_type_id)
      REFERENCES yucer_core.customer_type (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_account_ws_customer_type
  ON yucer_core.account (workspace_id, customer_type_id);

-- --- 客户规模 ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS yucer_core.customer_size (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL,
  customer_size_code VARCHAR(32) NOT NULL,
  name               VARCHAR(64) NOT NULL,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_customer_size_code UNIQUE (workspace_id, customer_size_code)
);

CREATE INDEX IF NOT EXISTS idx_customer_size_ws_sort
  ON yucer_core.customer_size (workspace_id, sort_order);

-- The 国标 GB/T large/medium/small/micro cut, plus 集团客户 above it for a
-- conglomerate/group account - the five bands a B2B seller in this market
-- actually prices and staffs differently against.
INSERT INTO yucer_core.customer_size (workspace_id, customer_size_code, name, sort_order)
SELECT w.workspace_id, v.code, v.name, v.ord
  FROM (SELECT DISTINCT workspace_id FROM yucer_core.account) w
 CROSS JOIN (VALUES
   ('group',  '集团客户', 1),
   ('large',  '大型企业', 2),
   ('medium', '中型企业', 3),
   ('small',  '小型企业', 4),
   ('micro',  '微型企业', 5)
 ) AS v(code, name, ord)
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_core.customer_size s WHERE s.workspace_id = w.workspace_id
 )
ON CONFLICT (workspace_id, customer_size_code) DO NOTHING;

ALTER TABLE yucer_core.account
  ADD COLUMN IF NOT EXISTS customer_size_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_account_customer_size') THEN
    ALTER TABLE yucer_core.account
      ADD CONSTRAINT fk_account_customer_size FOREIGN KEY (customer_size_id)
      REFERENCES yucer_core.customer_size (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_account_ws_customer_size
  ON yucer_core.account (workspace_id, customer_size_id);

-- --- grants -----------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON yucer_core.customer_type TO yucer_svc;
GRANT UPDATE (name, sort_order, updated_at)
  ON yucer_core.customer_type TO yucer_svc;

GRANT SELECT, INSERT, DELETE ON yucer_core.customer_size TO yucer_svc;
GRANT UPDATE (name, sort_order, updated_at)
  ON yucer_core.customer_size TO yucer_svc;

-- account: restated whole, as every increment that touches its writable set
-- must (0068's own lesson) - the two new joins added to 0068's list.
REVOKE UPDATE ON yucer_core.account FROM yucer_svc;
GRANT UPDATE (name, industry_id, customer_type_id, customer_size_id, region, province,
              segment_code, owner_sub, health_score, status,
              tier, credit_code, website, employee_count, parent_id, updated_at, deleted_at)
  ON yucer_core.account TO yucer_svc;
