-- 0046_workspace_role.sql - 角色管理: a role belongs to the workspace, the
-- seeded nine become 预置角色, and a member's role is the workspace's own row.
--
-- THE RULING (owner, 2026-09-09): 角色页面，支持新建，排序，授权。按照区域设定
-- 模式，有系统预置角色，可以自定义。
--
-- WHAT WAS TRUE BEFORE. local_authz.role held nine rows with no workspace on
-- them, role_permission held their grants, and both were runtime-read-only:
-- a role was a fact of the BUILD, the same for every tenant, and the only way
-- to change what 销售经理 may do was a numbered increment. That was the honest
-- shape while roles were closed. They are open now, the way 大区 are: a
-- workspace starts from what ships and edits from there.
--
-- WHAT THIS LEAVES BEHIND, in four parts - the same shape as 0045's regions:
--
-- 1. local_authz.role / role_permission STAY, as the 预置角色 - the template a
--    workspace is materialised from and reset to. They gain sort_order (the
--    order the catalogue lists them) and remain read-only to the service.
--
-- 2. local_authz.workspace_role - one row per (workspace, role_code): the
--    tenant's roles, preset copies and their own alike. role_code is the
--    anchor (never rewritten; the same lock as market_division.division_code),
--    name and sort_order are theirs.
--
-- 3. local_authz.workspace_role_permission - which permissions a workspace
--    role holds. The permission catalogue itself stays seeded and closed
--    (owner: 权限当前全部为预置功能，不可增删改); what is open is which role
--    holds which.
--
-- 4. local_authz.member_role.role_id now names a workspace_role row. Every
--    workspace that has a member gets the nine presets materialised here, and
--    every existing link is re-pointed at its workspace's own copy - so no
--    member loses a role, and a tenant that edits 销售经理 edits nobody else's.
--    ON DELETE RESTRICT: a role somebody holds cannot be deleted, which is the
--    service's own refusal (role_in_use) said by the database.
--
-- A workspace seen for the FIRST TIME after this increment gets its presets
-- from the application (AuthzStore.seedPresetRoles, on the first sighting),
-- copied from tables 1 - the same rows, by the same rule.
--
-- Idempotent throughout.

-- ============================================================================
-- 1. The presets carry their order, and the name and description a copy starts with
-- ============================================================================
-- THE NAME IS DATA NOW. 0001 seeded English names nothing ever read - every
-- screen printed ROLE_LABEL by code. A workspace copy carries its own name
-- column and prints THAT, so the preset it is copied from has to carry the
-- name the product shows, in the product's language; the same rule 0045's
-- carve tables follow (华东 is a column, not copy). authz/catalog.ts mirrors
-- these nine names and catalog.test.ts holds the two in lockstep.
ALTER TABLE local_authz.role ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
-- One sentence on what the role is FOR (owner, 2026-09-09: 给出最简单的角色
-- 描述) - the roster prints this beside the count, not the grants.
ALTER TABLE local_authz.role ADD COLUMN IF NOT EXISTS description VARCHAR(500) NOT NULL DEFAULT '';

UPDATE local_authz.role r SET name = v.name, description = v.description, sort_order = v.ord
FROM (VALUES
  ('sales_leader',       '销售负责人',    '统管销售全链路：审批计划、签批折扣、开启自动执行、管理配置。', 1),
  ('marketing_manager',  '市场经理',     '负责战役与信号处置，直到线索交接；不改商机。', 2),
  ('sales_rep',          '销售代表',     '跟进客户与商机，推进阶段；不提交预测。', 3),
  ('presales',           '售前顾问',     '配合方案与客户资料；商机与项目只读。', 4),
  ('delivery_manager',   '交付经理',     '管理交付项目、里程碑与回款；客户与商机只读。', 5),
  ('sales_ops',          '销售运营',     '定口径、管配额与角色、设底价；不改商机。', 6),
  ('viewer',             '只读成员',     '各模块只读，可向助手提问。', 7),
  ('sales_manager',      '销售经理',     '带团队推进商机，提交预测；不签批折扣。', 8),
  ('regional_director',  '大区总监',     '统管一个大区的规划与商机，可签批折扣。', 9)
) AS v(code, name, description, ord)
WHERE r.role_code = v.code
  AND (r.name <> v.name OR r.description <> v.description OR r.sort_order <> v.ord);

