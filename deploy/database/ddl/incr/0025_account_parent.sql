-- 0025_account_parent.sql - a customer can be a subsidiary of a customer.
--
-- Authority: ADR-024, batch B. Like batch A this is additive and does not
-- depend on the ADR being accepted: the contact/person split is a separate
-- question, and a group/subsidiary relationship is right either way.
--
-- WHY NOT account_relation. That table already links people to people
-- (from_contact_id -> to_contact_id) and is append-only evidence about a
-- decision chain. A corporate hierarchy is neither: it is a current fact about
-- two COMPANIES, it changes by acquisition rather than by observation, and
-- reading it must not walk a graph built for a different question.
--
-- THE PATTERN IS ALREADY IN THIS SCHEMA. yucer_gtm.territory has carried
-- parent_id -> territory since baseline, with ON DELETE SET NULL. Copying it
-- means the roll-up code, the cycle guard and the deletion semantics all have a
-- precedent that has been in production rather than a new invention.
--
-- ON DELETE SET NULL, not CASCADE. Deleting a parent company must not delete
-- its subsidiaries - they are customers in their own right, with their own
-- opportunities and their own history. Orphaning them is the correct outcome;
-- taking them with it is data loss dressed as referential integrity.
ALTER TABLE yucer_core.account
  ADD COLUMN IF NOT EXISTS parent_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_account_parent'
  ) THEN
    ALTER TABLE yucer_core.account
      ADD CONSTRAINT fk_account_parent
      FOREIGN KEY (parent_id) REFERENCES yucer_core.account (id) ON DELETE SET NULL;
  END IF;
END $$;

-- A row that is its own parent is the one cycle a CHECK can see, so the
-- database catches it and the rule layer does not have to be the only guard.
--
-- WHAT THIS DOES NOT CATCH, stated because the gap is the interesting part: a
-- LONGER cycle - A parent B, B parent A - is perfectly legal to Postgres. A
-- foreign key constrains one row at a time and has no view of the chain. That
-- guard has to live in the rule layer, which is why planAccountParent exists
-- and walks the ancestry; this CHECK is the cheap half, not the whole answer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_account_parent_not_self'
  ) THEN
    ALTER TABLE yucer_core.account
      ADD CONSTRAINT chk_account_parent_not_self
      CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END $$;

-- "the subsidiaries of X" is the query this column exists to answer.
CREATE INDEX IF NOT EXISTS idx_account_ws_parent
  ON yucer_core.account (workspace_id, parent_id);

REVOKE UPDATE ON yucer_core.account FROM yucer_svc;
GRANT UPDATE (name, industry, region, segment_code, owner_sub, health_score,
              tier, credit_code, website, employee_count, parent_id,
              status, updated_at, deleted_at)
  ON yucer_core.account TO yucer_svc;
