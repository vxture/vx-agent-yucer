-- 0024_account_and_contact_identity.sql - the fields a CRM needs to identify
-- a company and reach a person, which this schema never had.
--
-- Authority: ADR-024, batch A. That ADR proposes a much larger change - the
-- contact/person split - and this increment is deliberately NOT that. It adds
-- columns and takes nothing away, so it does not depend on ADR-024 being
-- accepted; if the ADR is refused, these columns are still right.
--
-- WHAT WAS MISSING AND WHY IT MATTERS. yucer_core.contact holds name, title,
-- department and a decision role, and NO WAY TO CONTACT THE CONTACT. The
-- product asks a salesperson to work a decision chain it gives them no phone
-- number for. yucer_core.account holds a name, an industry and a region, none
-- of which identifies a legal entity - two rows called the same thing are
-- indistinguishable.
--
-- ALL NULLABLE, no defaults. Every row on file predates these columns and a
-- customer whose credit code nobody has recorded is not a defective row; it is
-- the normal state of a prospect somebody met last week. A NOT NULL here would
-- have to be satisfied by inventing values.

-- --- the person half -------------------------------------------------------
--
-- NO FORMAT CHECKS. A CHECK on an email or a phone number looks like rigour and
-- behaves like an outage: the constraint fires at write time, in the middle of
-- somebody recording a conversation, over a value that is merely unusual. Real
-- data has extensions ("+86 21 5555 0100 x204"), shared inboxes, and WeChat IDs
-- that follow no rule this schema knows. Validation belongs where it can
-- explain itself, next to the person typing.
--
-- WIDTHS ARE GENEROUS ON PURPOSE. 255 for email is the practical maximum a
-- local part plus a domain reaches; 64 for a mobile carries a country code, a
-- separator style and an extension.
ALTER TABLE yucer_core.contact
  ADD COLUMN IF NOT EXISTS email  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mobile VARCHAR(64),
  ADD COLUMN IF NOT EXISTS wechat VARCHAR(128);

-- --- the company half ------------------------------------------------------
--
-- employee_count IS A NUMBER, NOT A BAND. The obvious alternative - a
-- VARCHAR with a CHECK over ('1-50','51-200',...) - is what 0018 warned
-- against in its own note: a taxonomy is commercial vocabulary and belongs to
-- the owner, not to a schema guess. Bands are also lossy in one direction
-- only: a count derives every band anyone later defines, and no band derives a
-- count. When the owner names the bands, they become a view over this column
-- and no migration is needed.
--
-- credit_code is 统一社会信用代码 - 18 characters for a mainland entity. The
-- column is 64 and unconstrained in shape because a foreign counterparty has a
-- different registration entirely, and refusing to record one because it is not
-- 18 characters would make the product wrong about the customer rather than the
-- customer wrong about the product.
ALTER TABLE yucer_core.account
  ADD COLUMN IF NOT EXISTS credit_code    VARCHAR(64),
  ADD COLUMN IF NOT EXISTS website        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS employee_count INTEGER;

-- A negative headcount is not unusual data, it is a typo or a bug. Unlike an
-- email, there is no real value this refuses.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_account_employee_count'
  ) THEN
    ALTER TABLE yucer_core.account
      ADD CONSTRAINT chk_account_employee_count
      CHECK (employee_count IS NULL OR employee_count >= 0);
  END IF;
END $$;

-- ONE LEGAL ENTITY, ONE ROW - and this is the only part of this increment that
-- can refuse a write, so it states its own escape hatch.
--
-- A duplicate customer master record is the defect this exists to prevent: two
-- rows for one company, each accumulating its own opportunities, contacts and
-- history, discovered at the worst possible moment. `name` cannot carry this
-- rule (companies rename, and subsidiaries share words); a registration code
-- is exactly the identifier that does.
--
-- PARTIAL, on two predicates, and both are load-bearing:
--   credit_code IS NOT NULL - the common case is not knowing it yet. Postgres
--     would treat multiple NULLs as distinct anyway, but saying so here makes
--     the intent readable rather than incidental.
--   deleted_at IS NULL - a soft-deleted row must not block re-creating the
--     customer it stood for. A full index would make deletion permanent in a
--     way no user asked for.
--
-- workspace_id is in the key because this is a per-tenant uniqueness claim; two
-- workspaces selling to the same company is normal and is not a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_account_ws_credit_code
  ON yucer_core.account (workspace_id, credit_code)
  WHERE credit_code IS NOT NULL AND deleted_at IS NULL;

-- Adding a writable column requires granting it, or the service-role write
-- fails with permission denied. That failure is the design (CLAUDE.md, rigid
-- zone), and 98_column_locks.sql carries the same lists - both are updated
-- together or column-locks.test.ts fails in whichever direction is behind.
REVOKE UPDATE ON yucer_core.contact FROM yucer_svc;
GRANT UPDATE (name, title, department, decision_role, influence,
              email, mobile, wechat,
              status, updated_at, deleted_at)
  ON yucer_core.contact TO yucer_svc;

REVOKE UPDATE ON yucer_core.account FROM yucer_svc;
GRANT UPDATE (name, industry, region, segment_code, owner_sub, health_score,
              tier, credit_code, website, employee_count,
              status, updated_at, deleted_at)
  ON yucer_core.account TO yucer_svc;
