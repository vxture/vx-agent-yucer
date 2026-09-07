-- 0032_milestone_as_commercial_gate.sql - a milestone is a payment gate, not a
-- work package.
--
-- Authority: the owner's ruling of 2026-09-06 - 按照市场管理的视角，不是研发管理
-- 的视角，设定里程碑；后续的项目回款是关联这个里程碑的，不是凭空来的。
--
-- WHAT THE TABLE SAID BEFORE. name / sequence / due_at / completed_at / status.
-- That is an R&D work package: a piece of work, when it is meant to finish,
-- whether it did. Every commercial question a milestone actually answers was
-- missing - what was promised, whether the customer signed it off, and which
-- money it releases - and `revenue_schedule.milestone_id` had sat nullable and
-- unwritten since the baseline, so an instalment's date was somebody's typing.
--
-- Three changes, each the database half of one owner decision.
--
-- 1. BASELINE. `due_at` alone cannot be late. Editing it moves the target, so
--    a plan that slips six weeks in three edits reads as on time at every
--    moment, and the delay is only visible to whoever remembers the first
--    date. `baseline_due_at` is what was committed, and it is IMMUTABLE - not
--    by convention but by being absent from the UPDATE grant below, so the
--    service role cannot rewrite it even by mistake. Slippage is then
--    subtraction, not memory.
--
-- 2. ACCEPTANCE, RECORDED - not collected. The customer does not use this
--    system and is not asked to. `accepted_by` is the customer-side signatory's
--    NAME as our own people write it down, `accepted_at` is when they signed,
--    and `acceptance_recorded_by_sub` is which of OUR users entered it. Same
--    shape as `account.record`: recording what happened is not the customer
--    operating anything, and the three columns move together or not at all.
--
--    Internally done is not commercially accepted, which is exactly why they
--    are separate columns. A team can finish the work weeks before the
--    customer signs, and it is the signature that lets an invoice out.
--
-- 3. THE BINDING, MADE REAL. `milestone_id` becomes NOT NULL: every instalment
--    names the gate that releases it. Two supporting changes make that a
--    guarantee rather than a hope:
--
--      - the FK becomes COMPOSITE, (milestone_id, project_id) against a new
--        UNIQUE (id, project_id). Without it an instalment on project A could
--        name a milestone on project B - both FKs would pass, and the money
--        would be released by a gate in someone else's contract.
--      - ON DELETE SET NULL becomes RESTRICT. SET NULL plus NOT NULL is a
--        contradiction the database would raise at the worst moment; RESTRICT
--        is also the right rule on its own terms - a gate with money hanging
--        off it cannot be quietly deleted.
--
-- 4. THE CHANGE RECORD. `milestone_change` is append-only and carries a reason.
--    Setting a plan is one thing; MOVING one after money is bound to it is a
--    commercial event, and the rule layer refuses the move without a reason.
--    No UPDATE grant at all, per this product's append-only guardrail: a
--    correction is a new row.
--
-- Idempotent throughout.

-- --- 1. what was promised ---------------------------------------------------
ALTER TABLE yucer_delivery.project_milestone
  ADD COLUMN IF NOT EXISTS baseline_due_at TIMESTAMPTZ;

-- Existing rows commit to the date they currently carry. Guarded on "nothing
-- has a baseline yet" so a re-run cannot overwrite a committed date with a
-- date that has since slipped - which would erase the very gap this column
-- exists to show.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yucer_delivery.project_milestone WHERE baseline_due_at IS NOT NULL) THEN
    UPDATE yucer_delivery.project_milestone
       SET baseline_due_at = due_at
     WHERE due_at IS NOT NULL;
  END IF;
END $$;

-- --- 2. the customer's signature, as we recorded it --------------------------
ALTER TABLE yucer_delivery.project_milestone
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

ALTER TABLE yucer_delivery.project_milestone
  ADD COLUMN IF NOT EXISTS accepted_by VARCHAR(255);

ALTER TABLE yucer_delivery.project_milestone
  ADD COLUMN IF NOT EXISTS acceptance_recorded_by_sub VARCHAR(128);

-- All three or none. A signature with no signatory, or a signatory with no
-- date, is a record that cannot be checked by the person who reads it next -
-- and an acceptance nobody on our side owns is not attributable at all.
ALTER TABLE yucer_delivery.project_milestone
  DROP CONSTRAINT IF EXISTS chk_project_milestone_acceptance;
ALTER TABLE yucer_delivery.project_milestone
  ADD CONSTRAINT chk_project_milestone_acceptance CHECK (
    (accepted_at IS NULL AND accepted_by IS NULL AND acceptance_recorded_by_sub IS NULL)
    OR (accepted_at IS NOT NULL AND accepted_by IS NOT NULL AND acceptance_recorded_by_sub IS NOT NULL)
  );

-- A customer does not sign off work that is not finished. `done` can stand
-- without acceptance - that is the wait for the signature - but acceptance
-- cannot stand without `done`.
ALTER TABLE yucer_delivery.project_milestone
  DROP CONSTRAINT IF EXISTS chk_project_milestone_accepted_is_done;
