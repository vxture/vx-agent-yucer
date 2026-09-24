-- 0081_propagate_preset_grants.sql - carry two permissions from the preset
-- roles into every workspace's own copies.
--
-- THE DEFECT. Since incr/0046 a member's permissions are read ONLY from their
-- workspace's copy of a role (local_authz.workspace_role_permission - see
-- authz/prisma-store.ts permissionsOf). A copy is made once, when a workspace
-- is materialised (0046) or first seeded (seedPresetRoles), from the presets
-- as they stood then. Two later increments granted a new permission to the
-- PRESETS only:
--
--   0063  pipeline.opportunityConfig  (/admin/opportunity's one write gate)
--   0074  account.collaborator        (协作人 on the customer page)
--
-- so every workspace that existed before them never received it: the page
-- and the button refuse members the catalogue says hold it. A workspace
-- seeded afterwards was fine, which is why no fresh-database test saw it.
-- (0059 pipeline.stage and 0061 pipeline.dealType had the same shape; 0063
-- retired both, so nothing reads them and they are not carried.)
--
-- THE RULE: a copy of preset X receives exactly X's grant of these two
-- permissions - the same pairs the presets already carry, nothing wider. A
-- tenant's own roles (no preset of the same code) are untouched. A copy an
-- admin later edited could not have removed a grant it never had, so adding
-- it overrides no decision anyone made.
--
-- Found before the 2026-09-24 release (0073-0080), which would have shipped
-- 协作人 unusable in production. Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO local_authz.workspace_role_permission (workspace_role_id, permission_id)
SELECT wr.id, rp.permission_id
  FROM local_authz.workspace_role wr
  JOIN local_authz.role r ON r.role_code = wr.role_code
  JOIN local_authz.role_permission rp ON rp.role_id = r.id
  JOIN local_authz.permission p ON p.id = rp.permission_id
 WHERE p.perm_code IN ('pipeline.opportunityConfig', 'account.collaborator')
ON CONFLICT DO NOTHING;
