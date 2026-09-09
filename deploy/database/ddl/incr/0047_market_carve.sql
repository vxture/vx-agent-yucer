-- 0047_market_carve.sql - 预置方案 (the shipped carves) become reference rows.
--
-- Authority: owner, 2026-09-09 - "注意全面数据库表，不容许代码写死". The carves a
-- workspace can start from - 五分法 / 七分法 for 中国市场, 陕西三分法 and 各市独立
-- for a province - were TypeScript constants the service imported from. A
-- carve is data: which regions, which members in each. It lives here now, in
-- yucer_ref beside the divisions it is made of, and the service READS it.
--
-- THREE TABLES, ONE CARVE. A carve names its frame (kind, and the province for
-- a province frame); its divisions carry the code and name a workspace gets
-- when it adopts the carve; its members say which unit sits in which
-- division. EVERY RELATION IS BY UUID (owner, 2026-09-09: 区划代码不能作为系统
-- 内部的关联键，内部关联已经统一过，需要库表的 uuid): a member points at
-- yucer_ref.admin_division.id and at its division's id, a division at its
-- carve's id. carve_key and division_code are business anchors - what a
-- person reads and an import matches on - and nothing joins on them. The
-- natural keys the seed is written in (a province's name, a unit's adcode)
-- are resolved to ids HERE, once, by joining the reference table.
--
-- TWO KINDS OF SEED. The typed carves - the two national ones and the six
-- provincial ones somebody in the province would recognise - are VALUES
-- below. 各市独立 (one region per unit, owner: 几个市几个区域) is DERIVED here in
-- SQL from yucer_ref.admin_division for every provincial-level division with
-- ground below it: a province by its prefecture-level units, a municipality
-- by its districts and counties. Nothing in code lists a province.
--
-- READ-ONLY to the service role, like admin_division: a carve is what the
-- product ships, and a workspace that wants a different one edits its own
-- divisions after adopting the nearest.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_ref.market_carve (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The business anchor: five / seven / shaanxi-three / sn-units. Unique,
  -- read by people and by the import; joined on by nothing.
  carve_key      VARCHAR(32) NOT NULL,
  -- global | china | province - the frame the carve cuts.
  scope_kind     VARCHAR(16) NOT NULL,
  -- The province's two letters, for a province frame only (same pairing 0043
  -- CHECKs on market_scope).
  scope_province VARCHAR(8),
  -- 五分法 / 陕西三分法 / 陕西各市独立 - what the reset dialog and the preset
  -- select print.
  name           VARCHAR(64) NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uidx_market_carve_key UNIQUE (carve_key),
  CONSTRAINT chk_market_carve_kind CHECK (scope_kind IN ('global', 'china', 'province')),
  CONSTRAINT chk_market_carve_province
    CHECK ((scope_kind = 'province') = (scope_province IS NOT NULL)),
  CONSTRAINT chk_market_carve_province_shape
    CHECK (scope_province IS NULL OR scope_province ~ '^[A-Z]{2}$')
);

CREATE TABLE IF NOT EXISTS yucer_ref.market_carve_division (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carve_id      UUID NOT NULL REFERENCES yucer_ref.market_carve (id) ON DELETE CASCADE,
  -- The code a workspace's division gets on adoption - CHINA-EAST, or under a
  -- province frame the unit's bare adcode (610100) or the region's own word
  -- (GUANZHONG): no province prefix (owner - 行政区划代码全国有标准, 不要 SN-
  -- 前缀; the province is scope_province). Same shape 0048 CHECKs on
  -- market_division, so an adoption cannot land a code the workspace table
  -- refuses. Unique WITHIN its carve; an anchor, not a key.
  division_code VARCHAR(32) NOT NULL,
  name          VARCHAR(64) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uidx_market_carve_division_code UNIQUE (carve_id, division_code),
  CONSTRAINT chk_market_carve_division_code CHECK (division_code ~ '^([A-Z]{2,8}-)?[A-Z0-9][A-Z0-9_]*$')
);

