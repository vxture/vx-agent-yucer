-- 0037_pricing_unit.sql - 计价单位 becomes a vocabulary, like type and status.
--
-- Authority: owner, 2026-09-08, adding 计价单位 to 产品配置 as its third
-- section.
--
-- WHAT IT WAS: `product.unit VARCHAR(32) NOT NULL DEFAULT 'set'`, typed by
-- hand on the product form. Free text on a field that MULTIPLIES money is the
-- problem this fixes: a line quotes qty x unit price, so "套" and "台" typed
-- into two products by two people are two vocabularies nobody can group by,
-- and "seat" beside "席" is the same unit priced twice. The catalogue already
-- learned this lesson twice - category became product_type (0028), status
-- became product_status (0029) - and unit was the last string left.
--
-- SAME SHAPE AS THOSE TWO, deliberately: an anchor code, a display name, an
-- order, a per-workspace unique index, and a uuid join from product. It is a
-- THIRD independent vocabulary: it knows nothing of type and nothing of
-- status, and neither of them knows about it (owner's 2026-09-05 ruling,
-- extended to the unit).
--
-- Idempotent throughout.

-- --- the unit vocabulary ----------------------------------------------------
CREATE TABLE IF NOT EXISTS yucer_catalog.product_unit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                          -- [ref] isolation key
  unit_code    VARCHAR(32) NOT NULL,                   -- anchor, immutable
  name         VARCHAR(64) NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_product_unit_code UNIQUE (workspace_id, unit_code)
);

CREATE INDEX IF NOT EXISTS idx_product_unit_ws_sort
  ON yucer_catalog.product_unit (workspace_id, sort_order);

-- The shipped starter set, per workspace that already has products. Guarded on
-- a COMPLETELY EMPTY vocabulary so a tenant's deletions do not resurrect on a
-- re-run - the same guard 0029 uses, and for the same reason.
--
-- THE FIRST FIVE ARE THE ONES THE EXISTING DATA USES: 'set' is the column's
-- old default, and seat/day/month/year cover the subscription and service
-- lines a B2B catalogue quotes. The rest are here so a delivered tenant has a
-- usable list rather than an empty one.
INSERT INTO yucer_catalog.product_unit (workspace_id, unit_code, name, sort_order)
SELECT w.workspace_id, v.code, v.name, v.ord
  FROM (SELECT DISTINCT workspace_id FROM yucer_catalog.product) w
 CROSS JOIN (VALUES
   ('set',     '套',   1),
   ('piece',   '台',   2),
   ('seat',    '用户', 3),
   ('license', '许可', 4),
   ('year',    '年',   5),
   ('month',   '月',   6),
   ('day',     '人天', 7),
   ('hour',    '人时', 8),
   ('project', '项目', 9),
   ('package', '包',  10)
 ) AS v(code, name, ord)
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_catalog.product_unit u WHERE u.workspace_id = w.workspace_id
 )
ON CONFLICT (workspace_id, unit_code) DO NOTHING;

-- Whatever a workspace actually typed into the old free-text column, kept.
-- A code nobody recognises is still that workspace's unit, and dropping it
-- would silently change what its products are priced in.
INSERT INTO yucer_catalog.product_unit (workspace_id, unit_code, name, sort_order)
SELECT DISTINCT p.workspace_id, p.unit, p.unit, 99
  FROM yucer_catalog.product p
 WHERE p.unit IS NOT NULL
   AND p.unit <> ''
ON CONFLICT (workspace_id, unit_code) DO NOTHING;

-- --- product joins the vocabulary by uuid -----------------------------------
ALTER TABLE yucer_catalog.product
  ADD COLUMN IF NOT EXISTS unit_id UUID;

UPDATE yucer_catalog.product p
   SET unit_id = u.id
  FROM yucer_catalog.product_unit u
 WHERE p.unit_id IS NULL
   AND u.workspace_id = p.workspace_id
   AND u.unit_code = p.unit;

-- Guarded: NOT NULL only once every row is mapped. A fresh database sets it
-- immediately; a database with a row the mapping missed fails loudly here
-- rather than quietly keeping a nullable column - same as 0029.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yucer_catalog.product WHERE unit_id IS NULL) THEN
    ALTER TABLE yucer_catalog.product ALTER COLUMN unit_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_product_unit') THEN
    ALTER TABLE yucer_catalog.product
      ADD CONSTRAINT fk_product_unit FOREIGN KEY (unit_id)
      REFERENCES yucer_catalog.product_unit (id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_ws_unit
  ON yucer_catalog.product (workspace_id, unit_id);

-- The string leaves, exactly as category and status did before it.
ALTER TABLE yucer_catalog.product DROP COLUMN IF EXISTS unit;

-- --- grants -----------------------------------------------------------------
GRANT SELECT, INSERT, DELETE ON yucer_catalog.product_unit TO yucer_svc;
-- unit_code is the anchor - locked, like type_code and status_code.
GRANT UPDATE (name, sort_order, updated_at)
  ON yucer_catalog.product_unit TO yucer_svc;

-- product: `unit` leaves the writable set and `unit_id` takes its place.
-- Restated whole (REVOKE resets, then the full grant - the mirror's parser
-- understands this).
REVOKE UPDATE ON yucer_catalog.product FROM yucer_svc;
GRANT UPDATE (name, sort_order, type_id, status_id, unit_id, updated_at)
  ON yucer_catalog.product TO yucer_svc;
