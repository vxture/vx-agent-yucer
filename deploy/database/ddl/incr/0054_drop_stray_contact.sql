-- 0054_drop_stray_contact.sql - remove the empty contact table a baseline
-- replay left beside person.
--
-- WHAT HAPPENED (2026-09-10, production db-init run 34517329962, the second
-- ever on that database): db-init re-applies 00_baseline before the
-- increments on every run, and the baseline's CREATE TABLE IF NOT EXISTS
-- yucer_core.contact found no `contact` - incr/0026 had renamed it to
-- `person` - and created a fresh, empty one beside it. 0026's guarded rename
-- then did nothing (person already stands), so the stray stayed. The run
-- went on to die in 98_column_locks on a column 0040 had dropped, so the
-- database is at 0053 plus one empty yucer_core.contact.
--
-- THIS INCREMENT DROPS THAT STRAY, and only that: the table must exist beside
-- person, carry no rows, and have nothing referencing it (the account_relation
-- foreign keys followed the rename and point at person). On a database that
-- never had the stray, or a fresh one, it does nothing. The baseline now
-- creates contact only while person does not exist, so the stray cannot
-- come back; this is the repair for the one database where it already did.
--
-- Idempotent.

DO $$
DECLARE
  n bigint;
BEGIN
  -- Nested, not one boolean: PL/pgSQL plans the whole condition up front, so
  -- a `SELECT count(*) FROM yucer_core.contact` in the same expression as the
  -- to_regclass guard fails on a database with no such table at all.
  IF to_regclass('yucer_core.contact') IS NOT NULL AND to_regclass('yucer_core.person') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM yucer_core.contact' INTO n;
    IF n = 0 AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE contype = 'f' AND confrelid = 'yucer_core.contact'::regclass
    ) THEN
      DROP TABLE yucer_core.contact;
    END IF;
  END IF;
END $$;
