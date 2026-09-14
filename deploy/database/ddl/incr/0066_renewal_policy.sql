-- 0066_renewal_policy.sql - 续约提醒窗口 stops being a bare constant.
--
-- Authority: owner, 2026-09-14 - same admin-configuration pass as incr/0065.
--
-- WHAT IT WAS: RENEWAL_WINDOW_DAYS=90 in domains/delivery/lib/renewal.ts.
-- assessRenewal already carried an opts.windowDays override with nothing ever
-- supplying it, so every workspace shared the one number. It decides how
-- early a subscription's renewal shows up on the queue - a company on annual
-- contracts and one on quarterly ones do not agree on how much lead time that
-- conversation needs, and neither is wrong about itself.
--
-- IN yucer_delivery, NOT yucer_field. Unlike incr/0065's three numbers, this
-- one thresholds a contract's end date rather than a contact's last touch -
-- a different fact, owned by the domain that already owns the project it
-- measures.
--
-- ONE ROW PER WORKSPACE, keyed by workspace_id itself, matching
-- forecast_threshold's own rule: a settings row is not a list.
--
-- NO DELETE GRANT. Every workspace has a window; "reset to ours" is an UPDATE
-- back to the default, not the absence of a row.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS yucer_delivery.renewal_policy (
  workspace_id  UUID PRIMARY KEY,                 -- [ref] isolation key
  -- How many days before a subscription's end date the renewal queue starts
  -- showing it.
  window_days   SMALLINT NOT NULL DEFAULT 90,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_renewal_policy_window CHECK (window_days BETWEEN 1 AND 365)
);

COMMENT ON TABLE yucer_delivery.renewal_policy IS
  '续约提醒窗口 - how many days ahead a subscription renewal surfaces. One row per workspace; see incr/0066.';

-- Every workspace that already has a project gets the shipped default. The
-- DEFAULT above carries the same figure, so a fresh row and a seeded one agree.
INSERT INTO yucer_delivery.renewal_policy (workspace_id)
SELECT DISTINCT workspace_id FROM yucer_delivery.project
ON CONFLICT (workspace_id) DO NOTHING;

-- --- grants -----------------------------------------------------------------
-- No DELETE: see the header. INSERT is how a workspace gets its first row, and
-- the window is the only thing anybody may then change.
GRANT SELECT, INSERT ON yucer_delivery.renewal_policy TO yucer_svc;
GRANT UPDATE (window_days, updated_at) ON yucer_delivery.renewal_policy TO yucer_svc;
