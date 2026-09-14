-- 0068_restore_grants_after_failed_rerun.sql - put the service role's grants
-- back where 98 and the increments left them. Grants only; no structure.
--
-- WHAT HAPPENED. Production's second db-init (run 34517329962, 2026-09-10
-- 18:55, before the ledger existed) re-applied the trio on a database that
-- already carried 0001-0052:
--
--   97 re-ran `GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA`. That is
--      evaluated at grant time, so this time it also reached five tables that
--      increments had created with SELECT and INSERT only.
--   98 ran up to `REVOKE UPDATE ON yucer_core.account` and died on the very
--      next statement, whose column list still named `industry` (gone since
--      0040). The REVOKE had already taken every column grant on account with
--      it - 98's own, 0006's tier, 0024's identity columns, 0025's parent_id,
--      0035's province, 0040's industry_id - and nothing granted them back.
--      Earlier in the same file, member's REVOKE + re-GRANT had dropped 0022's
--      `scope`.
--
-- Production has carried this since: the service role could not UPDATE any
-- account column, could not move a member's data scope, and could DELETE from
-- five tables built to be SELECT + INSERT.
--
-- FOUND on a production twin (2026-09-14). A twin built from the successful
-- runs alone was identical to a fresh database; replaying the FAILED run as
-- well made seven db tests fail, and a schema diff against fresh showed
-- exactly these ACL lines and nothing else.
--
-- ON A FRESH DATABASE every statement is a no-op restatement: the pair below
-- re-issues the account whitelist exactly as 98 + increments leave it (the
-- mirror in domains/shared/column-locks.ts is the check), `scope` is already
-- granted, and DELETE was never granted on the five. Idempotent.

-- yucer_core.account: the whitelist as of incr/0040 (98 + 0006 + 0024 + 0025 + 0035 + 0040).
REVOKE UPDATE ON yucer_core.account FROM yucer_svc;
GRANT UPDATE (name, industry_id, region, province, segment_code, owner_sub, health_score, status,
              tier, credit_code, website, employee_count, parent_id, updated_at, deleted_at)
  ON yucer_core.account TO yucer_svc;

-- local_authz.member: incr/0022's data scope.
GRANT UPDATE (scope) ON local_authz.member TO yucer_svc;

-- The five tables 97's re-run widened. Each is SELECT + INSERT by its own
-- increment (0012, 0032, 0041, 0042, 0043); a correction there is a new row.
REVOKE DELETE ON yucer_pipeline.line_discount_approval FROM yucer_svc;
REVOKE DELETE ON yucer_delivery.milestone_change FROM yucer_svc;
REVOKE DELETE ON yucer_pipeline.forecast_threshold FROM yucer_svc;
REVOKE DELETE ON yucer_delivery.ageing_policy FROM yucer_svc;
REVOKE DELETE ON yucer_core.market_scope FROM yucer_svc;
