-- 0002_strategy_approve_permission.sql - split approving a plan from editing one.
--
-- Authority for the contents: docs/20-specs/50-role-permission-catalog.md. This
-- file and that document must be changed together.
--
-- WHY: `strategy.plan.approve` has existed as an ACTION id since the catalog was
-- written, but it resolved to `strategy.write` - the same permission as
-- `strategy.plan.update`. So the separation was nominal: anyone who could edit a
-- plan could also sign it off, and `strategy.write` is held by BOTH sales_leader
-- and marketing_manager, which meant a marketing manager could approve the sales
-- organisation's own commitment.
--
-- Approval is the moment a plan stops being a draft and becomes the number the
-- rest of the chain is measured against - strategy_plan.approved_at stamps it,
-- and every downstream report reads from it. That is a different act from
-- editing, and the catalog already draws exactly this distinction one level
-- down: sales_rep holds pipeline.write WITHOUT pipeline.forecast, commented
-- "owns the deal, not the forecast commitment". This is the same shape applied
-- to the plan.
--
-- Granted to sales_leader ONLY. marketing_manager keeps strategy.write and can
-- still author and revise a plan; it simply cannot be the one to commit the
-- sales organisation to it.
--
-- Idempotent: re-applying is a no-op.

-- --- The permission (catalog grows 19 -> 20) --------------------------------
INSERT INTO local_authz.permission (perm_code, name) VALUES
  ('strategy.approve', 'Approve a strategy plan - the moment it becomes a commitment')
ON CONFLICT (perm_code) DO NOTHING;

-- --- The grant (67 -> 68) ---------------------------------------------------
-- Listed literally, in the same shape 0001 uses: a permission is granted to a
-- named role, never swept in by a pattern.
INSERT INTO local_authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('sales_leader', 'strategy.approve')
) AS grants(role_code, perm_code)
JOIN local_authz.role r ON r.role_code = grants.role_code
JOIN local_authz.permission p ON p.perm_code = grants.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
