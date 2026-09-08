-- 0036_market_division.sql - 大区 becomes data, and the tenant owns it.
--
-- Authority: owner, 2026-09-07 - "大区需要来自数据库，给平台补充大区划分数据，
-- 大屏读取该数据 ... 作为预置数据，容许租户修改", and "东部，西部，北部，南部，
-- 中部".
--
-- WHY IT COULD NOT STAY IN CODE. The screen grouped provinces by a TypeScript
-- constant. That makes the division a property of the BUILD rather than of the
-- workspace: two tenants who divide China differently - and they do, because a
-- 大区 is a sales structure and not a fact of geography - cannot both be right,
-- and neither can change it without a deploy. Preset here, editable after.
--
-- WHAT THIS IS NOT: it is NOT `account.region`, and it deliberately does not
-- touch it. That column carries the older six/seven-name grouping (华东 / 华北
-- / 西南 ...) and TERRITORY ROUTING matches on it - `territory.regions` is a
-- list of those same strings (incr/0017). Repointing accounts at the five
-- divisions would leave every configured territory matching nothing, and the
-- accounts under them would go silently unassigned. Migrating routing onto
-- these divisions is a separate decision with its own data change; until it is
-- taken, the two coexist and this one is what the screen reports on.
--
-- THE PROVINCE VOCABULARY IS THE SAME ONE incr/0035 constrains, so a mapping
-- row cannot name a province an account could never sit in.
--
-- Idempotent throughout.

-- --- 1. the divisions -------------------------------------------------------
CREATE TABLE IF NOT EXISTS yucer_core.market_division (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,                       -- [ref] isolation key
  division_code  VARCHAR(32) NOT NULL,                -- anchor, immutable
  name           VARCHAR(64) NOT NULL,                -- 东部 / 西部 / ...
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_market_division_code UNIQUE (workspace_id, division_code)
);

COMMENT ON TABLE yucer_core.market_division IS
  '大区 - the market divisions a workspace reports on. Preset with five; tenant-editable. Not territory routing ground; see incr/0036.';

CREATE INDEX IF NOT EXISTS idx_market_division_ws_sort
  ON yucer_core.market_division (workspace_id, sort_order);

-- --- 2. which province sits in which division -------------------------------
-- ONE DIVISION PER PROVINCE, enforced by the primary key rather than by the
-- application: a province in two divisions double-counts every figure rolled up
-- from it, and a national total that does not equal the sum of its parts is the
-- one failure this screen cannot survive.
CREATE TABLE IF NOT EXISTS yucer_core.market_division_province (
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  province      VARCHAR(32) NOT NULL,
  division_id   UUID NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_market_division_province PRIMARY KEY (workspace_id, province),
  CONSTRAINT fk_market_division_province_division
    FOREIGN KEY (division_id) REFERENCES yucer_core.market_division (id) ON DELETE RESTRICT,
  CONSTRAINT chk_market_division_province CHECK (
    province IN (
      '北京市','天津市','河北省','山西省','内蒙古自治区',
      '辽宁省','吉林省','黑龙江省',
      '上海市','江苏省','浙江省','安徽省','福建省','江西省','山东省','台湾省',
      '河南省','湖北省','湖南省',
      '广东省','广西壮族自治区','海南省','香港特别行政区','澳门特别行政区',
      '重庆市','四川省','贵州省','云南省','西藏自治区',
      '陕西省','甘肃省','青海省','宁夏回族自治区','新疆维吾尔自治区'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_market_division_province_div
  ON yucer_core.market_division_province (workspace_id, division_id);

-- --- 3. the preset ----------------------------------------------------------
-- Seeded for every workspace that already has an account, and GUARDED ON AN
-- EMPTY DIVISION SET: at migration time that is every workspace, and on a
-- re-run a tenant's own edits must not be overwritten or their deletions
-- resurrected.
INSERT INTO yucer_core.market_division (workspace_id, division_code, name, sort_order)
SELECT w.workspace_id, v.code, v.name, v.ord
  FROM (SELECT DISTINCT workspace_id FROM yucer_core.account) w
 CROSS JOIN (VALUES
   ('east',    '东部', 1),
   ('south',   '南部', 2),
   ('west',    '西部', 3),
   ('north',   '北部', 4),
   ('central', '中部', 5)
 ) AS v(code, name, ord)
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_core.market_division d WHERE d.workspace_id = w.workspace_id
 )
ON CONFLICT (workspace_id, division_code) DO NOTHING;

-- All 34 provincial-level divisions placed. EVERY province is placed, including
-- the quiet ones: an unplaced province cannot be drilled into and reads on the
-- map as though it were outside the country.
INSERT INTO yucer_core.market_division_province (workspace_id, province, division_id)
SELECT d.workspace_id, v.province, d.id
  FROM (VALUES
   -- 东部: the coast from 山东 south. 辽宁/北京/天津/河北 sit in 北部
   -- (owner, 2026-09-08) - the northern seaboard and the capital region read
   -- with 内蒙古 and the north-east, not with 上海 and 福建.
   ('山东省','east'),('江苏省','east'),('上海市','east'),('浙江省','east'),
   ('福建省','east'),('台湾省','east'),
   -- 南部
   ('广东省','south'),('广西壮族自治区','south'),('海南省','south'),
   ('香港特别行政区','south'),('澳门特别行政区','south'),
   -- 西部
   ('四川省','west'),('重庆市','west'),('贵州省','west'),('云南省','west'),
   ('西藏自治区','west'),('陕西省','west'),('甘肃省','west'),('青海省','west'),
   ('宁夏回族自治区','west'),('新疆维吾尔自治区','west'),
   -- 北部
   ('辽宁省','north'),('北京市','north'),('天津市','north'),('河北省','north'),
   ('内蒙古自治区','north'),('山西省','north'),('吉林省','north'),('黑龙江省','north'),
   -- 中部
   ('河南省','central'),('湖北省','central'),('湖南省','central'),
   ('安徽省','central'),('江西省','central')
  ) AS v(province, code)
  JOIN yucer_core.market_division d
    ON d.division_code = v.code
 WHERE NOT EXISTS (
   SELECT 1 FROM yucer_core.market_division_province m
    WHERE m.workspace_id = d.workspace_id AND m.province = v.province
 )
ON CONFLICT (workspace_id, province) DO NOTHING;

-- --- 4. the grants ----------------------------------------------------------
-- REQUIRED HERE, and their absence is silent until a write happens. 97 grants
-- SELECT/INSERT/DELETE over tables that existed when it ran, and 98 REVOKEs
-- UPDATE and re-grants column by column - neither can know about a table
-- created later, so an increment must leave the database correct on its own.
GRANT SELECT, INSERT, DELETE ON yucer_core.market_division TO yucer_svc;
REVOKE UPDATE ON yucer_core.market_division FROM yucer_svc;
-- The tenant may RENAME and REORDER a division. It may not rewrite the code:
-- that is the anchor the preset and every import upsert on, and a division
-- whose code changed is a new division wearing an old one's history.
GRANT UPDATE (name, sort_order, updated_at) ON yucer_core.market_division TO yucer_svc;

GRANT SELECT, INSERT, DELETE ON yucer_core.market_division_province TO yucer_svc;
REVOKE UPDATE ON yucer_core.market_division_province FROM yucer_svc;
-- Moving a province between divisions is the whole point of it being editable.
-- `province` itself is not updatable: it is half the primary key, and changing
-- it in place is a delete and an insert wearing one statement.
GRANT UPDATE (division_id, updated_at) ON yucer_core.market_division_province TO yucer_svc;
