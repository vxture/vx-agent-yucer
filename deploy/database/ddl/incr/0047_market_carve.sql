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
-- division. member_key is the SAME key the workspace's own member tables
-- store - the province NAME under 中国市场 (0036), the unit ADCODE under 省级
-- 市场 (0045) - so adopting a carve is copying rows, not translating them.
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
  carve_key      VARCHAR(32) PRIMARY KEY,
  -- global | china | province - the frame the carve cuts.
  scope_kind     VARCHAR(16) NOT NULL,
  -- The province's two letters, for a province frame only (same pairing 0043
  -- CHECKs on market_scope).
  scope_province VARCHAR(8),
  -- 五分法 / 陕西三分法 / 陕西各市独立 - what the reset dialog and the preset
  -- select print.
  name           VARCHAR(64) NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT chk_market_carve_kind CHECK (scope_kind IN ('global', 'china', 'province')),
  CONSTRAINT chk_market_carve_province
    CHECK ((scope_kind = 'province') = (scope_province IS NOT NULL)),
  CONSTRAINT chk_market_carve_province_shape
    CHECK (scope_province IS NULL OR scope_province ~ '^[A-Z]{2}$')
);

CREATE TABLE IF NOT EXISTS yucer_ref.market_carve_division (
  carve_key     VARCHAR(32) NOT NULL REFERENCES yucer_ref.market_carve (carve_key) ON DELETE CASCADE,
  -- The code a workspace's division gets on adoption - CHINA-EAST, SN-610100.
  -- Same shape 0046 CHECKs on market_division, so an adoption cannot land a
  -- code the workspace table refuses.
  division_code VARCHAR(32) NOT NULL,
  name          VARCHAR(64) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT pk_market_carve_division PRIMARY KEY (carve_key, division_code),
  CONSTRAINT chk_market_carve_division_code CHECK (division_code ~ '^[A-Z]{2,8}-[A-Z0-9][A-Z0-9_]*$')
);

