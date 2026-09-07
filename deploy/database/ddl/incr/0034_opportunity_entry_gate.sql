-- 0034_opportunity_entry_gate.sql - a deal has an owner and says what the
-- customer wants.
--
-- Authority: owner, 2026-09-06 - 商机必须有负责人，有客户，有客户项目基本信息
-- 或需求，按照你的闸门逻辑是合理的. design_yucer_110 batch A.
--
-- WHAT WAS TRUE BEFORE. `planNewOpportunity` asked for two things: a name and
-- an account. Of the owner's three:
--
--   有客户    already enforced - account_id is NOT NULL with a foreign key
--   有负责人  a COINCIDENCE. owner_sub was nullable, the rule never looked at
--             it, and createOpportunity filled it with ctx.sub. Every path
--             that went through that one function got an owner; anything else
--             could write a deal nobody owned.
--   有需求    DID NOT EXIST AT ALL. name, amount, probability and
--             expected_close_at were there. What the customer actually wants
--             was nowhere in the schema.
--
-- A NULLABLE COLUMN THAT ONE FUNCTION HAPPENS TO FILL IS NOT A RULE. It is a
-- habit that holds until somebody writes a second path - and this product now
-- has three (the form, a renewal, a lead conversion), one of which reaches the
-- store directly.
--
-- Idempotent throughout.

-- --- 1. every deal has an owner ---------------------------------------------
-- STOP RATHER THAN DEGRADE, the same shape as incr/0032's unbound instalments.
-- An ownerless deal cannot be given one by this file: who should own it is a
-- decision, not a default, and inventing one would put a person's name against
-- work they never agreed to.
DO $$
DECLARE orphaned INTEGER;
BEGIN
  SELECT count(*) INTO orphaned FROM yucer_pipeline.opportunity WHERE owner_sub IS NULL;
  IF orphaned > 0 THEN
    RAISE EXCEPTION
      'incr/0034: % opportunity(ies) have no owner. Assign them before applying - who owns a deal is a decision this migration cannot make.', orphaned;
  END IF;
END $$;

ALTER TABLE yucer_pipeline.opportunity
  ALTER COLUMN owner_sub SET NOT NULL;

-- --- 2. and says what the customer wants -------------------------------------
ALTER TABLE yucer_pipeline.opportunity
  ADD COLUMN IF NOT EXISTS requirement TEXT;

-- Same refusal, same reason. A requirement cannot be backfilled from a name or
-- an amount; writing a placeholder would satisfy the constraint and defeat the
-- column - and every reader after that would have to guess which values were
-- real.
DO $$
DECLARE blank INTEGER;
BEGIN
  SELECT count(*) INTO blank FROM yucer_pipeline.opportunity
   WHERE requirement IS NULL OR length(btrim(requirement)) = 0;
  IF blank > 0 THEN
    RAISE EXCEPTION
      'incr/0034: % opportunity(ies) have no requirement. Record what each customer wants before applying; it cannot be derived from a name or an amount.', blank;
  END IF;
END $$;

ALTER TABLE yucer_pipeline.opportunity
  ALTER COLUMN requirement SET NOT NULL;

-- NOT NULL IS NOT ENOUGH ON TEXT. An empty string passes it and says nothing,
-- which is exactly the placeholder the guard above refuses to write.
ALTER TABLE yucer_pipeline.opportunity
  DROP CONSTRAINT IF EXISTS chk_opportunity_requirement;
ALTER TABLE yucer_pipeline.opportunity
  ADD CONSTRAINT chk_opportunity_requirement
  CHECK (length(btrim(requirement)) > 0);

-- --- grants -----------------------------------------------------------------
-- `requirement` is WRITABLE, and deliberately so. It is not an attribution key
-- and not an anchor: what a customer wants is understood better as a deal
-- progresses, and a first sentence written at qualify time should be improved
-- rather than preserved as a monument. `owner_sub` was already writable -
-- reassignment is a normal act - and is unaffected by becoming NOT NULL.
--
-- Restated in full because grants accumulate and the REVOKE resets first.
REVOKE UPDATE ON yucer_pipeline.opportunity FROM yucer_svc;
GRANT UPDATE (name, plan_id, territory_id, owner_sub, stage, forecast_category,
              amount, currency, probability, requirement,
              expected_close_at, closed_at, status, updated_at, deleted_at)
  ON yucer_pipeline.opportunity TO yucer_svc;
