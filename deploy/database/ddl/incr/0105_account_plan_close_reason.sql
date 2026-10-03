-- 0105_account_plan_close_reason.sql - why a customer plan was closed.
--
-- A customer plan can be CLOSED and REOPENED (owner ruling, 2026-10-02: 可以
-- 关闭，可以重开，原因选填). `status` was already writable and already allowed
-- 'closed', but nothing wrote it, and a close had nowhere to say why.
-- close_reason is that place: optional, free text, cleared when the plan is
-- reopened.
--
-- The whitelist below RESTATES 0006's whole list plus the new column, as the
-- other increments that add a writable column do.
--
-- Idempotent.

ALTER TABLE yucer_core.account_plan
  ADD COLUMN IF NOT EXISTS close_reason TEXT;

REVOKE UPDATE ON yucer_core.account_plan FROM yucer_svc;
GRANT UPDATE (
  target_amount, currency,
  contact_cadence_days, exec_cadence_days,
  owner_sub, presales_sub, delivery_sub,
  chain_goal, target_lines, status, close_reason, updated_at
) ON yucer_core.account_plan TO yucer_svc;