CREATE TABLE IF NOT EXISTS yucer_ref.market_carve_member (
  carve_key     VARCHAR(32) NOT NULL,
  -- A province name under 中国市场, a unit adcode under 省级市场.
  member_key    VARCHAR(32) NOT NULL,
  division_code VARCHAR(32) NOT NULL,
  -- A member sits in AT MOST ONE division of a carve: the same invariant the
  -- workspace tables enforce, so adopting a carve cannot violate it.
  CONSTRAINT pk_market_carve_member PRIMARY KEY (carve_key, member_key),
  CONSTRAINT fk_market_carve_member_division
    FOREIGN KEY (carve_key, division_code)
    REFERENCES yucer_ref.market_carve_division (carve_key, division_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_carve_scope
  ON yucer_ref.market_carve (scope_kind, scope_province, sort_order);
CREATE INDEX IF NOT EXISTS idx_market_carve_member_division
  ON yucer_ref.market_carve_member (carve_key, division_code);

COMMENT ON TABLE yucer_ref.market_carve IS
  '预置方案 - the shipped carves a workspace adopts as a start: which frame, which regions, which members. Reference data; see incr/0047.';

-- --- 1. the typed carves ---------------------------------------------------
-- 五分法 and 七分法 are the two standard ways to carve the country; the six
-- provincial ones are the reading everybody in that province recognises (the
-- owner names the rest as they come). Provinces with none carry only the
-- derived 各市独立 below.

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


INSERT INTO yucer_ref.market_carve_division (carve_key, division_code, name, sort_order) VALUES
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
  ('jiangsu-three', 'JS-SOUTH', '苏南', 1),
  ('jiangsu-three', 'JS-CENTRAL', '苏中', 2),
  ('jiangsu-three', 'JS-NORTH', '苏北', 3),
  ('henan-five', 'HA-CENTRAL', '豫中', 1),
  ('henan-five', 'HA-NORTH', '豫北', 2),
  ('henan-five', 'HA-EAST', '豫东', 3),
  ('henan-five', 'HA-WEST', '豫西', 4),
  ('henan-five', 'HA-SOUTH', '豫南', 5),
  ('hunan-four', 'HN-CZT', '长株潭', 1),
  ('hunan-four', 'HN-DONGTING', '洞庭湖', 2),
  ('hunan-four', 'HN-SOUTH', '湘南', 3),
  ('hunan-four', 'HN-WEST', '大湘西', 4),
  ('guangdong-four', 'GD-PRD', '珠三角', 1),
  ('guangdong-four', 'GD-EAST', '粤东', 2),
  ('guangdong-four', 'GD-WEST', '粤西', 3),
  ('guangdong-four', 'GD-NORTH', '粤北', 4),
  ('sichuan-five', 'SC-CHENGDU_PLAIN', '成都平原', 1),
  ('sichuan-five', 'SC-SOUTH', '川南', 2),
  ('sichuan-five', 'SC-NORTHEAST', '川东北', 3),
  ('sichuan-five', 'SC-PANXI', '攀西', 4),
  ('sichuan-five', 'SC-NORTHWEST', '川西北', 5),
  ('shaanxi-three', 'SN-GUANZHONG', '关中', 1),
  ('shaanxi-three', 'SN-SHAANBEI', '陕北', 2),
  ('shaanxi-three', 'SN-SHAANNAN', '陕南', 3)
ON CONFLICT (carve_key, division_code) DO NOTHING;


INSERT INTO yucer_ref.market_carve_member (carve_key, member_key, division_code) VALUES
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
  ('jiangsu-three', '320100', 'JS-SOUTH'),
  ('jiangsu-three', '320200', 'JS-SOUTH'),
  ('jiangsu-three', '320300', 'JS-NORTH'),
  ('jiangsu-three', '320400', 'JS-SOUTH'),
  ('jiangsu-three', '320500', 'JS-SOUTH'),
  ('jiangsu-three', '320600', 'JS-CENTRAL'),
  ('jiangsu-three', '320700', 'JS-NORTH'),
  ('jiangsu-three', '320800', 'JS-NORTH'),
  ('jiangsu-three', '320900', 'JS-NORTH'),
  ('jiangsu-three', '321000', 'JS-CENTRAL'),
  ('jiangsu-three', '321100', 'JS-SOUTH'),
  ('jiangsu-three', '321200', 'JS-CENTRAL'),
  ('jiangsu-three', '321300', 'JS-NORTH'),
  ('henan-five', '410100', 'HA-CENTRAL'),
  ('henan-five', '410200', 'HA-CENTRAL'),
  ('henan-five', '410300', 'HA-WEST'),
  ('henan-five', '410400', 'HA-CENTRAL'),
  ('henan-five', '410500', 'HA-NORTH'),
  ('henan-five', '410600', 'HA-NORTH'),
  ('henan-five', '410700', 'HA-NORTH'),
  ('henan-five', '410800', 'HA-NORTH'),
  ('henan-five', '410900', 'HA-NORTH'),
  ('henan-five', '411000', 'HA-CENTRAL'),
  ('henan-five', '411100', 'HA-CENTRAL'),
  ('henan-five', '411200', 'HA-WEST'),
  ('henan-five', '411300', 'HA-SOUTH'),
  ('henan-five', '411400', 'HA-EAST'),
  ('henan-five', '411500', 'HA-SOUTH'),
  ('henan-five', '411600', 'HA-EAST'),
  ('henan-five', '411700', 'HA-SOUTH'),
  ('hunan-four', '430100', 'HN-CZT'),
  ('hunan-four', '430200', 'HN-CZT'),
  ('hunan-four', '430300', 'HN-CZT'),
  ('hunan-four', '430400', 'HN-SOUTH'),
  ('hunan-four', '430500', 'HN-WEST'),
  ('hunan-four', '430600', 'HN-DONGTING'),
  ('hunan-four', '430700', 'HN-DONGTING'),
  ('hunan-four', '430800', 'HN-WEST'),
  ('hunan-four', '430900', 'HN-DONGTING'),
  ('hunan-four', '431000', 'HN-SOUTH'),
  ('hunan-four', '431100', 'HN-SOUTH'),
  ('hunan-four', '431200', 'HN-WEST'),
  ('hunan-four', '431300', 'HN-WEST'),
  ('hunan-four', '433100', 'HN-WEST'),
  ('guangdong-four', '440100', 'GD-PRD'),
  ('guangdong-four', '440200', 'GD-NORTH'),
  ('guangdong-four', '440300', 'GD-PRD'),
  ('guangdong-four', '440400', 'GD-PRD'),
  ('guangdong-four', '440500', 'GD-EAST'),
  ('guangdong-four', '440600', 'GD-PRD'),
  ('guangdong-four', '440700', 'GD-PRD'),
  ('guangdong-four', '440800', 'GD-WEST'),
  ('guangdong-four', '440900', 'GD-WEST'),
  ('guangdong-four', '441200', 'GD-PRD'),
  ('guangdong-four', '441300', 'GD-PRD'),
  ('guangdong-four', '441400', 'GD-NORTH'),
  ('guangdong-four', '441500', 'GD-EAST'),
  ('guangdong-four', '441600', 'GD-NORTH'),
  ('guangdong-four', '441700', 'GD-WEST'),
  ('guangdong-four', '441800', 'GD-NORTH'),
  ('guangdong-four', '441900', 'GD-PRD'),
  ('guangdong-four', '442000', 'GD-PRD'),
  ('guangdong-four', '445100', 'GD-EAST'),
  ('guangdong-four', '445200', 'GD-EAST'),
  ('guangdong-four', '445300', 'GD-NORTH'),
  ('sichuan-five', '510100', 'SC-CHENGDU_PLAIN'),
  ('sichuan-five', '510300', 'SC-SOUTH'),
  ('sichuan-five', '510400', 'SC-PANXI'),
  ('sichuan-five', '510500', 'SC-SOUTH'),
  ('sichuan-five', '510600', 'SC-CHENGDU_PLAIN'),
  ('sichuan-five', '510700', 'SC-CHENGDU_PLAIN'),
  ('sichuan-five', '510800', 'SC-NORTHEAST'),
  ('sichuan-five', '510900', 'SC-CHENGDU_PLAIN'),
  ('sichuan-five', '511000', 'SC-SOUTH'),
  ('sichuan-five', '511100', 'SC-CHENGDU_PLAIN'),
  ('sichuan-five', '511300', 'SC-NORTHEAST'),
  ('sichuan-five', '511400', 'SC-CHENGDU_PLAIN'),
  ('sichuan-five', '511500', 'SC-SOUTH'),
  ('sichuan-five', '511600', 'SC-NORTHEAST'),
  ('sichuan-five', '511700', 'SC-NORTHEAST'),
  ('sichuan-five', '511800', 'SC-CHENGDU_PLAIN'),
  ('sichuan-five', '511900', 'SC-NORTHEAST'),
  ('sichuan-five', '512000', 'SC-CHENGDU_PLAIN'),
  ('sichuan-five', '513200', 'SC-NORTHWEST'),
  ('sichuan-five', '513300', 'SC-NORTHWEST'),
  ('sichuan-five', '513400', 'SC-PANXI'),
  ('shaanxi-three', '610100', 'SN-GUANZHONG'),
  ('shaanxi-three', '610200', 'SN-GUANZHONG'),
  ('shaanxi-three', '610300', 'SN-GUANZHONG'),
  ('shaanxi-three', '610400', 'SN-GUANZHONG'),
  ('shaanxi-three', '610500', 'SN-GUANZHONG'),
  ('shaanxi-three', '610600', 'SN-SHAANBEI'),
  ('shaanxi-three', '610700', 'SN-SHAANNAN'),
  ('shaanxi-three', '610800', 'SN-SHAANBEI'),
  ('shaanxi-three', '610900', 'SN-SHAANNAN'),
  ('shaanxi-three', '611000', 'SN-SHAANNAN')
ON CONFLICT (carve_key, member_key) DO NOTHING;

-- --- 2. 各市独立, derived ---------------------------------------------------
-- One carve per provincial-level division that has ground below it (台湾 /
-- 香港 / 澳门 have none in 0038 and get none here), one region per unit, coded
-- by the province's letters and the unit's adcode. A province's units are its
-- level-4 rows minus the XX9000 filing row; a municipality (北京 天津 上海 重庆)
-- has no level-4 places, so its units are the level-5 districts and counties
-- under its filing rows.
WITH province AS (
  SELECT p.id, p.code, p.abbr_en, p.short_zh, p.path,
         p.code IN ('110000', '120000', '310000', '500000') AS municipality
    FROM yucer_ref.admin_division p
   WHERE p.level = 3 AND p.status = 'active'
     AND EXISTS (SELECT 1 FROM yucer_ref.admin_division x WHERE x.parent_id = p.id)
),
unit AS (
  SELECT pr.abbr_en, u.code, u.short_zh, u.sort_order
    FROM province pr
    JOIN yucer_ref.admin_division u
      ON u.status = 'active'
     AND ((NOT pr.municipality AND u.level = 4 AND u.parent_id = pr.id AND u.code !~ '^\d\d9000$')
       OR (pr.municipality AND u.level = 5 AND u.path LIKE pr.path || '/%'))
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
  SELECT pr.abbr_en, u.code, u.short_zh, u.sort_order
    FROM province pr
    JOIN yucer_ref.admin_division u
      ON u.status = 'active'
     AND ((NOT pr.municipality AND u.level = 4 AND u.parent_id = pr.id AND u.code !~ '^\d\d9000$')
       OR (pr.municipality AND u.level = 5 AND u.path LIKE pr.path || '/%'))
)
INSERT INTO yucer_ref.market_carve_division (carve_key, division_code, name, sort_order)
SELECT lower(abbr_en) || '-units', abbr_en || '-' || code, short_zh,
       row_number() OVER (PARTITION BY abbr_en ORDER BY sort_order, code)
  FROM unit
ON CONFLICT (carve_key, division_code) DO NOTHING;

INSERT INTO yucer_ref.market_carve_member (carve_key, member_key, division_code)
SELECT d.carve_key, split_part(d.division_code, '-', 2), d.division_code
  FROM yucer_ref.market_carve_division d
 WHERE d.carve_key LIKE '%-units'
ON CONFLICT (carve_key, member_key) DO NOTHING;

-- --- grants ------------------------------------------------------------------
-- Reference data: read, and nothing else. A carve changes by increment.
GRANT SELECT ON yucer_ref.market_carve TO yucer_svc;
GRANT SELECT ON yucer_ref.market_carve_division TO yucer_svc;
GRANT SELECT ON yucer_ref.market_carve_member TO yucer_svc;
