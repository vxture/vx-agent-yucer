-- 0046_market_division_unit.sql - every province is a frame, carved by its
-- own units.
--
-- Authority: owner, 2026-09-09 - "你把全国的都加上吧" and "我们的行政区划数据
-- 应该先预置完整". incr/0045 opened 陕西; this opens the other thirty from the
-- same table, and two of its CHECKs were written for one province.
--
-- 1. A MUNICIPALITY HAS NO CITIES. 北京 天津 上海 重庆 sit at level 3 with a
--    filing row (市辖区) at level 4 and their districts at level 5, so a
--    region in a 北京市场 is made of level-5 rows. 0045 allowed 2 and 4.
--
-- 2. A BY-UNIT CARVE IS CODED BY ADCODE. 各市独立 makes one region per unit,
--    SN-610100: the table carries no romanised city names (0038 refused to
--    fabricate them), and the adcode is the key anything importing the carve
--    matches on. 0043's shape CHECK demanded a LETTER after the hyphen.
--    Widened to a letter or a digit; everything else about the shape holds.
--
-- Idempotent throughout.

ALTER TABLE yucer_core.market_division_member
  DROP CONSTRAINT IF EXISTS chk_market_division_member_level;
ALTER TABLE yucer_core.market_division_member
  ADD CONSTRAINT chk_market_division_member_level CHECK (member_level IN (2, 4, 5));

ALTER TABLE yucer_core.market_division
  DROP CONSTRAINT IF EXISTS chk_market_division_code_frame;
ALTER TABLE yucer_core.market_division
  ADD CONSTRAINT chk_market_division_code_frame CHECK (
    division_code ~ '^[A-Z]{2,8}-[A-Z0-9][A-Z0-9_]*$'
    AND (
      (scope = 'china'  AND division_code LIKE 'CHINA-%')
      OR (scope = 'global' AND division_code LIKE 'GLOBAL-%')
      OR (scope = 'province')
    )
  );
