-- 0077_project_contract.sql - the delivery record points at what was signed.
--
-- Authority: same as incr/0076, which creates the table this column references.
--
-- ONE EDGE, AND ONLY ONE. A contract produces delivery; delivery does not
-- produce contracts. So the link hangs off `project`, the same direction and
-- the same shape as project.opportunity_id: the downstream row names its
-- upstream cause. Putting a `project_id` on contract instead would cap a
-- contract at one project, which is exactly the assumption incr/0018 and
-- incr/0066 were built on and exactly the one incr/0076 exists to remove - a
-- framework agreement covering three rollouts is the ordinary enterprise case,
-- not an edge one.
--
-- NULLABLE, AND IT STAYS NULLABLE. Every project on file predates the contract
-- table, and there is no backfill that could be honest: nothing recorded today
-- says which contract a 2026 delivery ran under. A project may also legitimately
-- never have one (an internal pilot, a goodwill fix). NOT NULL here would be a
-- claim about history that this database cannot support - the same reason
-- incr/0018 defaulted engagement_type to one_off rather than guessing.
--
-- WRITABLE, unlike the frozen links on contract itself. Attaching a project to
-- its contract is ordinary record-keeping that happens after both exist, often
-- weeks apart, and getting it wrong is a clerical slip rather than a
-- reallocation of credit. The frozen ones on contract (opportunity_id,
-- renewed_from_contract_id) decide who earned the revenue and how long the
-- relationship has run; this one decides which folder the work sits in.
--
-- ON DELETE SET NULL, matching fk_project_opportunity in the same table: a
-- deleted contract must not take a live delivery project with it.
--
-- Idempotent throughout.

ALTER TABLE yucer_delivery.project
  ADD COLUMN IF NOT EXISTS contract_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_contract'
  ) THEN
    ALTER TABLE yucer_delivery.project
      ADD CONSTRAINT fk_project_contract
      FOREIGN KEY (contract_id)
      REFERENCES yucer_delivery.contract (id) ON DELETE SET NULL;
  END IF;
END $$;

-- "Which projects run under this contract" - the contract detail page's one
-- question, and the join the renewal window needs to show what is at stake.
CREATE INDEX IF NOT EXISTS idx_project_ws_contract
  ON yucer_delivery.project (workspace_id, contract_id)
  WHERE contract_id IS NOT NULL;

-- --- the grant, restated in full --------------------------------------------
--
-- THE WHOLE LIST, NOT THE NEW COLUMN. A REVOKE resets the set, so a GRANT that
-- named only contract_id would leave project writable in exactly one column and
-- every existing write would start failing with `permission denied for column
-- name`. That is not hypothetical: production lost three columns' worth of
-- grants on 2026-09-10 to a half-applied 98 (incr/0068 is the repair), and the
-- rule that came out of it is that every increment touching a table's writable
-- set restates the entire set. The list below is 0018's plus contract_id.
REVOKE UPDATE ON yucer_delivery.project FROM yucer_svc;
GRANT UPDATE (name, manager_sub, contract_amount, currency, health, starts_at,
              ends_at, engagement_type, contract_id, status, updated_at)
  ON yucer_delivery.project TO yucer_svc;