ALTER TABLE yucer_delivery.project_milestone
  ADD CONSTRAINT chk_project_milestone_accepted_is_done CHECK (
    accepted_at IS NULL OR status = 'done'
  );

-- --- 3. the binding ---------------------------------------------------------
-- The composite FK's target. `id` is already unique on its own; this exists so
-- (milestone_id, project_id) has something to reference, which is what forces
-- a milestone and the money it releases into the same project.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_project_milestone_id_project
  ON yucer_delivery.project_milestone (id, project_id);

-- Bind any instalment that predates the rule to the milestone it lines up
-- with - same project, nearest sequence at or below its own, which is how a
-- payment schedule and a gate schedule are written against each other.
UPDATE yucer_delivery.revenue_schedule r
   SET milestone_id = (
     SELECT m.id
       FROM yucer_delivery.project_milestone m
      WHERE m.project_id = r.project_id
      ORDER BY (m.sequence > r.sequence), abs(m.sequence - r.sequence), m.sequence
      LIMIT 1
   )
 WHERE r.milestone_id IS NULL;

-- STOP RATHER THAN DEGRADE. An instalment left unbound means the project has
-- no milestones at all, and there is no honest guess for which gate releases
-- it. Applying NOT NULL would fail here anyway with a message about a column;
-- this one says what to do. Silently skipping the constraint is the failure
-- mode this repo has already been bitten by - a guarantee the design leans on
-- that quietly did not hold.
DO $$
DECLARE unbound INTEGER;
BEGIN
  SELECT count(*) INTO unbound FROM yucer_delivery.revenue_schedule WHERE milestone_id IS NULL;
  IF unbound > 0 THEN
    RAISE EXCEPTION
      'incr/0032: % instalment(s) name no milestone. Their projects have no milestone plan; write one (or remove the instalments) before applying.', unbound;
  END IF;
END $$;

ALTER TABLE yucer_delivery.revenue_schedule
  ALTER COLUMN milestone_id SET NOT NULL;

ALTER TABLE yucer_delivery.revenue_schedule
  DROP CONSTRAINT IF EXISTS fk_revenue_schedule_milestone;
ALTER TABLE yucer_delivery.revenue_schedule
  ADD CONSTRAINT fk_revenue_schedule_milestone
  FOREIGN KEY (milestone_id, project_id)
  REFERENCES yucer_delivery.project_milestone (id, project_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_revenue_schedule_milestone
  ON yucer_delivery.revenue_schedule (milestone_id);

-- --- 4. the change record ---------------------------------------------------
-- One row per field moved, not one per save: "the date moved AND the name
-- changed" are two facts a reader wants separately, and a single row holding a
-- diff would have to be parsed to answer either.
CREATE TABLE IF NOT EXISTS yucer_delivery.milestone_change (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref]
  milestone_id  UUID NOT NULL,
  changed_by_sub VARCHAR(128) NOT NULL,               -- [ref] one of OUR users
  -- THE PLAN'S HISTORY, NOT THE WORK'S. Only the two fields that constitute a
  -- commitment are recorded here. A status moving pending -> in_progress ->
  -- done is the gate being worked and passed, and demanding a written reason
  -- for each step would fill this table with "started" - the work's history is
  -- already status, completed_at and the acceptance trio on the row itself.
  field         VARCHAR(32) NOT NULL
                  CONSTRAINT chk_milestone_change_field
                  CHECK (field IN ('name', 'due_at')),
  from_value    TEXT,
  to_value      TEXT,
  -- NOT NULL and non-empty. A change record whose reason is blank records that
  -- something moved and loses the only part anyone reads it for.
  reason        VARCHAR(500) NOT NULL
                  CONSTRAINT chk_milestone_change_reason
                  CHECK (length(btrim(reason)) > 0),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_milestone_change_milestone FOREIGN KEY (milestone_id)
    REFERENCES yucer_delivery.project_milestone (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_milestone_change_milestone
  ON yucer_delivery.milestone_change (milestone_id, changed_at DESC);

-- --- grants -----------------------------------------------------------------
-- 97 cannot reach a table created after it ran, and 98 cannot lock one that
-- did not exist when it ran, so this file carries both halves for
-- milestone_change (incr/README).
GRANT SELECT, INSERT ON yucer_delivery.milestone_change TO yucer_svc;

-- APPEND-ONLY, and no DELETE either. A change record that can be edited or
-- removed is not a record - it is a note. This product's guardrail for
-- account_relation / opportunity_stage_event / forecast_snapshot /
-- agent_message, applied to the fourth thing that is a history rather than a
-- state: a correction is a new row.
REVOKE UPDATE, DELETE ON yucer_delivery.milestone_change FROM yucer_svc;

-- project_milestone keeps `sequence` locked (uidx_project_milestone_seq) and
-- now `baseline_due_at` too - what was committed is not editable, which is the
-- whole of decision 1. Restated in full because grants accumulate and the
-- REVOKE resets first.
REVOKE UPDATE ON yucer_delivery.project_milestone FROM yucer_svc;
GRANT UPDATE (name, due_at, completed_at, status,
              accepted_at, accepted_by, acceptance_recorded_by_sub, updated_at)
  ON yucer_delivery.project_milestone TO yucer_svc;
