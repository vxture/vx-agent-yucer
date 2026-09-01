-- 0021_sales_org_roles.sql - the two rungs the sales ladder was missing.
--
-- Authority for the contents: docs/20-specs/50-role-permission-catalog.md. This
-- file and that document must be changed together, and app/authz/catalog.ts
-- mirrors both - catalog.test.ts parses this seed and fails on any drift, in
-- both directions.
--
-- WHY: the owner's ruling of 2026-09-01 - the product defines its own roles,
-- independent of the platform, and named 大区总监 / 总经理 / 销售经理 as the
-- shapes a sales organisation actually has. The catalogue had seven roles named
-- by FUNCTION (sales_leader / sales_rep / sales_ops) and nothing between a rep
-- and the person who runs the whole sales organisation.
--
-- TWO ROLES, NOT THREE, and the third is worth stating rather than inventing:
-- 总经理 is `sales_leader` as it already exists. It holds admin.manage,
-- copilot.autopilot and strategy.approve - everything the top of a sales
-- organisation holds - so a third role would carry an IDENTICAL permission set
-- under a different code. A catalogue with two codes and one answer is a
-- catalogue that lies about having made a distinction. If the org title is
-- wanted on screen, that is a label change (ROLE_LABEL), not a role.
--
-- WHAT ACTUALLY DISTINGUISHES THE TWO NEW ONES, on the permission axis:
--
--   sales_manager       a rep who COMMITS A NUMBER UPWARD. The catalogue
--                       already draws exactly this line one level down -
--                       sales_rep holds pipeline.write WITHOUT
--                       pipeline.forecast, commented "owns the deal, not the
--                       forecast commitment". A first-line manager is the
--                       person who makes that commitment.
--
--   regional_director   a manager who may APPROVE BELOW THE FLOOR and SET THE
--                       TARGETS their region is measured against. Note it does
--                       NOT get catalog.price: approving a discount against the
--                       floor and deciding where the floor sits are different
--                       acts, and the second stays with sales_ops and
--                       sales_leader (ADR-019).
--
-- NEITHER GETS admin.manage, copilot.autopilot or strategy.approve. Running the
-- sales organisation and administering the workspace are not the same job, and
-- the roles that hold those three are unchanged.
--
-- NO NEW PERMISSIONS. Every code granted here already exists, so the permission
-- catalogue does not grow - only the role catalogue and the grants do. That is
-- the honest shape of this change: the product did not gain a new thing anyone
-- may do, it gained two places to stand.
--
-- WHAT THIS DOES NOT DO, and it is the thing to remember when reading the role
-- names: THERE IS NO DATA SCOPE IN THIS PRODUCT. `listPipeline` passes its gate
-- and returns every opportunity in the workspace; the filter is supplied by the
-- interface, not enforced. So a regional director sees the same rows a sales
-- manager sees - the whole workspace - and the distinguishing feature of a
-- REGION is exactly the scope this product does not have yet. The owner ruled
-- roles first, scope next (2026-09-01). Until that batch lands, these two roles
-- differ in what they may DO and not in what they may SEE.
--
-- Idempotent: re-applying is a no-op.

-- --- The roles (catalog grows 7 -> 9) ---------------------------------------
INSERT INTO local_authz.role (role_code, name) VALUES
  ('sales_manager', 'Sales manager - owns a team and commits its forecast'),
  ('regional_director', 'Regional director - approves below the floor and sets the region target')
ON CONFLICT (role_code) DO NOTHING;

-- --- The grants (84 -> 115) -------------------------------------------------
-- Listed literally, in the same shape 0001 and 0002 use: a permission is granted
-- to a named role, never swept in by a pattern. Reading this block should be
-- enough to know exactly what each role can do.
INSERT INTO local_authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  -- sales_manager: everything a rep holds, plus the forecast commitment and
  -- enough of planning to read the target being committed against.
  ('sales_manager', 'account.read'),
  ('sales_manager', 'account.write'),
  ('sales_manager', 'account.record'),
  ('sales_manager', 'signal.read'),
  ('sales_manager', 'signal.triage'),
  ('sales_manager', 'pipeline.read'),
  ('sales_manager', 'pipeline.write'),
  ('sales_manager', 'pipeline.forecast'),
  ('sales_manager', 'delivery.read'),
  ('sales_manager', 'campaign.read'),
  ('sales_manager', 'copilot.use'),
  ('sales_manager', 'copilot.decide'),
  ('sales_manager', 'catalog.read'),
  ('sales_manager', 'planning.read'),

  -- regional_director: the manager's set, plus discount approval, target
  -- setting, and reading the strategy the targets come from.
  ('regional_director', 'account.read'),
  ('regional_director', 'account.write'),
  ('regional_director', 'account.record'),
  ('regional_director', 'signal.read'),
  ('regional_director', 'signal.triage'),
  ('regional_director', 'pipeline.read'),
  ('regional_director', 'pipeline.write'),
  ('regional_director', 'pipeline.forecast'),
  ('regional_director', 'pipeline.discount'),
  ('regional_director', 'delivery.read'),
  ('regional_director', 'campaign.read'),
  ('regional_director', 'copilot.use'),
  ('regional_director', 'copilot.decide'),
  ('regional_director', 'catalog.read'),
  ('regional_director', 'planning.read'),
  ('regional_director', 'planning.write'),
  ('regional_director', 'strategy.read')
) AS grants(role_code, perm_code)
JOIN local_authz.role r ON r.role_code = grants.role_code
JOIN local_authz.permission p ON p.perm_code = grants.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
