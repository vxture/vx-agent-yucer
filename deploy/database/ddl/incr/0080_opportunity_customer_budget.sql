-- 0080_opportunity_customer_budget.sql - 钱包份额 (YC-021 L4, owner 2026-09-24).
-- Authority: docs/20-specs/30-business-rules.md §9.6.
--
-- WHAT THE CUSTOMER SPENDS ON THIS PROJECT, IN TOTAL. Wallet share is ours
-- over theirs, and "theirs" is only answerable per project: a customer's
-- total spend on "our category" has no boundary anyone could name, while the
-- budget of the initiative a deal belongs to is a question a rep asks in
-- qualification. Owner ruling: it lives on the DEAL, is entered by a person
-- (人工填报), and the customer and 存量收入 cards only sum it.
--
-- WHO AND WHEN ride with it. The number is an estimate somebody heard; the
-- page shows who said it and how old it is, so a two-year-old figure reads as
-- one. Both are stamped by the service on every write of the amount, never
-- supplied by the caller.
--
-- IN THE DEAL'S CURRENCY. No currency column of its own: a budget in another
-- currency than the deal it is compared with would make the ratio a question
-- of exchange rates, which this product does not hold.
--
-- NULLABLE, no backfill: nothing recorded today says what any customer's
-- project budget was, and 0 would be a claim.
--
-- Idempotent throughout.

ALTER TABLE yucer_pipeline.opportunity
  ADD COLUMN IF NOT EXISTS customer_budget NUMERIC(18, 2);
ALTER TABLE yucer_pipeline.opportunity
  ADD COLUMN IF NOT EXISTS customer_budget_by_sub VARCHAR(128);
ALTER TABLE yucer_pipeline.opportunity
  ADD COLUMN IF NOT EXISTS customer_budget_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_opportunity_customer_budget'
  ) THEN
    ALTER TABLE yucer_pipeline.opportunity
      ADD CONSTRAINT chk_opportunity_customer_budget
      CHECK (customer_budget IS NULL OR customer_budget >= 0);
  END IF;
END $$;

COMMENT ON COLUMN yucer_pipeline.opportunity.customer_budget IS
  '客户在这个项目上的总投入 (人工填报, deal currency) - the denominator of 钱包份额. See incr/0080.';

-- The three join the writable set. Restated in full because grants accumulate
-- and REVOKE resets first (incr/0067's note).
REVOKE UPDATE ON yucer_pipeline.opportunity FROM yucer_svc;
GRANT UPDATE (name, plan_id, territory_id, owner_sub, stage, forecast_category,
              amount, currency, probability, requirement,
              contract_type_id, business_form_id,
              customer_budget, customer_budget_by_sub, customer_budget_at,
              expected_close_at, closed_at, status, updated_at, deleted_at)
  ON yucer_pipeline.opportunity TO yucer_svc;
