-- 0001_seed_authz_catalog.sql - seed the yucer product role/permission catalog.
--
-- Authority for the contents: docs/20-specs/50-role-permission-catalog.md. This
-- file and that document must be changed together.
--
-- The catalog is DATA, not structure, but it ships through the same db-init
-- channel because local_authz.role / local_authz.permission are runtime-read-only
-- (98_column_locks.sql revokes UPDATE). A new permission is a new numbered
-- increment here, never an application write.
--
-- Fully idempotent: re-applying is a no-op (ON CONFLICT DO NOTHING throughout).
--
-- NOTE: these are PRODUCT FUNCTION roles. They are NOT the platform governance
-- role catalog (owner/manager/member/readonly/guest) and are deliberately not a
-- mirror of it.

-- --- Permissions (19) ------------------------------------------------------
INSERT INTO local_authz.permission (perm_code, name) VALUES
  ('strategy.read',      'View strategy'),
  ('strategy.write',     'Edit strategy and market segments'),
  ('planning.read',      'View planning'),
  ('planning.write',     'Edit territories and sales targets'),
  ('campaign.read',      'View campaigns'),
  ('campaign.write',     'Edit campaigns and executions'),
  ('account.read',       'View accounts'),
  ('account.write',      'Edit accounts, contacts and the relationship graph'),
  ('signal.read',        'View signals'),
  ('signal.triage',      'Triage signals - score, match, promote, dedup'),
  ('pipeline.read',      'View opportunities'),
  ('pipeline.write',     'Edit opportunities and advance stages'),
  ('pipeline.forecast',  'Submit forecast snapshots'),
  ('delivery.read',      'View delivery projects'),
  ('delivery.write',     'Edit milestones, tasks and revenue schedules'),
  ('copilot.use',        'Use the copilot - open sessions and ask'),
  ('copilot.decide',     'Accept or reject copilot proposed actions'),
  ('copilot.autopilot',  'Authorize copilot autonomous execution'),
  ('admin.manage',       'Product administration - role assignment and catalogs')
ON CONFLICT (perm_code) DO NOTHING;

-- --- Roles (7) -------------------------------------------------------------
INSERT INTO local_authz.role (role_code, name) VALUES
  ('sales_leader',      'Sales leader'),
  ('marketing_manager', 'Marketing manager'),
  ('sales_rep',         'Sales representative'),
  ('presales',          'Presales / solution'),
  ('delivery_manager',  'Delivery manager'),
  ('sales_ops',         'Sales operations'),
  ('viewer',            'Read-only viewer')
ON CONFLICT (role_code) DO NOTHING;

-- --- Role -> permission grants (67 pairs) ----------------------------------
-- Listed literally rather than derived by pattern: a future permission must be
-- granted deliberately, never swept in by a LIKE '%.read' style rule.
INSERT INTO local_authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  -- sales_leader: every permission (19)
  ('sales_leader', 'strategy.read'),
  ('sales_leader', 'strategy.write'),
  ('sales_leader', 'planning.read'),
  ('sales_leader', 'planning.write'),
  ('sales_leader', 'campaign.read'),
  ('sales_leader', 'campaign.write'),
  ('sales_leader', 'account.read'),
  ('sales_leader', 'account.write'),
  ('sales_leader', 'signal.read'),
  ('sales_leader', 'signal.triage'),
  ('sales_leader', 'pipeline.read'),
  ('sales_leader', 'pipeline.write'),
  ('sales_leader', 'pipeline.forecast'),
  ('sales_leader', 'delivery.read'),
  ('sales_leader', 'delivery.write'),
  ('sales_leader', 'copilot.use'),
  ('sales_leader', 'copilot.decide'),
  ('sales_leader', 'copilot.autopilot'),
  ('sales_leader', 'admin.manage'),
  -- marketing_manager: demand side up to lead handoff (10)
  ('marketing_manager', 'strategy.read'),
  ('marketing_manager', 'strategy.write'),
  ('marketing_manager', 'campaign.read'),
  ('marketing_manager', 'campaign.write'),
  ('marketing_manager', 'signal.read'),
  ('marketing_manager', 'signal.triage'),
  ('marketing_manager', 'account.read'),
  ('marketing_manager', 'pipeline.read'),
  ('marketing_manager', 'copilot.use'),
  ('marketing_manager', 'copilot.decide'),
  -- sales_rep: owns the deal, not the forecast commitment (10)
  ('sales_rep', 'account.read'),
  ('sales_rep', 'account.write'),
  ('sales_rep', 'signal.read'),
  ('sales_rep', 'signal.triage'),
  ('sales_rep', 'pipeline.read'),
  ('sales_rep', 'pipeline.write'),
  ('sales_rep', 'delivery.read'),
  ('sales_rep', 'campaign.read'),
  ('sales_rep', 'copilot.use'),
  ('sales_rep', 'copilot.decide'),
  -- presales (5)
  ('presales', 'account.read'),
  ('presales', 'account.write'),
  ('presales', 'pipeline.read'),
  ('presales', 'delivery.read'),
  ('presales', 'copilot.use'),
  -- delivery_manager (6)
  ('delivery_manager', 'delivery.read'),
  ('delivery_manager', 'delivery.write'),
  ('delivery_manager', 'account.read'),
  ('delivery_manager', 'pipeline.read'),
  ('delivery_manager', 'copilot.use'),
  ('delivery_manager', 'copilot.decide'),
  -- sales_ops: sets the rules, does not edit the deals (9)
  ('sales_ops', 'planning.read'),
  ('sales_ops', 'planning.write'),
  ('sales_ops', 'pipeline.read'),
  ('sales_ops', 'pipeline.forecast'),
  ('sales_ops', 'account.read'),
  ('sales_ops', 'campaign.read'),
  ('sales_ops', 'strategy.read'),
  ('sales_ops', 'admin.manage'),
  ('sales_ops', 'copilot.use'),
  -- viewer: reads plus asking the copilot (8)
  ('viewer', 'strategy.read'),
  ('viewer', 'planning.read'),
  ('viewer', 'campaign.read'),
  ('viewer', 'account.read'),
  ('viewer', 'signal.read'),
  ('viewer', 'pipeline.read'),
  ('viewer', 'delivery.read'),
  ('viewer', 'copilot.use')
) AS grants(role_code, perm_code)
JOIN local_authz.role r ON r.role_code = grants.role_code
JOIN local_authz.permission p ON p.perm_code = grants.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;
