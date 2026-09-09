-- 0045_market_division_member.sql - the member table 0043 promised, and the
-- first province-level market: 陕西.
--
-- Authority: owner, 2026-09-09 - "陕西作为第一个省级支持区域。正式的" and
-- "陕西看市级，怎么能是县呢" - a province frame is carved by prefecture-level
-- CITY, and 陕西 is the first province the product opens.
--
-- WHAT WAS MISSING. incr/0036's market_division_province holds the 34 province
-- NAMES and nothing else, by CHECK. A workspace whose whole market is one
-- province carves it by city, and a city is not one of those 34 names. The
-- rows it needs already exist - yucer_ref.admin_division (0038) holds every
-- prefecture-level city under every province - so the member table for the
-- other two frames points at THOSE rows rather than repeating names.
--
-- ONE TABLE FOR BOTH FRAMES THAT ARE NOT 中国市场: a member is (level, code)
-- in admin_division - a country at level 2 under 全球市场, a city at level 4
-- under 省级市场. 中国市场 keeps 0036's table untouched: every figure the
-- situation screen groups depends on it, and moving 34 rows per tenant into a
-- new shape buys nothing.
--
-- THE SAME INVARIANT AS 0036, enforced the same way: a member sits in AT MOST
-- ONE division, because (workspace_id, member_level, member_code) is the
-- primary key. And ON DELETE RESTRICT both ways - a division still holding
-- cities cannot be dropped, and a city that has been placed cannot be
-- retired out from under it.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_core.market_division_member (
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  -- Which admin_division row: 2 = country, 4 = prefecture-level city. Not 3:
  -- provinces live in market_division_province. Not 5: a province is carved
  -- by city (owner), and counties are the level below what a region holds.
  member_level  SMALLINT NOT NULL,
  member_code   VARCHAR(12) NOT NULL,
  division_id   UUID NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_market_division_member PRIMARY KEY (workspace_id, member_level, member_code),
  CONSTRAINT fk_market_division_member_division
    FOREIGN KEY (division_id) REFERENCES yucer_core.market_division (id) ON DELETE RESTRICT,
  -- The member IS an admin_division row. A code nobody has cannot be placed;
  -- the composite key is the one 0038 made unique, because NA is both a
  -- continent and a country.
  CONSTRAINT fk_market_division_member_place
    FOREIGN KEY (member_level, member_code)
    REFERENCES yucer_ref.admin_division (level, code) ON DELETE RESTRICT,
  CONSTRAINT chk_market_division_member_level CHECK (member_level IN (2, 4))
);

COMMENT ON TABLE yucer_core.market_division_member IS
  'Which country (level 2) or city (level 4) sits in which 大区, for the global and province frames; see incr/0045.';

CREATE INDEX IF NOT EXISTS idx_market_division_member_div
  ON yucer_core.market_division_member (workspace_id, division_id);

-- --- grants ------------------------------------------------------------------
-- The same set 0036 gave the province table: place, unplace, move. The key
-- columns are not writable - moving a city in place is a delete and an insert
-- wearing one statement.
GRANT SELECT, INSERT, DELETE ON yucer_core.market_division_member TO yucer_svc;
GRANT UPDATE (division_id, updated_at) ON yucer_core.market_division_member TO yucer_svc;
