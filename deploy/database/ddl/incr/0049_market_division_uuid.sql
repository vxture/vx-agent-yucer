-- 0049_market_division_uuid.sql - a region's members relate to admin_division
-- by its id.
--
-- Authority: owner, 2026-09-09 - "区划代码不能作为系统内部的关联键，内部关联
-- 已经统一过，需要库表的 uuid，没有 uuid 的给补齐".
--
-- 0045 pointed market_division_member at admin_division by (level, code) -
-- the standard's own key, which is fine to READ by and wrong to RELATE by:
-- every other relation in this database is a uuid, and a natural key in one
-- join is the one a rename or a re-issued code breaks. 0036's province table
-- related by NAME, the same way. Both get the row's id; the natural columns
-- the id replaces are dropped where nothing else reads them (member), and
-- kept beside it where something does (province: account.province and the
-- map are keyed by that name, and chk_market_division_province guards it).
--
-- Idempotent throughout - the backfill only runs while the old columns exist.

-- --- 1. market_division_member: the id replaces (level, code) --------------
ALTER TABLE yucer_core.market_division_member
  ADD COLUMN IF NOT EXISTS admin_division_id UUID;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'yucer_core' AND table_name = 'market_division_member'
                AND column_name = 'member_code') THEN
    UPDATE yucer_core.market_division_member m
       SET admin_division_id = a.id
      FROM yucer_ref.admin_division a
     WHERE a.level = m.member_level AND a.code = m.member_code
       AND m.admin_division_id IS NULL;
    -- Every row had a place by the old foreign key; a row that still has
    -- none would be one the key never held, and there is no such row.
    ALTER TABLE yucer_core.market_division_member DROP CONSTRAINT IF EXISTS pk_market_division_member;
    ALTER TABLE yucer_core.market_division_member DROP CONSTRAINT IF EXISTS fk_market_division_member_place;
    ALTER TABLE yucer_core.market_division_member DROP CONSTRAINT IF EXISTS chk_market_division_member_level;
    ALTER TABLE yucer_core.market_division_member DROP COLUMN member_level;
    ALTER TABLE yucer_core.market_division_member DROP COLUMN member_code;
  END IF;
END $$;

ALTER TABLE yucer_core.market_division_member
  ALTER COLUMN admin_division_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_market_division_member') THEN
    ALTER TABLE yucer_core.market_division_member
      ADD CONSTRAINT pk_market_division_member PRIMARY KEY (workspace_id, admin_division_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_market_division_member_place') THEN
    ALTER TABLE yucer_core.market_division_member
      ADD CONSTRAINT fk_market_division_member_place
      FOREIGN KEY (admin_division_id) REFERENCES yucer_ref.admin_division (id) ON DELETE RESTRICT;
  END IF;
END $$;

-- --- 2. market_division_province: the id joins the name --------------------
ALTER TABLE yucer_core.market_division_province
  ADD COLUMN IF NOT EXISTS admin_division_id UUID;

UPDATE yucer_core.market_division_province p
   SET admin_division_id = a.id
  FROM yucer_ref.admin_division a
 WHERE a.level = 3 AND a.name_zh = p.province
   AND p.admin_division_id IS NULL;

ALTER TABLE yucer_core.market_division_province
  ALTER COLUMN admin_division_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_market_division_province_place') THEN
    ALTER TABLE yucer_core.market_division_province
      ADD CONSTRAINT fk_market_division_province_place
      FOREIGN KEY (admin_division_id) REFERENCES yucer_ref.admin_division (id) ON DELETE RESTRICT;
  END IF;
  -- One row per place, by id as well as by name.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uidx_market_division_province_place') THEN
    ALTER TABLE yucer_core.market_division_province
      ADD CONSTRAINT uidx_market_division_province_place UNIQUE (workspace_id, admin_division_id);
  END IF;
END $$;

-- Grants: the new columns are set when a row is placed and never rewritten -
-- moving a place is a delete and an insert wearing one statement, as before.
-- INSERT is table-level already; the UPDATE sets are restated whole.
REVOKE UPDATE ON yucer_core.market_division_member FROM yucer_svc;
GRANT UPDATE (division_id, updated_at) ON yucer_core.market_division_member TO yucer_svc;
REVOKE UPDATE ON yucer_core.market_division_province FROM yucer_svc;
GRANT UPDATE (division_id, updated_at) ON yucer_core.market_division_province TO yucer_svc;
