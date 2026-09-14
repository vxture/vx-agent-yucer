-- 0069_root_unit_code_headquarters.sql - the trunk of every shipped template
-- is `headquarters` on the database as well as in the mirror.
--
-- WHY. PR #244 renamed the root unit of the three shipped templates from `hq`
-- to `headquarters` - in lib/org.ts AND by editing incr/0051 in place. An
-- increment is applied once (ADR-032): production had run 0051 on
-- 2026-09-10, so its yucer_ref.org_template_unit still says `hq`, and so does
-- the trunk of any workspace tree 0051 seeded that day. The mirror test ("the
-- table and the mirror hold the same templates") fails against exactly that
-- database, and a template reset matches units by code. This increment is
-- what the edit should have been.
--
-- Links are by id (org_unit_member.unit_id, territory_unit.unit_id,
-- org_unit_division.unit_id, and both parent_id columns), so renaming the
-- code moves nothing else. Guarded: a template or workspace that ALREADY has
-- a `headquarters` unit is left alone - that shape only arises where 0051 was
-- replayed on top of old rows (a test database), never from db-init.
--
-- IDEMPOTENT, and a no-op on a fresh database (0051 as it now reads seeds
-- `headquarters`; no `hq` exists).

UPDATE yucer_ref.org_template_unit o
   SET unit_code = 'headquarters'
 WHERE o.unit_code = 'hq'
   AND NOT EXISTS (SELECT 1 FROM yucer_ref.org_template_unit h
                    WHERE h.template_id = o.template_id AND h.unit_code = 'headquarters');

UPDATE yucer_gtm.org_unit o
   SET unit_code = 'headquarters'
 WHERE o.unit_code = 'hq'
   AND o.parent_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM yucer_gtm.org_unit h
                    WHERE h.workspace_id = o.workspace_id AND h.unit_code = 'headquarters');
