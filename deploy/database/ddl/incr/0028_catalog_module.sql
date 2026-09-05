-- 0028_catalog_module.sql - the catalogue becomes a governed module.
--
-- Authority: the owner's catalogue ruling of 2026-09-05 - the module page
-- shows active and retired rosters with per-row operations (edit, delete,
-- activate, retire, reorder), the type and status vocabularies get a CONFIG
-- surface of their own, and creation shares a page with ordering.
--
-- Three schema facts back that surface:
--
-- 1. MANUAL ORDER. A catalogue is presented to customers in an order somebody
--    chose - flagship first - and no derivable ordering (name, code, date)
--    knows it. sort_order is per workspace, dense from 1 by product_code at
--    backfill time; the move operation swaps neighbours.
--
-- 2. A THIRD STATUS. The owner's header counts "在售 / 在研": a product being
--    BUILT is real (it appears in plans and conversations) but must not be
--    quotable. in_development is a birth state - the lifecycle rule in the
--    domain only permits entering it at creation.
--
-- 3. TYPES ARE A MANAGED VOCABULARY, not a free string. `category` was
--    free text, and free text splits every report that groups by it. The
--    product_type table is the workspace's own list - code-anchored like every
--    vocabulary here (segment_code, product_code) - and `product.category`
--    now informally references type_code. No FK: a type is retired, never
--    deleted, and products carrying a retired type still render (the config
--    page shows the count so somebody can migrate them deliberately).
--
-- STATUSES ARE NOT A TABLE, deliberately. A status carries BEHAVIOUR - only
-- `active` is quotable; pricing, solutions and lines all key off it - so a
-- workspace-invented status would be a state the rules cannot interpret. The
-- config page displays the three system statuses with their meaning; it edits
-- only the type vocabulary.
--
-- Idempotent throughout.

-- --- 1. manual order --------------------------------------------------------
ALTER TABLE yucer_catalog.product
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Dense from 1 within each workspace, seeded by code so the backfill is
-- deterministic. Guarded on "everything still zero" so a re-run cannot shuffle
-- an order somebody has already arranged.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yucer_catalog.product WHERE sort_order <> 0) THEN
    UPDATE yucer_catalog.product p
       SET sort_order = ranked.rn
      FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY product_code) AS rn
          FROM yucer_catalog.product
      ) ranked
     WHERE ranked.id = p.id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_ws_sort
  ON yucer_catalog.product (workspace_id, sort_order);

-- --- 2. the third status ----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chk_product_status'
       AND pg_get_constraintdef(oid) NOT LIKE '%in_development%'
  ) THEN
    ALTER TABLE yucer_catalog.product DROP CONSTRAINT chk_product_status;
    ALTER TABLE yucer_catalog.product
      ADD CONSTRAINT chk_product_status
      CHECK (status IN ('in_development', 'active', 'retired'));
  END IF;
END $$;

-- --- 3. the type vocabulary -------------------------------------------------
CREATE TABLE IF NOT EXISTS yucer_catalog.product_type (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                          -- [ref] isolation key
  type_code    VARCHAR(64) NOT NULL,                   -- anchor, immutable
  name         VARCHAR(64) NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  status       VARCHAR(16) NOT NULL DEFAULT 'active'
                 CONSTRAINT chk_product_type_status
                 CHECK (status IN ('active', 'retired')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_product_type_code UNIQUE (workspace_id, type_code)
);

CREATE INDEX IF NOT EXISTS idx_product_type_ws_sort
  ON yucer_catalog.product_type (workspace_id, sort_order);

-- Backfill: every distinct category already on products becomes a type, code =
-- the value itself (they are short Chinese words; inventing latin codes for
-- them would create a mapping nobody asked for). Ordered by first appearance
-- in code order. Guarded per-row by the unique index + ON CONFLICT.
INSERT INTO yucer_catalog.product_type (workspace_id, type_code, name, sort_order)
SELECT workspace_id, category, category,
       ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY MIN(product_code))
  FROM yucer_catalog.product
 WHERE category IS NOT NULL AND category <> ''
 GROUP BY workspace_id, category
ON CONFLICT (workspace_id, type_code) DO NOTHING;

-- --- grants -----------------------------------------------------------------
-- A table created by an increment has NO privileges (97 ran before it);
-- check-incr-grants.mjs enforces that the grant lives here.
GRANT SELECT, INSERT, UPDATE, DELETE ON yucer_catalog.product_type TO yucer_svc;
REVOKE UPDATE ON yucer_catalog.product_type FROM yucer_svc;
-- type_code is the anchor products point at by value - renaming it would break
-- them silently, exactly the segment_code argument.
GRANT UPDATE (name, sort_order, status, updated_at)
  ON yucer_catalog.product_type TO yucer_svc;

-- product: sort_order joins the writable set. Restated in full because the
-- grant lives in 0007 and grants accumulate - the REVOKE resets before the
-- wider grant lands (the mirror's parser understands this since #187's fix).
REVOKE UPDATE ON yucer_catalog.product FROM yucer_svc;
GRANT UPDATE (name, category, unit, status, sort_order, updated_at)
  ON yucer_catalog.product TO yucer_svc;
