-- 0035_account_province.sql - a customer sits in a province, not only in a 大区.
--
-- Authority: owner, 2026-09-07 - 接入平台，并大规模扩展样本数据, for the national
-- situation screen. The screen colours a province-level map of China; the model
-- had no province.
--
-- WHY NOT REUSE `region`. It looks like the obvious home and it is the wrong
-- one. `region` holds a 大区 - 华东 / 西南 / 东北 - and it is what TERRITORY
-- ROUTING matches on (`territory.regions` is a list of those same seven names,
-- incr/0017). Writing 江苏省 into that column would place the account on ground
-- no territory covers, so the account would silently become unassignable. The
-- two are different granularities of the same fact and both have to exist.
--
-- 大区 IS DERIVABLE FROM PROVINCE and is still stored, deliberately. Deriving it
-- on read would put the province->大区 table in application code, where the
-- routing rule cannot see it, and would make every territory query depend on a
-- mapping that lives outside the database. Storing both costs one column and
-- keeps routing answerable in SQL.
--
-- THE CHECK IS THE POINT. A free-text province is a column that reports
-- "江苏" and "江苏省" as two different places, and a national roll-up that
-- silently drops a province is worse than one that refuses the write. The
-- vocabulary is the 34 provincial-level divisions, spelled as the national
-- statistical bureau spells them - the same strings the map's own geometry is
-- keyed by, so a value that passes this CHECK is guaranteed to find a shape.
--
-- Idempotent throughout.

-- --- 1. the column ----------------------------------------------------------
ALTER TABLE yucer_core.account
  ADD COLUMN IF NOT EXISTS province VARCHAR(32);

COMMENT ON COLUMN yucer_core.account.province IS
  'Provincial-level division, e.g. 江苏省. NULL = not recorded. Rolls up to region (大区); see incr/0035.';

-- --- 2. the vocabulary ------------------------------------------------------
-- NULL IS ALWAYS ALLOWED. Most prospects are a name somebody typed; demanding a
-- province at creation would push people to pick one at random, which is worse
-- than not knowing - a guessed province is indistinguishable from a real one
-- once it is in the column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_account_province'
      AND conrelid = 'yucer_core.account'::regclass
  ) THEN
    ALTER TABLE yucer_core.account
      ADD CONSTRAINT chk_account_province CHECK (
        province IS NULL OR province IN (
          '北京市','天津市','河北省','山西省','内蒙古自治区',
          '辽宁省','吉林省','黑龙江省',
          '上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省','台湾省',
          '河南省','湖北省','湖南省',
          '广东省','广西壮族自治区','海南省','香港特别行政区','澳门特别行政区',
          '重庆市','四川省','贵州省','云南省','西藏自治区',
          '陕西省','甘肃省','青海省','宁夏回族自治区','新疆维吾尔自治区'
        )
      );
  END IF;
END $$;

-- --- 3. the roll-up index ---------------------------------------------------
-- The screen's every query is "group by province within one workspace", and it
-- runs on every drill-down. Without this it is a sequential scan per click.
CREATE INDEX IF NOT EXISTS idx_account_ws_province
  ON yucer_core.account (workspace_id, province);

-- --- 4. the write grant -----------------------------------------------------
-- REQUIRED, and its absence is silent until a write happens: 98_column_locks
-- REVOKEs UPDATE on this table and re-grants it column by column, so a column
-- added later is readable, insertable and NOT updatable. Repeated here because
-- an increment must leave the database correct on its own; 98 carries the same
-- line for a database rebuilt from scratch.
GRANT UPDATE (province) ON yucer_core.account TO yucer_svc;
