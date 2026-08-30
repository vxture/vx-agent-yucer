-- 0017_territory_regions.sql - a territory finally says which ground it covers.
--
-- Authority: docs/70-workplan/00-index.md (the flow plan, batch 2) and the
-- owner's ruling of 2026-08-30: lead assignment goes by TERRITORY first, then
-- by LOAD.
--
-- WHY. territory has carried owner_sub since the baseline, so "who covers this
-- ground" was always answerable - but nothing said WHICH GROUND. The demo
-- makes the gap plain: territories are EAST / NORTH / SOUTH while accounts
-- carry regions 华东 / 华北 / 华南 / 华中 / 西南 / 西北, and no column, key or
-- rule connects the two. Territory-first assignment cannot exist until it does.
--
-- SAME SHAPE AS market_segment.criteria, deliberately. That column is a JSONB
-- list of the values an account's own fields must match, it shipped with the
-- segment work, and it is already proven against real rows. Inventing a second
-- vocabulary for "which accounts does this cover" would give the product two
-- answers to one question - the mistake ADR-023 was written about.
--
-- A LIST, NOT A SINGLE VALUE. A territory routinely covers several regions
-- (EAST holding 华东 and 华中 is ordinary), and modelling it as one column
-- would force either a territory per region or a parent/child tree used as a
-- workaround for a missing array.
--
-- EMPTY MEANS COVERS NOTHING, not covers everything. A territory with no
-- regions named is one nobody has finished setting up, and routing leads to it
-- because its list is empty would send work to the least-configured territory
-- in the workspace. Same rule as an empty segment criteria matching no
-- account.
--
-- Idempotent throughout.

ALTER TABLE yucer_gtm.territory
  ADD COLUMN IF NOT EXISTS regions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- The column locks are re-stated here rather than only in 98: an increment
-- that adds a writable column must grant it, or the service role's write fails
-- with permission denied at deploy time. That failure is the design (CLAUDE.md,
-- rigid zone), and it is why this file carries its own grant.
REVOKE UPDATE ON yucer_gtm.territory FROM yucer_svc;
GRANT UPDATE (name, parent_id, owner_sub, regions, status, updated_at)
  ON yucer_gtm.territory TO yucer_svc;
