-- 0065_contact_recency_policy.sql - 联系提醒阈值 stops being two constants and
-- one more in the build.
--
-- Authority: owner, 2026-09-14 - a systematic pass over /admin/* looking for
-- configuration the product still keeps hard-coded, following the same
-- reasoning incr/0041 (forecast_threshold) already established.
--
-- WHAT IT WAS: QUIET_DAYS=21 and STALE_DAYS=30 in
-- domains/judgement/lib/judgement.ts, and CHAIN_WARM_DAYS=90 in
-- domains/account/lib/health.ts. All three decide how many days of silence
-- turn into a claim on somebody's screen - the home feed's "gone quiet"/
-- "stalled and a promise was broken" cards, and a decision-chain contact's
-- warm/cold classification - and a workspace disagreeing about the number is
-- not a workspace that is wrong.
--
-- ONE ROW, THREE COLUMNS, FOR THE SAME REASON forecast_threshold HAS THREE.
-- quiet_days/stale_days are consumed by judgement.ts; chain_warm_days by a
-- different rule in health.ts. They are still one setting a workspace tunes
-- in one sitting - "how long is quiet, here" - so they ride in one row rather
-- than opening a second table for the third number.
--
-- IN yucer_field, NOT yucer_core OR A NEW yucer_judgement. judgement.ts owns
-- no schema of its own (it is a pure derived view over other domains' data),
-- and all three numbers threshold the same underlying fact - days since a
-- recorded interaction - that yucer_field (ADR-006) already owns.
--
-- ONE ROW PER WORKSPACE, keyed by workspace_id itself, matching
-- forecast_threshold's own rule: a settings row is not a list.
--
-- NO DELETE GRANT. Every workspace has thresholds; "reset to ours" is an
-- UPDATE back to the defaults, not the absence of a row.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_field.contact_recency_policy (
  workspace_id     UUID PRIMARY KEY,                 -- [ref] isolation key
  -- Quiet longer than this, with no broken promise on either side: a lighter
  -- "gone quiet" card.
  quiet_days       SMALLINT NOT NULL DEFAULT 21,
  -- Quiet longer than this: the quiet card escalates, and a heavier
  -- "stalled and they broke a promise" card fires on its own.
  stale_days       SMALLINT NOT NULL DEFAULT 30,
  -- A decision-chain contact goes cold once nobody has reached them inside
  -- this many days.
  chain_warm_days  SMALLINT NOT NULL DEFAULT 90,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_contact_recency_quiet CHECK (quiet_days BETWEEN 1 AND 365),
  CONSTRAINT chk_contact_recency_stale CHECK (stale_days BETWEEN 1 AND 365),
  CONSTRAINT chk_contact_recency_warm CHECK (chain_warm_days BETWEEN 1 AND 365),
  -- THE ONE THAT MATTERS. judgement.ts escalates the quiet card from "watch"
  -- to "week" once the silence passes stale_days - a workspace that set these
  -- the other way around would get a lighter card for a longer silence.
  CONSTRAINT chk_contact_recency_ordered CHECK (quiet_days < stale_days)
);

COMMENT ON TABLE yucer_field.contact_recency_policy IS
  '联系提醒阈值 - how many days of silence count as quiet, stale, or cold. One row per workspace; see incr/0065.';

-- Every workspace that already has a customer gets the shipped numbers. The
-- DEFAULTs above carry the same figures, so a fresh row and a seeded one agree.
INSERT INTO yucer_field.contact_recency_policy (workspace_id)
SELECT DISTINCT workspace_id FROM yucer_core.account
ON CONFLICT (workspace_id) DO NOTHING;

-- --- grants -----------------------------------------------------------------
-- No DELETE: see the header. INSERT is how a workspace gets its first row, and
-- the three numbers are the only thing anybody may then change.
GRANT SELECT, INSERT ON yucer_field.contact_recency_policy TO yucer_svc;
GRANT UPDATE (quiet_days, stale_days, chain_warm_days, updated_at)
  ON yucer_field.contact_recency_policy TO yucer_svc;
