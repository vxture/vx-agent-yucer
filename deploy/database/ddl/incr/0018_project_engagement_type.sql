-- 0018_project_engagement_type.sql - which projects come back round.
--
-- Authority: the owner's ruling of 2026-08-30 - "a renewal opportunity is
-- derived from the project, but only for SUBSCRIPTION projects" - and the flow
-- plan in docs/70-workplan/00-index.md.
--
-- WHY A COLUMN AND NOT A RULE OVER EXISTING ONES. Nothing on project says
-- whether the thing delivered recurs. `ends_at` is the end of the engagement
-- either way: a one-off implementation ends when it is handed over, and a
-- subscription ends when the term does. Deriving "is this a subscription" from
-- a date, an amount or a product mix would be guessing at the commercial shape
-- of a deal from its shadow - and guessing wrong means either chasing renewals
-- nobody owes, or missing the ones that lapse.
--
-- TWO VALUES, NOT A LOOKUP TABLE. The question this decides is binary: does
-- the term end and need renewing, or was it delivered once and finished. A
-- richer taxonomy (retainer, usage-based, perpetual-with-support) is a real
-- commercial vocabulary and belongs to the owner, not to a schema guess; when
-- one arrives the CHECK widens and nothing else changes.
--
-- DEFAULT one_off, deliberately. Every project on file predates this column,
-- and defaulting to subscription would invent a renewal obligation for every
-- delivery ever recorded. A missing answer must not create work.
--
-- Idempotent throughout.

ALTER TABLE yucer_delivery.project
  ADD COLUMN IF NOT EXISTS engagement_type VARCHAR(32) NOT NULL DEFAULT 'one_off';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_project_engagement_type'
  ) THEN
    ALTER TABLE yucer_delivery.project
      ADD CONSTRAINT chk_project_engagement_type
      CHECK (engagement_type IN ('one_off', 'subscription'));
  END IF;
END $$;

-- An increment that adds a writable column must grant it, or the service role
-- write fails at deploy time with permission denied. That failure is the
-- design (CLAUDE.md, rigid zone).
REVOKE UPDATE ON yucer_delivery.project FROM yucer_svc;
GRANT UPDATE (name, manager_sub, contract_amount, currency, health, starts_at,
              ends_at, engagement_type, status, updated_at)
  ON yucer_delivery.project TO yucer_svc;
