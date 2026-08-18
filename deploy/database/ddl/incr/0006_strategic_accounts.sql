-- 0006_strategic_accounts.sql - 战略客户与经营计划 (ADR-013).
--
-- WHY: the chain models ONE kind of selling - signal to lead to deal to win,
-- event-driven, the unit being a single deal. Enterprise selling also has a
-- second kind: one named customer pursued across years and many deals, the unit
-- being the CUSTOMER. Nothing in the schema could express it - `account` had no
-- tier at all, and no object carried "how we intend to work this customer".
--
-- The load-bearing consequence is in the judgement engine, not here. Every
-- existing rule is EVENT-TRIGGERED and every one of them requires an open
-- opportunity. For a strategic account that is wrong: a locked-in customer with
-- no open deal going quiet is the single most important thing to report,
-- because the account plan is failing SILENTLY and no event will ever fire to
-- say so. See ADR-013 section 3.
--
-- Idempotent throughout.

-- ===========================================================================
-- account.tier - which kind of selling this customer gets.
-- ===========================================================================
-- Locking a customer as strategic is a D1 ACTION, not an owner's preference.
-- The write path is restricted to strategy.plan.approve in the service layer;
-- an unrestricted tier is the same as no tier, because within a week everyone
-- has marked their own biggest customer strategic.
ALTER TABLE yucer_core.account
  ADD COLUMN IF NOT EXISTS tier VARCHAR(16) NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_account_tier'
  ) THEN
    ALTER TABLE yucer_core.account
      ADD CONSTRAINT chk_account_tier CHECK (tier IN ('strategic', 'key', 'standard'));
  END IF;
END $$;

-- Adding a WRITABLE column to an existing table means 98_column_locks.sql must
-- grant it, or the service-role write fails with permission denied. 98 runs
-- BEFORE this file, so the grant is re-issued here for the new column.
GRANT UPDATE (tier) ON yucer_core.account TO yucer_svc;

-- ===========================================================================
-- account_plan - how we intend to work one strategic customer.
-- ===========================================================================
-- One per account. Everything here is what the OPPORTUNITY layer cannot say:
-- a deal is one transaction, and account management is a string of them plus
-- all the work between them - which is what decides whether the string happens.
CREATE TABLE IF NOT EXISTS yucer_core.account_plan (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL,                   -- [ref] isolation key
  account_id           UUID NOT NULL,                   -- [ref] yucer_core.account
  period               VARCHAR(16) NOT NULL,            -- e.g. 2026Q3, matches sales_target
  target_amount        NUMERIC(18,2),                   -- across ALL deals this period
  currency             VARCHAR(8) NOT NULL DEFAULT 'CNY',

  -- The cadence. THIS is why the table exists.
  --
  -- Per plan rather than global, because the right rhythm differs: a customer
  -- mid-tender and one that just went live after delivery cannot share a number.
  -- Changing it is a management decision that lands in the plan's history; it
  -- must not become a quiet way to make a judgement disappear, which is the
  -- same principle as ADR-003's un-editable proposals.
  contact_cadence_days INT NOT NULL DEFAULT 30,         -- any meaningful contact
  exec_cadence_days    INT NOT NULL DEFAULT 90,         -- DECISION-MAKER level contact

  -- The three owners. An opportunity has one; working an account needs sales,
  -- pre-sales and delivery to be named people.
  owner_sub            VARCHAR(128),
  presales_sub         VARCHAR(128),
  delivery_sub         VARCHAR(128),

  -- Where we intend the decision map to BE, as opposed to where it is. The
  -- current map lives in account_relation; this is the target state.
  chain_goal           TEXT,
  -- Product lines we intend to enter this period. TEXT until the product domain
  -- exists - the real whitespace analysis needs opportunity_line. Recorded now
  -- so the plan's shape does not have to change when it arrives.
  target_lines         TEXT,

  status               VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_account_plan_status CHECK (status IN ('active', 'closed')),
  -- Cadence of zero or less would make the rule fire on every scan forever.
  CONSTRAINT chk_account_plan_cadence CHECK (contact_cadence_days > 0 AND exec_cadence_days > 0)
);

-- One live plan per account per period. A second plan for the same period is a
-- revision, not a parallel plan.
CREATE UNIQUE INDEX IF NOT EXISTS account_plan_unique
  ON yucer_core.account_plan (workspace_id, account_id, period);

-- The scan reads every active plan in a workspace.
CREATE INDEX IF NOT EXISTS account_plan_active
  ON yucer_core.account_plan (workspace_id, status);

-- ===========================================================================
-- Grants and locks, HERE rather than in 97/98 - see incr/README.md.
-- ===========================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON yucer_core.account_plan TO yucer_svc;

-- account_id and period are the identity of the plan. Re-planning the same
-- account for the same period edits this row; planning it for a DIFFERENT
-- period is a new row.
REVOKE UPDATE ON yucer_core.account_plan FROM yucer_svc;
GRANT UPDATE (
  target_amount, currency,
  contact_cadence_days, exec_cadence_days,
  owner_sub, presales_sub, delivery_sub,
  chain_goal, target_lines, status, updated_at
) ON yucer_core.account_plan TO yucer_svc;
