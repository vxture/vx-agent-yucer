-- 0048_market_division_province.sql - the province is a column, not a prefix.
--
-- Authority: owner, 2026-09-09 - "行政区划代码可以单独列，全国有标准，不要 SN-
-- 前缀，这个 SN 可以单列。知道国家/省级即可，市县级不用".
--
-- 0043 made the frame the code's prefix: CHINA-EAST, and for a province
-- frame SN-GUANZHONG, SN-610100. The second half was wrong. An adcode is a
-- national standard and is not dressed up; the letters exist for countries
-- and provinces (CN, SN) and for nothing below them. So a division carries
-- its province in a column of its own, and a province-frame code is the
-- unit's adcode or the region's own word - 610100, GUANZHONG, YUBEI.
--
-- THE KEY GROWS TO MATCH. With no prefix, GUANZHONG under 陕西 and a
-- GUANZHONG a tenant typed under 中国市场 are two rows; the unique key is
-- (workspace, frame, province, code). scope_province is '' rather than NULL
-- outside a province frame so it can sit inside that key - NULLs never
-- collide, and CHINA-EAST twice must.
--
-- MIGRATION. Any province-frame row that already carries a prefix (there are
-- none in production - 0045 opened 陕西 this same day) has it moved into the
-- column: SN-GUANZHONG -> SN / GUANZHONG. The traditional carves' codes were
-- also re-worded (0047, unreleased): SC-SOUTH -> CHUANNAN. A row carved from
-- the old word keeps it; it is the tenant's row.
--
-- Idempotent throughout.

ALTER TABLE yucer_core.market_division
  ADD COLUMN IF NOT EXISTS scope_province VARCHAR(8) NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_market_division_frame_province') THEN
    ALTER TABLE yucer_core.market_division
      ADD CONSTRAINT chk_market_division_frame_province CHECK (
        (scope = 'province') = (scope_province <> '')
        AND (scope_province = '' OR scope_province ~ '^[A-Z]{2}$')
      );
  END IF;
END $$;

-- The code's shape by frame: CHINA-EAST / GLOBAL-EU carry their prefix; a
-- province code carries none and is an adcode or a word. The old CHECK goes
-- FIRST, or the migration below cannot write a prefix-less code.
ALTER TABLE yucer_core.market_division
  DROP CONSTRAINT IF EXISTS chk_market_division_code_frame;

UPDATE yucer_core.market_division
   SET scope_province = split_part(division_code, '-', 1),
       division_code = substr(division_code, position('-' in division_code) + 1),
       updated_at = now()
 WHERE scope = 'province' AND scope_province = '' AND division_code ~ '^[A-Z]{2}-';

ALTER TABLE yucer_core.market_division
  ADD CONSTRAINT chk_market_division_code_frame CHECK (
    (scope = 'china'    AND division_code ~ '^CHINA-[A-Z0-9][A-Z0-9_]*$')
    OR (scope = 'global'   AND division_code ~ '^GLOBAL-[A-Z0-9][A-Z0-9_]*$')
    OR (scope = 'province' AND division_code ~ '^[A-Z0-9][A-Z0-9_]*$')
  );

-- The anchor is the code WITHIN its frame now. 0036 declared the old key as
-- a table constraint, so it is dropped as one; the new one is too, and the
-- index it creates keeps the name the Prisma mirror expects.
ALTER TABLE yucer_core.market_division
  DROP CONSTRAINT IF EXISTS uidx_market_division_code;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uidx_market_division_code') THEN
    ALTER TABLE yucer_core.market_division
      ADD CONSTRAINT uidx_market_division_code UNIQUE (workspace_id, scope, scope_province, division_code);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_market_division_ws_frame
  ON yucer_core.market_division (workspace_id, scope, scope_province, sort_order);

-- Grants: scope_province is set when the row is carved and never rewritten,
-- like scope; INSERT is table-level already. The UPDATE set is unchanged:
-- name, sort_order, updated_at (restated whole, as 0043 did).
REVOKE UPDATE ON yucer_core.market_division FROM yucer_svc;
GRANT UPDATE (name, sort_order, updated_at) ON yucer_core.market_division TO yucer_svc;