-- ============================================================================
-- 2. workspace_role
-- ============================================================================
CREATE TABLE IF NOT EXISTS local_authz.workspace_role (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  -- The anchor: a preset's code where it was copied from one, the tenant's
  -- own word otherwise. Lower-case identifier shape, like the seeded nine.
  role_code     VARCHAR(64) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  description   VARCHAR(500) NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_workspace_role_code UNIQUE (workspace_id, role_code),
  CONSTRAINT chk_workspace_role_code CHECK (role_code ~ '^[a-z][a-z0-9_]{0,63}$')
);

-- Created after 97 ran, so the grants ship here (incr/README.md). The code is
-- the anchor and is NOT in the UPDATE list - the same lock 0036 put on
-- market_division.division_code, for the same reason: every member link and
-- every reset keys on it.
GRANT SELECT, INSERT, DELETE ON local_authz.workspace_role TO yucer_svc;
REVOKE UPDATE ON local_authz.workspace_role FROM yucer_svc;
GRANT UPDATE (name, description, sort_order, updated_at) ON local_authz.workspace_role TO yucer_svc;

-- ============================================================================
-- 3. workspace_role_permission
-- ============================================================================
CREATE TABLE IF NOT EXISTS local_authz.workspace_role_permission (
  workspace_role_id  UUID NOT NULL,
  permission_id      UUID NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_workspace_role_permission PRIMARY KEY (workspace_role_id, permission_id),
  -- A role's grants go with the role; a permission somebody holds stays in
  -- the catalogue (the catalogue is seeded and never deleted from anyway).
  CONSTRAINT fk_workspace_role_permission_role FOREIGN KEY (workspace_role_id)
    REFERENCES local_authz.workspace_role (id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_role_permission_permission FOREIGN KEY (permission_id)
    REFERENCES local_authz.permission (id) ON DELETE RESTRICT
);

-- A link table: insert and delete only, like member_role beside it.
GRANT SELECT, INSERT, DELETE ON local_authz.workspace_role_permission TO yucer_svc;
REVOKE UPDATE ON local_authz.workspace_role_permission FROM yucer_svc;

-- ============================================================================
-- 4. Materialise the presets where there are members, and re-point the links
-- ============================================================================
-- Every workspace that has ever seen a member gets the nine, with their
-- grants, in ONE statement so a re-run (which inserts nothing) also grants
-- nothing - a tenant that later empties a role must not find it refilled.
WITH made AS (
  INSERT INTO local_authz.workspace_role (workspace_id, role_code, name, description, sort_order)
  SELECT w.workspace_id, r.role_code, r.name, r.description, r.sort_order
    FROM (SELECT DISTINCT workspace_id FROM local_authz.member) AS w
    CROSS JOIN local_authz.role r
  ON CONFLICT (workspace_id, role_code) DO NOTHING
  RETURNING id, role_code
)
INSERT INTO local_authz.workspace_role_permission (workspace_role_id, permission_id)
SELECT made.id, rp.permission_id
  FROM made
  JOIN local_authz.role r ON r.role_code = made.role_code
  JOIN local_authz.role_permission rp ON rp.role_id = r.id
ON CONFLICT DO NOTHING;

-- The link used to name a preset row; it names the workspace's copy now. A
-- link already re-pointed matches no preset id and is left alone.
ALTER TABLE local_authz.member_role DROP CONSTRAINT IF EXISTS fk_member_role_role;

UPDATE local_authz.member_role mr SET role_id = wr.id
  FROM local_authz.member m, local_authz.role r, local_authz.workspace_role wr
 WHERE mr.member_id = m.id
   AND mr.role_id = r.id
   AND wr.workspace_id = m.workspace_id
   AND wr.role_code = r.role_code;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_member_role_workspace_role'
  ) THEN
    ALTER TABLE local_authz.member_role
      ADD CONSTRAINT fk_member_role_workspace_role FOREIGN KEY (role_id)
        REFERENCES local_authz.workspace_role (id) ON DELETE RESTRICT;
  END IF;
END $$;
