-- 0073_contact_sort_order.sql - a manual display order for one account's
-- contact roster.
--
-- Authority: owner, 2026-09-20 - 联系人排序四元组（移到顶部/上移/下移/移到
-- 底部），要持久化，刷新后还在；姓名列的点击排序保持临时，不落库。
--
-- Lives on yucer_core.person_affiliation, not on person: where somebody sits
-- in THIS account's roster is a fact about the employment edge, not about the
-- person globally - the same person can be affiliated with more than one
-- account and would otherwise fight over one shared order. Same shape as
-- every other manually-ordered vocabulary in this schema (industry,
-- customer_type, ...): a plain integer, dense-renumbered by planMove
-- (domains/shared/ordering.ts) rather than swapped, so rows that all start
-- at the DEFAULT 0 self-heal on the first move.
--
-- Idempotent throughout.

ALTER TABLE yucer_core.person_affiliation
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_person_affiliation_ws_account_sort
  ON yucer_core.person_affiliation (workspace_id, account_id, sort_order);

-- --- grants -------------------------------------------------------------
-- Whole list restated (house rule since 0068's postmortem): sort_order is the
-- only addition to 0026's original set.
REVOKE UPDATE ON yucer_core.person_affiliation FROM yucer_svc;
GRANT UPDATE (title, department, is_primary, started_at, ended_at, updated_at, sort_order)
  ON yucer_core.person_affiliation TO yucer_svc;
