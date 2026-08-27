-- 0009_tender_signals.sql - 招标与定向挖掘 (ADR-016).
--
-- WHY: the strongest existing type is `referral` at weight 90. A tender notice
-- had nowhere to go but `other` at 25 - and in this market a tender carries the
-- budget, the deadline, the subject and the buyer at once. Scoring the most
-- decision-ready public information in the market at 25 is simply wrong.
--
-- `targeting` records WHY we were looking, which is a different question from
-- how likely the signal is to be real. It orders the inbox; it must never enter
-- the score. See ADR-016 section 3.
--
-- Idempotent throughout.

-- ===========================================================================
-- signal_type gains tender and compliance.
-- ===========================================================================
-- A CHECK cannot be extended in place; it is dropped and recreated with the
-- wider set. Safe in either direction because the old values remain legal.
ALTER TABLE yucer_pipeline.signal
  DROP CONSTRAINT IF EXISTS chk_signal_type;

ALTER TABLE yucer_pipeline.signal
  ADD CONSTRAINT chk_signal_type CHECK (signal_type IN (
    'intent', 'hiring', 'funding', 'tech_change', 'engagement', 'referral',
    -- An already-running procurement, not an intention to have one.
    'tender',
    -- Policy or accreditation forcing a purchase.
    'compliance',
    'other'
  ));

-- ===========================================================================
-- signal.targeting - which line of enquiry surfaced this.
-- ===========================================================================
-- Nullable and NOT backfilled: history was not mined along a line, and marking
-- it as though it were would fabricate provenance.
ALTER TABLE yucer_pipeline.signal
  ADD COLUMN IF NOT EXISTS targeting VARCHAR(24);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_signal_targeting') THEN
    ALTER TABLE yucer_pipeline.signal
      ADD CONSTRAINT chk_signal_targeting
      CHECK (targeting IS NULL OR targeting IN ('named_account', 'product_domain', 'none'));
  END IF;
END $$;

-- The inbox reads "what came in along a line, newest first".
CREATE INDEX IF NOT EXISTS signal_by_targeting
  ON yucer_pipeline.signal (workspace_id, targeting, detected_at DESC);

-- Writable: re-mining can reclassify why we were looking, and a signal matched
-- to an account AFTER the fact moves from product_domain to named_account. The
-- evidence columns stay frozen as they were - only the reason we looked moves.
GRANT UPDATE (targeting) ON yucer_pipeline.signal TO yucer_svc;