CREATE TABLE IF NOT EXISTS yucer_ref.market_carve_member (
  carve_id          UUID NOT NULL REFERENCES yucer_ref.market_carve (id) ON DELETE CASCADE,
  -- The place: a province (level 3) under 中国市场, a unit (level 4 or 5)
  -- under 省级市场. The row itself, by id.
  admin_division_id UUID NOT NULL REFERENCES yucer_ref.admin_division (id) ON DELETE RESTRICT,
  division_id       UUID NOT NULL REFERENCES yucer_ref.market_carve_division (id) ON DELETE CASCADE,
  -- A place sits in AT MOST ONE division of a carve: the same invariant the
  -- workspace tables enforce, so adopting a carve cannot violate it.
  CONSTRAINT pk_market_carve_member PRIMARY KEY (carve_id, admin_division_id)
);

CREATE INDEX IF NOT EXISTS idx_market_carve_scope
  ON yucer_ref.market_carve (scope_kind, scope_province, sort_order);
CREATE INDEX IF NOT EXISTS idx_market_carve_division_carve
  ON yucer_ref.market_carve_division (carve_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_market_carve_member_division
  ON yucer_ref.market_carve_member (division_id);

COMMENT ON TABLE yucer_ref.market_carve IS
  '预置方案 - the shipped carves a workspace adopts as a start: which frame, which regions, which members. Reference data; see incr/0047.';

-- --- 1. the typed carves ---------------------------------------------------
-- 五分法 and 七分法 are the two standard ways to carve the country; the six
-- provincial ones are the reading everybody in that province recognises (the
-- owner names the rest as they come). Provinces with none carry only the
-- derived 各市独立 below. Written in the keys a person can check - a carve
-- key, a code, a province name or an adcode - and resolved to ids by joins.
INSERT INTO yucer_ref.market_carve (carve_key, scope_kind, scope_province, name, sort_order) VALUES
  ('five', 'china', NULL, '五分法', 1),
  ('seven', 'china', NULL, '七分法', 2),
  ('jiangsu-three', 'province', 'JS', '江苏三分', 3),
  ('henan-five', 'province', 'HA', '河南五分法', 4),
  ('hunan-four', 'province', 'HN', '湖南四大板块', 5),
  ('guangdong-four', 'province', 'GD', '广东四分', 6),
  ('sichuan-five', 'province', 'SC', '四川五区', 7),
  ('shaanxi-three', 'province', 'SN', '陕西三分法', 8)
ON CONFLICT (carve_key) DO NOTHING;

INSERT INTO yucer_ref.market_carve_division (carve_id, division_code, name, sort_order)
SELECT c.id, v.code, v.name, v.ord
  FROM (VALUES
  ('five', 'CHINA-EAST', '东部', 1),
  ('five', 'CHINA-SOUTH', '南部', 2),
  ('five', 'CHINA-WEST', '西部', 3),
  ('five', 'CHINA-NORTH', '北部', 4),
  ('five', 'CHINA-CENTRAL', '中部', 5),
  ('seven', 'CHINA-NORTH', '华北', 1),
  ('seven', 'CHINA-NORTHEAST', '东北', 2),
  ('seven', 'CHINA-EAST', '华东', 3),
  ('seven', 'CHINA-CENTRAL', '华中', 4),
  ('seven', 'CHINA-SOUTH', '华南', 5),
  ('seven', 'CHINA-SOUTHWEST', '西南', 6),
  ('seven', 'CHINA-NORTHWEST', '西北', 7),
  ('jiangsu-three', 'SUNAN', '苏南', 1),
  ('jiangsu-three', 'SUZHONG', '苏中', 2),
  ('jiangsu-three', 'SUBEI', '苏北', 3),
  ('henan-five', 'YUZHONG', '豫中', 1),
  ('henan-five', 'YUBEI', '豫北', 2),
  ('henan-five', 'YUDONG', '豫东', 3),
  ('henan-five', 'YUXI', '豫西', 4),
  ('henan-five', 'YUNAN', '豫南', 5),
  ('hunan-four', 'CHANGZHUTAN', '长株潭', 1),
  ('hunan-four', 'DONGTINGHU', '洞庭湖', 2),
  ('hunan-four', 'XIANGNAN', '湘南', 3),
  ('hunan-four', 'DAXIANGXI', '大湘西', 4),
  ('guangdong-four', 'ZHUSANJIAO', '珠三角', 1),
  ('guangdong-four', 'YUEDONG', '粤东', 2),
  ('guangdong-four', 'YUEXI', '粤西', 3),
  ('guangdong-four', 'YUEBEI', '粤北', 4),
  ('sichuan-five', 'CHENGDUPINGYUAN', '成都平原', 1),
  ('sichuan-five', 'CHUANNAN', '川南', 2),
  ('sichuan-five', 'CHUANDONGBEI', '川东北', 3),
  ('sichuan-five', 'PANXI', '攀西', 4),
  ('sichuan-five', 'CHUANXIBEI', '川西北', 5),
  ('shaanxi-three', 'GUANZHONG', '关中', 1),
  ('shaanxi-three', 'SHAANBEI', '陕北', 2),
  ('shaanxi-three', 'SHAANNAN', '陕南', 3)
  ) AS v(carve_key, code, name, ord)
  JOIN yucer_ref.market_carve c ON c.carve_key = v.carve_key
ON CONFLICT (carve_id, division_code) DO NOTHING;

-- A china carve's member is a province NAME (level 3); a province carve's
-- is a unit ADCODE (level 4 or 5). Both resolve to one admin_division row.
INSERT INTO yucer_ref.market_carve_member (carve_id, admin_division_id, division_id)
SELECT c.id, a.id, d.id
  FROM (VALUES
  ('five', '山东省', 'CHINA-EAST'),
  ('five', '江苏省', 'CHINA-EAST'),
  ('five', '上海市', 'CHINA-EAST'),
  ('five', '浙江省', 'CHINA-EAST'),
  ('five', '福建省', 'CHINA-EAST'),
  ('five', '台湾省', 'CHINA-EAST'),
  ('five', '广东省', 'CHINA-SOUTH'),
  ('five', '广西壮族自治区', 'CHINA-SOUTH'),
  ('five', '海南省', 'CHINA-SOUTH'),
  ('five', '香港特别行政区', 'CHINA-SOUTH'),
  ('five', '澳门特别行政区', 'CHINA-SOUTH'),
  ('five', '四川省', 'CHINA-WEST'),
  ('five', '重庆市', 'CHINA-WEST'),
  ('five', '贵州省', 'CHINA-WEST'),
  ('five', '云南省', 'CHINA-WEST'),
  ('five', '西藏自治区', 'CHINA-WEST'),
  ('five', '陕西省', 'CHINA-WEST'),
  ('five', '甘肃省', 'CHINA-WEST'),
  ('five', '青海省', 'CHINA-WEST'),
  ('five', '宁夏回族自治区', 'CHINA-WEST'),
  ('five', '新疆维吾尔自治区', 'CHINA-WEST'),
  ('five', '辽宁省', 'CHINA-NORTH'),
  ('five', '北京市', 'CHINA-NORTH'),
  ('five', '天津市', 'CHINA-NORTH'),
  ('five', '河北省', 'CHINA-NORTH'),
  ('five', '内蒙古自治区', 'CHINA-NORTH'),
  ('five', '山西省', 'CHINA-NORTH'),
  ('five', '吉林省', 'CHINA-NORTH'),
  ('five', '黑龙江省', 'CHINA-NORTH'),
  ('five', '河南省', 'CHINA-CENTRAL'),
  ('five', '湖北省', 'CHINA-CENTRAL'),
  ('five', '湖南省', 'CHINA-CENTRAL'),
  ('five', '安徽省', 'CHINA-CENTRAL'),
  ('five', '江西省', 'CHINA-CENTRAL'),
  ('seven', '北京市', 'CHINA-NORTH'),
  ('seven', '天津市', 'CHINA-NORTH'),
  ('seven', '河北省', 'CHINA-NORTH'),
  ('seven', '山西省', 'CHINA-NORTH'),
  ('seven', '内蒙古自治区', 'CHINA-NORTH'),
  ('seven', '辽宁省', 'CHINA-NORTHEAST'),
  ('seven', '吉林省', 'CHINA-NORTHEAST'),
  ('seven', '黑龙江省', 'CHINA-NORTHEAST'),
  ('seven', '上海市', 'CHINA-EAST'),
  ('seven', '江苏省', 'CHINA-EAST'),
  ('seven', '浙江省', 'CHINA-EAST'),
  ('seven', '安徽省', 'CHINA-EAST'),
  ('seven', '福建省', 'CHINA-EAST'),
  ('seven', '江西省', 'CHINA-EAST'),
  ('seven', '山东省', 'CHINA-EAST'),
  ('seven', '台湾省', 'CHINA-EAST'),
  ('seven', '河南省', 'CHINA-CENTRAL'),
  ('seven', '湖北省', 'CHINA-CENTRAL'),
  ('seven', '湖南省', 'CHINA-CENTRAL'),
  ('seven', '广东省', 'CHINA-SOUTH'),
  ('seven', '广西壮族自治区', 'CHINA-SOUTH'),
  ('seven', '海南省', 'CHINA-SOUTH'),
  ('seven', '香港特别行政区', 'CHINA-SOUTH'),
  ('seven', '澳门特别行政区', 'CHINA-SOUTH'),
  ('seven', '重庆市', 'CHINA-SOUTHWEST'),
  ('seven', '四川省', 'CHINA-SOUTHWEST'),
  ('seven', '贵州省', 'CHINA-SOUTHWEST'),
  ('seven', '云南省', 'CHINA-SOUTHWEST'),
  ('seven', '西藏自治区', 'CHINA-SOUTHWEST'),
  ('seven', '陕西省', 'CHINA-NORTHWEST'),
  ('seven', '甘肃省', 'CHINA-NORTHWEST'),
  ('seven', '青海省', 'CHINA-NORTHWEST'),
  ('seven', '宁夏回族自治区', 'CHINA-NORTHWEST'),
  ('seven', '新疆维吾尔自治区', 'CHINA-NORTHWEST'),
  ('jiangsu-three', '320100', 'SUNAN'),
  ('jiangsu-three', '320200', 'SUNAN'),
  ('jiangsu-three', '320300', 'SUBEI'),
  ('jiangsu-three', '320400', 'SUNAN'),
  ('jiangsu-three', '320500', 'SUNAN'),
  ('jiangsu-three', '320600', 'SUZHONG'),
  ('jiangsu-three', '320700', 'SUBEI'),
  ('jiangsu-three', '320800', 'SUBEI'),
  ('jiangsu-three', '320900', 'SUBEI'),
  ('jiangsu-three', '321000', 'SUZHONG'),
  ('jiangsu-three', '321100', 'SUNAN'),
  ('jiangsu-three', '321200', 'SUZHONG'),
  ('jiangsu-three', '321300', 'SUBEI'),
  ('henan-five', '410100', 'YUZHONG'),
  ('henan-five', '410200', 'YUZHONG'),
  ('henan-five', '410300', 'YUXI'),
  ('henan-five', '410400', 'YUZHONG'),
  ('henan-five', '410500', 'YUBEI'),
  ('henan-five', '410600', 'YUBEI'),
  ('henan-five', '410700', 'YUBEI'),
  ('henan-five', '410800', 'YUBEI'),
  ('henan-five', '410900', 'YUBEI'),
  ('henan-five', '411000', 'YUZHONG'),
  ('henan-five', '411100', 'YUZHONG'),
  ('henan-five', '411200', 'YUXI'),
  ('henan-five', '411300', 'YUNAN'),
  ('henan-five', '411400', 'YUDONG'),
  ('henan-five', '411500', 'YUNAN'),
  ('henan-five', '411600', 'YUDONG'),
  ('henan-five', '411700', 'YUNAN'),
  ('hunan-four', '430100', 'CHANGZHUTAN'),
  ('hunan-four', '430200', 'CHANGZHUTAN'),
  ('hunan-four', '430300', 'CHANGZHUTAN'),
  ('hunan-four', '430400', 'XIANGNAN'),
  ('hunan-four', '430500', 'DAXIANGXI'),
  ('hunan-four', '430600', 'DONGTINGHU'),
  ('hunan-four', '430700', 'DONGTINGHU'),
  ('hunan-four', '430800', 'DAXIANGXI'),
  ('hunan-four', '430900', 'DONGTINGHU'),
  ('hunan-four', '431000', 'XIANGNAN'),
  ('hunan-four', '431100', 'XIANGNAN'),
  ('hunan-four', '431200', 'DAXIANGXI'),
  ('hunan-four', '431300', 'DAXIANGXI'),
  ('hunan-four', '433100', 'DAXIANGXI'),
  ('guangdong-four', '440100', 'ZHUSANJIAO'),
  ('guangdong-four', '440200', 'YUEBEI'),
  ('guangdong-four', '440300', 'ZHUSANJIAO'),
  ('guangdong-four', '440400', 'ZHUSANJIAO'),
  ('guangdong-four', '440500', 'YUEDONG'),
  ('guangdong-four', '440600', 'ZHUSANJIAO'),
  ('guangdong-four', '440700', 'ZHUSANJIAO'),
  ('guangdong-four', '440800', 'YUEXI'),
  ('guangdong-four', '440900', 'YUEXI'),
  ('guangdong-four', '441200', 'ZHUSANJIAO'),
  ('guangdong-four', '441300', 'ZHUSANJIAO'),
  ('guangdong-four', '441400', 'YUEBEI'),
  ('guangdong-four', '441500', 'YUEDONG'),
  ('guangdong-four', '441600', 'YUEBEI'),
  ('guangdong-four', '441700', 'YUEXI'),
  ('guangdong-four', '441800', 'YUEBEI'),
  ('guangdong-four', '441900', 'ZHUSANJIAO'),
  ('guangdong-four', '442000', 'ZHUSANJIAO'),
  ('guangdong-four', '445100', 'YUEDONG'),
  ('guangdong-four', '445200', 'YUEDONG'),
  ('guangdong-four', '445300', 'YUEBEI'),
  ('sichuan-five', '510100', 'CHENGDUPINGYUAN'),
  ('sichuan-five', '510300', 'CHUANNAN'),
  ('sichuan-five', '510400', 'PANXI'),
  ('sichuan-five', '510500', 'CHUANNAN'),
  ('sichuan-five', '510600', 'CHENGDUPINGYUAN'),
  ('sichuan-five', '510700', 'CHENGDUPINGYUAN'),
  ('sichuan-five', '510800', 'CHUANDONGBEI'),
  ('sichuan-five', '510900', 'CHENGDUPINGYUAN'),
  ('sichuan-five', '511000', 'CHUANNAN'),
  ('sichuan-five', '511100', 'CHENGDUPINGYUAN'),
  ('sichuan-five', '511300', 'CHUANDONGBEI'),
  ('sichuan-five', '511400', 'CHENGDUPINGYUAN'),
  ('sichuan-five', '511500', 'CHUANNAN'),
  ('sichuan-five', '511600', 'CHUANDONGBEI'),
  ('sichuan-five', '511700', 'CHUANDONGBEI'),
  ('sichuan-five', '511800', 'CHENGDUPINGYUAN'),
  ('sichuan-five', '511900', 'CHUANDONGBEI'),
  ('sichuan-five', '512000', 'CHENGDUPINGYUAN'),
  ('sichuan-five', '513200', 'CHUANXIBEI'),
  ('sichuan-five', '513300', 'CHUANXIBEI'),
  ('sichuan-five', '513400', 'PANXI'),
  ('shaanxi-three', '610100', 'GUANZHONG'),
  ('shaanxi-three', '610200', 'GUANZHONG'),
  ('shaanxi-three', '610300', 'GUANZHONG'),
  ('shaanxi-three', '610400', 'GUANZHONG'),
  ('shaanxi-three', '610500', 'GUANZHONG'),
  ('shaanxi-three', '610600', 'SHAANBEI'),
  ('shaanxi-three', '610700', 'SHAANNAN'),
  ('shaanxi-three', '610800', 'SHAANBEI'),
  ('shaanxi-three', '610900', 'SHAANNAN'),
  ('shaanxi-three', '611000', 'SHAANNAN')
  ) AS v(carve_key, member_key, code)
  JOIN yucer_ref.market_carve c ON c.carve_key = v.carve_key
  JOIN yucer_ref.market_carve_division d ON d.carve_id = c.id AND d.division_code = v.code
  JOIN yucer_ref.admin_division a
    ON (c.scope_kind = 'china' AND a.level = 3 AND a.name_zh = v.member_key)
    OR (c.scope_kind = 'province' AND a.level IN (4, 5) AND a.code = v.member_key)
ON CONFLICT (carve_id, admin_division_id) DO NOTHING;

-- --- 2. 各市独立, derived ---------------------------------------------------
-- One carve per provincial-level division that has ground below it (台湾 /
-- 香港 / 澳门 have none in 0038 and get none here), one region per unit, coded
-- by the unit's own adcode - bare, the national standard. A province's units
-- are its level-4 rows minus the XX9000 filing row; a municipality (北京 天津
-- 上海 重庆) has no level-4 places, so its units are the level-5 districts and
-- counties under its filing rows.
WITH province AS (
  SELECT p.id, p.code, p.abbr_en, p.short_zh, p.path,
         p.code IN ('110000', '120000', '310000', '500000') AS municipality
    FROM yucer_ref.admin_division p
   WHERE p.level = 3 AND p.status = 'active'
     AND EXISTS (SELECT 1 FROM yucer_ref.admin_division x WHERE x.parent_id = p.id)
)
INSERT INTO yucer_ref.market_carve (carve_key, scope_kind, scope_province, name, sort_order)
SELECT lower(abbr_en) || '-units', 'province', abbr_en,
       short_zh || CASE WHEN municipality THEN '各区独立' ELSE '各市独立' END,
       100 + row_number() OVER (ORDER BY code)
  FROM province
ON CONFLICT (carve_key) DO NOTHING;

WITH province AS (
  SELECT p.id, p.code, p.abbr_en, p.path,
         p.code IN ('110000', '120000', '310000', '500000') AS municipality
    FROM yucer_ref.admin_division p
   WHERE p.level = 3 AND p.status = 'active'
),
unit AS (
  SELECT pr.abbr_en, u.id, u.code, u.short_zh, u.sort_order
    FROM province pr
    JOIN yucer_ref.admin_division u
      ON u.status = 'active'
     AND ((NOT pr.municipality AND u.level = 4 AND u.parent_id = pr.id AND u.code !~ '^\d\d9000$')
       OR (pr.municipality AND u.level = 5 AND u.path LIKE pr.path || '/%'))
)
INSERT INTO yucer_ref.market_carve_division (carve_id, division_code, name, sort_order)
SELECT c.id, u.code, u.short_zh,
       row_number() OVER (PARTITION BY u.abbr_en ORDER BY u.sort_order, u.code)
  FROM unit u
  JOIN yucer_ref.market_carve c ON c.carve_key = lower(u.abbr_en) || '-units'
ON CONFLICT (carve_id, division_code) DO NOTHING;

-- Each derived division holds exactly its own unit: the row whose adcode is
-- the division's code, under that carve's province.
INSERT INTO yucer_ref.market_carve_member (carve_id, admin_division_id, division_id)
SELECT d.carve_id, u.id, d.id
  FROM yucer_ref.market_carve_division d
  JOIN yucer_ref.market_carve c ON c.id = d.carve_id AND c.carve_key LIKE '%-units'
  JOIN yucer_ref.admin_division p ON p.level = 3 AND p.abbr_en = c.scope_province
  JOIN yucer_ref.admin_division u ON u.code = d.division_code AND u.level IN (4, 5) AND u.path LIKE p.path || '/%'
ON CONFLICT (carve_id, admin_division_id) DO NOTHING;

-- --- grants ------------------------------------------------------------------
-- Reference data: read, and nothing else. A carve changes by increment.
GRANT SELECT ON yucer_ref.market_carve TO yucer_svc;
GRANT SELECT ON yucer_ref.market_carve_division TO yucer_svc;
GRANT SELECT ON yucer_ref.market_carve_member TO yucer_svc;
