-- 0023_audit_event.sql - the audit record L1 X-3 requires, and this repo never
-- built (TD-018, docs/60-operations/00-index.md).
--
-- TWO SURFACES, ONE TABLE. `product_251` X-3 requires both a management-plane
-- write and a consumer-plane call to produce a record with a fixed field set.
-- This repo's two clearest instances of those surfaces are local_authz.admin
-- (grant/revoke a role, deactivate/reactivate a member, set data scope) and a
-- copilot turn's calls into Atlas/Runos - so this table serves both, rather
-- than being owned by either domain. It lives in its own schema for that
-- reason: putting it under local_authz or local_usage would make one surface's
-- writes look like a dependency of the other's schema.
--
-- NOT THE C3 USAGE ENVELOPE. `local_usage.raw` (workspace_id / metric / amount
-- / idempotency_key) is the outbound transport shape for platform metering,
-- built to `product_200 section 4.1`. X-3 is a DIFFERENT shape for a different
-- purpose - this repo's own queryable record of who did what - and the two
-- were mistakenly treated as competing definitions of one shape in the
-- 2026-08-17 conformance self-declaration (see the 2026-09-01 correction in
-- `docs/10-standards/10-l1-api-conformance.md`). This table does not replace
-- or feed `local_usage.raw`; the C3 envelope is unchanged.
--
-- APPEND-ONLY. A correction is a new row, same reasoning as
-- opportunity_stage_event / forecast_snapshot / agent_message: an audit trail
-- that can be edited after the fact is not an audit trail.
--
-- ACTOR_CONSOLE IS A PROCESS CONSTANT, NOT A NEW IDENTITY MODEL. Per the
-- Product 接入通则: this field names the console RP that minted an OBO
-- exchange, or - for a write this product produces itself rather than relays
-- on another console's behalf - a process constant identifying this product.
-- yucer has no OBO relay path yet, so every row today carries the same
-- constant ('yucer'); a NULL is reserved for a backend channel that belongs to
-- no console at all (this repo has none of those writing here yet either).
--
-- OUTCOME DISTINGUISHES DENIAL FROM SUCCESS, which is the point X-3 makes by
-- name: a column that only ever recorded successes could not answer "who tried
-- and was refused", which is half of what an audit trail is for.
--
-- COST_UNIT IS AN OPEN VOCABULARY (the 通则's own words) - this product
-- registers its own unit rather than picking from a platform-wide enum. The
-- first user is the copilot turn's Atlas token spend ('tokens'); nothing here
-- constrains what a later caller registers.

CREATE SCHEMA IF NOT EXISTS local_audit;

CREATE TABLE IF NOT EXISTS local_audit.event (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- X-3 eventId
  workspace_id  UUID NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id      VARCHAR(128) NOT NULL,                       -- platform sub
  actor_console VARCHAR(64),                                 -- see note above; NULL = no console
  object_type   VARCHAR(64) NOT NULL,
  object_id     VARCHAR(128) NOT NULL,
  action        VARCHAR(128) NOT NULL,
  outcome       VARCHAR(16) NOT NULL,
  task_id       VARCHAR(128),                                -- consumer-plane calls only
  cost_amount   NUMERIC(18, 4),
  cost_unit     VARCHAR(32),                                 -- open vocabulary; registered, not enumerated
  CONSTRAINT chk_event_outcome CHECK (outcome IN ('success', 'denied', 'error')),
  -- Both present or both absent: a cost with no unit is unreadable, a unit
  -- with no cost is a claim about nothing.
  CONSTRAINT chk_event_cost_pair CHECK ((cost_amount IS NULL) = (cost_unit IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_event_workspace_time
  ON local_audit.event (workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_task
  ON local_audit.event (task_id) WHERE task_id IS NOT NULL;

-- A table created in an increment has no privileges for yucer_svc until
-- granted here (97_service_role.sql only grants ON ALL TABLES at grant time,
-- which precedes this file - check-incr-grants.mjs enforces the pairing).
GRANT SELECT, INSERT ON local_audit.event TO yucer_svc;

-- No UPDATE, no DELETE: append-only, same as the product-domain journals in
-- 98_column_locks.sql.
