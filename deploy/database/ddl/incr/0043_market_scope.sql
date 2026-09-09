-- 0043_market_scope.sql - 市场范围 becomes the frame a workspace carves inside.
--
-- Authority: owner, 2026-09-09 - "市场范围，选择是全球市场，中国市场，（省级）市场，
-- 这是大区域的框架 ... 区域设定，在此范围内设定区域 ... 区域代码需要更新，
-- 按照 CHINA-EAST 模式编码，需要全面更新 seed 数据".
--
-- WHAT WAS MISSING. incr/0036 gave a workspace its 大区 and the provinces in
-- them, and assumed the country: every division was made of Chinese provinces
-- because that was the only ground the table could hold. A tenant selling
-- across borders, or one that is a single province's distributor and carves
-- that province by city, had no frame to say so - the same table would have
-- had to hold countries, provinces and cities as if they were one thing.
--
-- SO THE FRAME IS ITS OWN ROW, one per workspace: 全球市场 (regions are made of
-- countries), 中国市场 (of provinces - the default, and every workspace today),
-- or 省级市场 (one province, regions made of its cities). The division carries
-- which frame it was carved in, and its CODE says so too - CHINA-EAST - because
-- a code is what an import matches on, and "EAST" alone cannot tell 华东 from
-- the eastern half of a province.
--
-- ONLY 中国市场 IS OPEN THIS INCREMENT. The other two frames are stored,
-- constrained and selectable by the data, and the members they need - the
-- ISO country list and the cities under each province - already sit in
-- yucer_ref.admin_division (incr/0038). What does not exist yet is the member
-- table that points a division at those rows instead of at the 34 province
-- NAMES incr/0036 constrained; that is the next increment, and until it lands
-- the interface offers the two frames as 未建 rather than pretending.
--
-- Idempotent throughout.

-- --- 1. the frame -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS yucer_core.market_scope (
  workspace_id UUID PRIMARY KEY,                       -- [ref] isolation key
  -- global | china | province
  scope_kind   VARCHAR(16) NOT NULL DEFAULT 'china',
  -- The province, as its two GB/T 2260 letters (GD), and ONLY for a
  -- province-level frame; the other two kinds have nothing to name. Not
  -- `scope_code`: `_code` is this schema's word for an anchor, and this is a
  -- setting the tenant changes.
  scope_province VARCHAR(8),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_market_scope_kind
    CHECK (scope_kind IN ('global', 'china', 'province')),
  -- A province frame names its province; the others must not - a stray code
  -- on a china frame would be a setting nothing reads and somebody trusts.
  CONSTRAINT chk_market_scope_code
    CHECK ((scope_kind = 'province') = (scope_province IS NOT NULL)),
  CONSTRAINT chk_market_scope_code_shape
    CHECK (scope_province IS NULL OR scope_province ~ '^[A-Z]{2}$')
);

COMMENT ON TABLE yucer_core.market_scope IS
  '市场范围 - the frame a workspace carves its market inside: global / china / one province. One row per workspace; see incr/0043.';

-- Every workspace that already carves gets the frame it was carving in.
INSERT INTO yucer_core.market_scope (workspace_id, scope_kind)
SELECT DISTINCT workspace_id, 'china' FROM yucer_core.market_division
ON CONFLICT (workspace_id) DO NOTHING;

-- --- 2. the division knows its frame, and its code says so ----------------------
ALTER TABLE yucer_core.market_division
  ADD COLUMN IF NOT EXISTS scope VARCHAR(16) NOT NULL DEFAULT 'china';

-- THE CODE MIGRATION. east -> CHINA-EAST, for every row not already in the
-- shape. Done here as superuser DDL because the service role deliberately may
-- not touch division_code - it is the anchor - and this is the one time the
-- anchor changes: not a tenant renaming its division, but the product changing
-- what a code is.
UPDATE yucer_core.market_division
   SET division_code = 'CHINA-' || upper(division_code),
       updated_at = now()
 WHERE scope = 'china'
   AND division_code !~ '^[A-Z]+-';

-- The frame's prefix IS the code's prefix, and the database says so rather than
-- the form: a china division is CHINA-*, a global one GLOBAL-*, a province one
-- carries that province's two letters (GD-*). One place a code can come from,
-- and no import can land CHINA-EAST inside a province frame.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_market_division_code_frame') THEN
    ALTER TABLE yucer_core.market_division
      ADD CONSTRAINT chk_market_division_code_frame CHECK (
        division_code ~ '^[A-Z]{2,8}-[A-Z][A-Z0-9_]*$'
        AND (
          (scope = 'china'  AND division_code LIKE 'CHINA-%')
          OR (scope = 'global' AND division_code LIKE 'GLOBAL-%')
          OR (scope = 'province')
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_market_division_scope') THEN
    ALTER TABLE yucer_core.market_division
      ADD CONSTRAINT chk_market_division_scope
      CHECK (scope IN ('global', 'china', 'province'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_market_division_ws_scope
  ON yucer_core.market_division (workspace_id, scope, sort_order);

-- --- 3. grants ------------------------------------------------------------------
-- The frame: read, create on first contact, change the kind and the province.
-- No DELETE - a workspace always has a frame, and "back to default" is an
-- update to china.
GRANT SELECT, INSERT ON yucer_core.market_scope TO yucer_svc;
GRANT UPDATE (scope_kind, scope_province, updated_at) ON yucer_core.market_scope TO yucer_svc;

-- The division's writable set is UNCHANGED: name, sort_order, updated_at.
-- `scope` is not in it, deliberately - a division's frame is decided when it
-- is carved, and its members are level-bound to that frame; moving it would be
-- a delete and a create wearing one statement. Restated whole so this
-- increment leaves the grant correct on its own.
REVOKE UPDATE ON yucer_core.market_division FROM yucer_svc;
GRANT UPDATE (name, sort_order, updated_at) ON yucer_core.market_division TO yucer_svc;
