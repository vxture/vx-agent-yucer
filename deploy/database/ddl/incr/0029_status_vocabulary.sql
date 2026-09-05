-- 0029_status_vocabulary.sql - the status vocabulary, and joins move to uuid.
--
-- Authority: the owner's 2026-09-05 config rulings, third round:
--   1. the two catalogue configs are INDEPENDENT but mechanically IDENTICAL -
--      both vocabularies carry the same basic operations (add, delete, rename,
--      reorder, disable, enable);
--   2. internal association keys are UUIDs, and a uuid is never displayed.
--
-- TWO CHANGES FOLLOW:
--
-- A. product_status - the workspace's own status vocabulary. Each row anchors
--    a BEHAVIOR ('in_development' / 'active' / 'retired'), which is what every
--    rule reads: only active-behavior rows are quotable, retired-behavior rows
--    are the shelf. The three SYSTEM rows (status_code = the behavior itself)
--    are seeded per workspace and protected by the rule layer: never deleted,
--    and active/retired never disabled - a catalogue where nothing can be sold
--    or shelved is not a catalogue. Workspace-ADDED rows (a "预售", a "封存")
--    pick their behavior at creation and take the full operation set.
--    `name` stays nullable: null on a system row means "the default label".
--
-- B. product.type_id replaces product.category. 0028 associated products to
--    types BY CODE VALUE; the ruling says internal joins are uuid, so the
--    association becomes a real FK - RESTRICT, which also puts the database
--    behind the "cannot delete a type in use" rule. The business code stays
--    on product_type as the workspace's anchor; it is display and import
--    vocabulary, never a join key.
--
-- product.status DELIBERATELY REMAINS A CODE, not a uuid: it is a STATE
-- MACHINE value, the same species as pipeline.opportunity.stage - the code IS
-- the semantic state the transition rules compute on, and this repo's state
-- machines all carry codes. The CHECK from 0028 is dropped because added
-- statuses mint new codes; validity is the rule layer's (the vocabulary is
-- workspace-scoped, a CHECK cannot see it).
--
-- Idempotent throughout.

-- --- A. the status vocabulary ------------------------------------------------
CREATE TABLE IF NOT EXISTS yucer_catalog.product_status (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                          -- [ref] isolation key
  status_code  VARCHAR(32) NOT NULL,                   -- anchor, immutable
  name         VARCHAR(64),                            -- null = default label
  behavior     VARCHAR(16) NOT NULL                    -- what the rules read
                 CONSTRAINT chk_product_status_behavior
                 CHECK (behavior IN ('in_development', 'active', 'retired')),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  status       VARCHAR(16) NOT NULL DEFAULT 'active'
                 CONSTRAINT chk_product_status_status
                 CHECK (status IN ('active', 'retired')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_product_status_code UNIQUE (workspace_id, status_code)
);

CREATE INDEX IF NOT EXISTS idx_product_status_ws_sort
  ON yucer_catalog.product_status (workspace_id, sort_order);

-- Seed the three system rows for every workspace that already has products.
-- (A fresh workspace gets them lazily from the service on first read/write.)
INSERT INTO yucer_catalog.product_status (workspace_id, status_code, behavior, sort_order)
SELECT w.workspace_id, v.code, v.code, v.ord
  FROM (SELECT DISTINCT workspace_id FROM yucer_catalog.product) w
 CROSS JOIN (VALUES ('in_development', 1), ('active', 2), ('retired', 3)) AS v(code, ord)
ON CONFLICT (workspace_id, status_code) DO NOTHING;

-- --- B. the type association becomes a uuid ---------------------------------
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

-- --- product.status: codes are now the vocabulary's -------------------------
ALTER TABLE yucer_catalog.product
  DROP CONSTRAINT IF EXISTS chk_product_status;

-- --- grants -----------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON yucer_catalog.product_status TO yucer_svc;
REVOKE UPDATE ON yucer_catalog.product_status FROM yucer_svc;
-- status_code is the anchor; behavior is what the rules read - a behavior
-- that could drift after creation would let a quotable status silently stop
-- meaning "quotable".
GRANT UPDATE (name, sort_order, status, updated_at)
  ON yucer_catalog.product_status TO yucer_svc;

-- product: category leaves the writable set, type_id joins it. Restated whole
-- (REVOKE resets, then the full grant - the mirror's parser understands this).
REVOKE UPDATE ON yucer_catalog.product FROM yucer_svc;
GRANT UPDATE (name, unit, status, sort_order, type_id, updated_at)
  ON yucer_catalog.product TO yucer_svc;
