-- 0013_target_units.sql - a count is not an amount of money (TD-013, ADR-020).
--
-- Authority: docs/60-operations/00-index.md TD-013, ADR-020. This file and
-- those documents must be changed together.
--
-- WHY. `sales_target.metric` allows four values and only three of them are
-- money. `new_logo` is a COUNT of new customers: ten new logos is not ten yuan
-- and it has no currency. The column pair (target_amount, currency) forced one
-- on it anyway, so the form asked for an amount, the table rendered "10" as a
-- price, and every count target in the database carried a meaningless currency.
--
-- The bigger half was invisible until the type was examined: `metric` NEVER
-- ENTERED THE ATTAINMENT COMPUTATION. All four metrics were measured against
-- the same numerator - the snapshot's closed_amount, which is money. A
-- new-logo target of 10 measured against 2,700,000 closed rendered as
-- "27,000,000%" on /planning, and a pipeline target was measured against
-- closings rather than pipeline. Three of four metrics produced a meaningless
-- number and presented it as a percentage.
--
-- WHAT THIS CHANGES:
--
--   1. currency becomes NULLABLE, and a CHECK ties it to the metric so the
--      wrong state cannot be represented: a count target has no currency, a
--      money target must have one.
--   2. forecast_snapshot gains new_logo_count, so the count metric has a real
--      numerator instead of borrowing the money one.
--
-- target_amount keeps its name. It holds a count for one metric, and renaming
-- a column across Prisma and every query buys nothing the TS type does not
-- already buy - `TargetValue` is a discriminated union and a count cannot be
-- formatted as money without a compile error.
--
-- Idempotent: re-applying is a no-op.

-- --- 1. currency belongs to money metrics only -------------------------------

-- Existing count targets carry a currency they never meant. Clear it before the
-- constraint arrives, or the constraint cannot be added.
UPDATE yucer_gtm.sales_target SET currency = NULL WHERE metric = 'new_logo';

ALTER TABLE yucer_gtm.sales_target ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE yucer_gtm.sales_target ALTER COLUMN currency DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_sales_target_currency_matches_metric'
  ) THEN
    ALTER TABLE yucer_gtm.sales_target
      ADD CONSTRAINT chk_sales_target_currency_matches_metric
      CHECK (
        (metric = 'new_logo' AND currency IS NULL)
        OR (metric <> 'new_logo' AND currency IS NOT NULL)
      );
  END IF;
END $$;

-- --- 2. the count metric gets its own numerator ------------------------------
--
-- NEW LOGO = an account whose FIRST won deal closed inside the period. Computed
-- over the whole workspace and then attributed to the scope that first deal
-- belongs to, so a customer cannot be new twice by being won in two territories.
--
-- Stored on the snapshot rather than computed at read time, for the reason the
-- snapshot exists at all: attainment reads what D6 published, and D2 does not
-- recompute a number that already has an owner.
--
-- NULLABLE, AND NO DEFAULT. Zero would be a lie in two places: on a snapshot
-- taken before this increment, where nobody counted, and on one whose period
-- string this product cannot parse into dates. "Nobody counted" and "counted,
-- and the answer was none" are different facts, and collapsing them is the same
-- mistake as reporting an unset quota as 0% attained.

ALTER TABLE yucer_pipeline.forecast_snapshot
  ADD COLUMN IF NOT EXISTS new_logo_count INTEGER
  CONSTRAINT chk_forecast_snapshot_new_logo
  CHECK (new_logo_count IS NULL OR new_logo_count >= 0);

-- --- Grants ------------------------------------------------------------------
--
-- Nothing to add. sales_target already grants UPDATE on currency (98) and the
-- column is unchanged in that respect; forecast_snapshot is append-only, so a
-- new column is covered by its existing INSERT grant and must NOT gain UPDATE.
