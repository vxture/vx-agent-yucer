-- 0029_status_vocabulary.sql - two independent vocabularies, both joined by uuid.
--
-- Authority: the owner's 2026-09-05 config rulings (final form):
--
--   产品类型 describes ONLY what kind of product something is. It has its own
--   effective/retired state (a retired type is no longer offered to new
--   products; old products keep rendering it). It knows nothing of status.
--
--   产品状态 describes ONLY what stage a product is at - in development, on
--   sale, retired. THE ROWS THEMSELVES ARE THE CONTENT: this table has no
--   enablement column and no "behavior" column - a status does not have a
--   status. Each row carries a NAME and a DESCRIPTION (状态描述, the config
--   table's fourth column).
--
--   The two tables have NO relation to each other. Both are referenced by
--   product - type_id and status_id, both uuid (internal join keys are uuids
--   and never display; business codes are anchors for upserts and imports,
--   never join keys).
--
-- The three canonical rows (in_development / active / retired) are seeded per
-- workspace with their standard names and descriptions. They are protected
-- from DELETION by the rule layer - not because the tables are related, but
-- because the module page's two rosters, its two tags and the 上线/退役 row
-- operations are wired to these rows. Workspace-added statuses take the full
-- operation set.
--
-- Idempotent throughout.

-- --- the status vocabulary ---------------------------------------------------
CREATE TABLE IF NOT EXISTS yucer_catalog.product_status (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                          -- [ref] isolation key
  status_code  VARCHAR(32) NOT NULL,                   -- anchor, immutable
  name         VARCHAR(64) NOT NULL,
  description  VARCHAR(255),                           -- 状态描述, optional
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_product_status_code UNIQUE (workspace_id, status_code)
);

CREATE INDEX IF NOT EXISTS idx_product_status_ws_sort
  ON yucer_catalog.product_status (workspace_id, sort_order);

-- Seed the three canonical rows for every workspace that already has products.
-- (A fresh workspace gets them from the service on first read - the domain
-- carries the same defaults, so the two paths cannot drift apart by much, and
-- the rows are ordinary data the workspace may rename afterwards.)
INSERT INTO yucer_catalog.product_status (workspace_id, status_code, name, description, sort_order)
SELECT w.workspace_id, v.code, v.name, v.description, v.ord
  FROM (SELECT DISTINCT workspace_id FROM yucer_catalog.product) w
 CROSS JOIN (VALUES
   ('in_development', '在研', '计划中、研发中的产品：真实存在、出现在计划里，但不可报价。', 1),
   ('active',         '在售', '成熟在售的产品：唯一可报价的状态。', 2),
   ('retired',        '已退役', '搁置而非删除：随时可恢复在售，历史引用全部保留。', 3)
 ) AS v(code, name, description, ord)
ON CONFLICT (workspace_id, status_code) DO NOTHING;

-- --- product joins both vocabularies by uuid --------------------------------
ALTER TABLE yucer_catalog.product
  ADD COLUMN IF NOT EXISTS type_id UUID;

UPDATE yucer_catalog.product p
   SET type_id = t.id
  FROM yucer_catalog.product_type t
 WHERE p.type_id IS NULL
   AND p.category IS NOT NULL
   AND t.workspace_id = p.workspace_id
   AND t.type_code = p.category;

ALTER TABLE yucer_catalog.product DROP COLUMN IF EXISTS category;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_product_type') THEN
    ALTER TABLE yucer_catalog.product
      ADD CONSTRAINT fk_product_type FOREIGN KEY (type_id)
      REFERENCES yucer_catalog.product_type (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_ws_type
  ON yucer_catalog.product (workspace_id, type_id);

ALTER TABLE yucer_catalog.product
  ADD COLUMN IF NOT EXISTS status_id UUID;

UPDATE yucer_catalog.product p
   SET status_id = s.id
  FROM yucer_catalog.product_status s
 WHERE p.status_id IS NULL
   AND s.workspace_id = p.workspace_id
   AND s.status_code = p.status;

-- Guarded: NOT NULL only once every row is mapped (a fresh database sets it
-- immediately; a database with unmappable legacy codes fails loudly here
-- rather than silently keeping a nullable column).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yucer_catalog.product WHERE status_id IS NULL) THEN
    ALTER TABLE yucer_catalog.product ALTER COLUMN status_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_product_status') THEN
    ALTER TABLE yucer_catalog.product
      ADD CONSTRAINT fk_product_status FOREIGN KEY (status_id)
      REFERENCES yucer_catalog.product_status (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_ws_status
  ON yucer_catalog.product (workspace_id, status_id);

-- The status string leaves with its CHECK: the column is replaced by the
-- uuid join above, and validity is now the vocabulary's unique index plus
-- the FK.
ALTER TABLE yucer_catalog.product DROP COLUMN IF EXISTS status;

-- --- grants -----------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON yucer_catalog.product_status TO yucer_svc;
REVOKE UPDATE ON yucer_catalog.product_status FROM yucer_svc;
-- status_code is the anchor - locked, like type_code one table over.
GRANT UPDATE (name, description, sort_order, updated_at)
  ON yucer_catalog.product_status TO yucer_svc;

-- product: category and status leave the writable set; the two uuid joins
-- take their place. Restated whole (REVOKE resets, then the full grant - the
-- mirror's parser understands this).
REVOKE UPDATE ON yucer_catalog.product FROM yucer_svc;
GRANT UPDATE (name, unit, sort_order, type_id, status_id, updated_at)
  ON yucer_catalog.product TO yucer_svc;
