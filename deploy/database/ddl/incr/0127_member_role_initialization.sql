-- Separate first-use role assignment from subsequent administrator decisions.
BEGIN;
ALTER TABLE local_authz.member ADD COLUMN role_setup_complete BOOLEAN NOT NULL DEFAULT false;
UPDATE local_authz.member m SET role_setup_complete = true
WHERE m.status <> 'active'
   OR EXISTS (SELECT 1 FROM local_authz.member_role mr WHERE mr.member_id = m.id)
   OR EXISTS (SELECT 1 FROM local_audit.event e
              WHERE e.workspace_id = m.workspace_id AND e.object_type = 'member'
                AND e.object_id = m.sub AND e.outcome = 'success'
                AND e.action IN ('admin.member.role.assign', 'admin.member.role.revoke',
                                 'admin.member.deactivate', 'admin.member.reactivate'));
GRANT UPDATE (role_setup_complete) ON local_authz.member TO yucer_svc;
COMMIT;
