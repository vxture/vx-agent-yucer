-- 0053_multi_unit_membership.sql - a person belongs to several units.
--
-- THE RULING (owner, 2026-09-10): 支持一人在多个组织内，可以多个角色。
--
-- 0051 keyed yucer_gtm.org_unit_member on (workspace_id, sub): one placement
-- per person, replaced whole, with UPDATE granted on unit_id to move them.
-- A person who sits in two teams - a pre-sales lead shared by two regions, a
-- manager who also carries a territory team - had to be filed in one and
-- forgotten by the other, and the unit scope (0052) then hid the second
-- team's rows from them.
--
-- WHAT THIS LEAVES BEHIND:
--
-- 1. The placement is a PAIR (workspace_id, sub, unit_id), like member_role
--    and territory_unit beside it. A change is a delete and an insert, so
--    UPDATE is revoked outright: there is no third column left to change.
--    The existing rows are already valid pairs; nothing is rewritten.
-- 2. The unit scope frames the UNION of a member's units' subtrees. The
--    resolver reads the pairs; nothing in the database changes for it.
-- 3. Roles were always a set per member (local_authz.member_role); the
--    ruling's second half is already true and this increment restates it
--    only here.
--
-- Idempotent throughout: the key is re-stated only while the old one stands.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'pk_org_unit_member'
       AND c.conrelid = 'yucer_gtm.org_unit_member'::regclass
       AND array_length(c.conkey, 1) = 2
  ) THEN
    ALTER TABLE yucer_gtm.org_unit_member DROP CONSTRAINT pk_org_unit_member;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'pk_org_unit_member'
       AND c.conrelid = 'yucer_gtm.org_unit_member'::regclass
  ) THEN
    ALTER TABLE yucer_gtm.org_unit_member
      ADD CONSTRAINT pk_org_unit_member PRIMARY KEY (workspace_id, sub, unit_id);
  END IF;
END $$;

-- The pair shape: insert and delete, no UPDATE at all. The 0051 grant on
-- (unit_id, updated_at) is withdrawn; moving somebody is a delete + insert.
--
-- BOTH FORMS, ON PURPOSE. 0051 granted UPDATE at the COLUMN level, and a
-- table-level REVOKE does not touch column-level grants (Postgres keeps the
-- two ledgers apart) - the first db-lane run proved it: has_table_privilege
-- said false while column_privileges still listed both columns. The column
-- form is what actually withdraws them; the table form is what the mirror
-- test reads as "this table's writable set is reset".
REVOKE UPDATE (unit_id, updated_at) ON yucer_gtm.org_unit_member FROM yucer_svc;
REVOKE UPDATE ON yucer_gtm.org_unit_member FROM yucer_svc;
GRANT SELECT, INSERT, DELETE ON yucer_gtm.org_unit_member TO yucer_svc;
