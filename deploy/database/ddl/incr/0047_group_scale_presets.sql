-- 0047_group_scale_presets.sql - 集团级预置角色: twenty-four presets on a
-- ladder, and every role says which business line it serves and what rung
-- it stands on - two vocabularies the workspace owns.
--
-- THE RULING (owner, 2026-09-09): 角色名称需要普遍适用，不自定义也够用；按集团级
-- 公司规模重新设计；保留销售代表，增加销售经理、高级销售经理，保留大区总监，增加
-- 大区总经理、高级渠道经理、交付经理、高级交付经理；继续细化，目标是尽量减少用户
-- 自定义。采用，建 incr/0047，增加两个分组字段，一个按业务，一个按层级。数据库不要
-- 写死，支持自定义（参考区域设置）。
--
-- WHAT THIS LEAVES BEHIND:
--
-- 1. local_authz.role_line and role_rank - the two groupings as VOCABULARIES,
--    one row per (workspace, code), the shape yucer_core.industry has (0040):
--    a code that anchors, a name the tenant may change, an order. The shipped
--    eight lines and six rungs are seeded into every workspace that has
--    roles (guarded on an EMPTY vocabulary, so a tenant's deletions never
--    resurrect), and a tenant adds, renames, re-orders and deletes its own -
--    deletion refused while a role stands in the group (RESTRICT).
--
-- 2. local_authz.workspace_role relates to both BY ID (line_id, rank_id) -
--    the owner's standing rule since 0045: a code is never an internal key.
--    Nullable: a role the tenant made before this increment has no group
--    until somebody chooses one, and the roster says so.
--
-- 3. Fifteen presets join the nine (24 in all) in local_authz.role, each
--    rung adding something concrete to the one below it - no two presets
--    hold the same set. The preset carries its line and rung as CODES into
--    the shipped vocabulary (a template is global; the vocabulary is the
--    workspace's), resolved to ids when a workspace is materialised.
--    sales_ops reads 销售运营经理 now that a 销售运营专员 stands under it.
--
-- 4. Every workspace that already has roles receives the fifteen new presets
--    and its existing preset copies learn their group. Their names,
--    sentences and grants are NOT touched; 重置预置 is the way back.
--
-- The permission catalogue is unchanged: 25 codes, closed.
-- Idempotent throughout.

-- ============================================================================
-- 1. The two vocabularies
-- ============================================================================
CREATE TABLE IF NOT EXISTS local_authz.role_line (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  line_code     VARCHAR(32) NOT NULL,                 -- anchor, immutable
  name          VARCHAR(64) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_role_line_code UNIQUE (workspace_id, line_code),
  CONSTRAINT chk_role_line_code CHECK (line_code ~ '^[a-z][a-z0-9_]{0,31}$')
);
CREATE INDEX IF NOT EXISTS idx_role_line_ws_sort ON local_authz.role_line (workspace_id, sort_order);

CREATE TABLE IF NOT EXISTS local_authz.role_rank (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref] isolation key
  rank_code     VARCHAR(32) NOT NULL,                 -- anchor, immutable
  name          VARCHAR(64) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_role_rank_code UNIQUE (workspace_id, rank_code),
  CONSTRAINT chk_role_rank_code CHECK (rank_code ~ '^[a-z][a-z0-9_]{0,31}$')
);
CREATE INDEX IF NOT EXISTS idx_role_rank_ws_sort ON local_authz.role_rank (workspace_id, sort_order);

-- Created after 97 ran: the grants ship here. The code is the anchor.
GRANT SELECT, INSERT, DELETE ON local_authz.role_line TO yucer_svc;
GRANT UPDATE (name, sort_order, updated_at) ON local_authz.role_line TO yucer_svc;
GRANT SELECT, INSERT, DELETE ON local_authz.role_rank TO yucer_svc;
GRANT UPDATE (name, sort_order, updated_at) ON local_authz.role_rank TO yucer_svc;

-- The shipped lists, into every workspace that has roles, guarded on an
-- EMPTY vocabulary (the 0029 / 0037 / 0039 / 0040 guard).
INSERT INTO local_authz.role_line (workspace_id, line_code, name, sort_order)
SELECT w.workspace_id, v.code, v.name, v.ord
  FROM (SELECT DISTINCT workspace_id FROM local_authz.workspace_role) w
 CROSS JOIN (VALUES
   ('group',             '集团与通用',             1),
   ('sales',             '销售',                2),
   ('channel',           '渠道',                3),
   ('delivery',          '交付',                4),
   ('presales',          '售前',                5),
   ('marketing',         '市场',                6),
   ('ops',               '运营',                7),
   ('account',           '客户与商机开发',           8)
 ) AS v(code, name, ord)
 WHERE NOT EXISTS (SELECT 1 FROM local_authz.role_line l WHERE l.workspace_id = w.workspace_id)
ON CONFLICT (workspace_id, line_code) DO NOTHING;

INSERT INTO local_authz.role_rank (workspace_id, rank_code, name, sort_order)
SELECT w.workspace_id, v.code, v.name, v.ord
  FROM (SELECT DISTINCT workspace_id FROM local_authz.workspace_role) w
 CROSS JOIN (VALUES
   ('staff',             '专员 / 代表',           1),
   ('manager',           '经理',                2),
   ('senior',            '高级经理',              3),
   ('director',          '总监',                4),
   ('general_manager',   '总经理',               5),
   ('executive',         '高管',                6)
 ) AS v(code, name, ord)
 WHERE NOT EXISTS (SELECT 1 FROM local_authz.role_rank r WHERE r.workspace_id = w.workspace_id)
ON CONFLICT (workspace_id, rank_code) DO NOTHING;

-- ============================================================================
-- 2. The role relates to both, by id
-- ============================================================================
ALTER TABLE local_authz.workspace_role ADD COLUMN IF NOT EXISTS line_id UUID;
ALTER TABLE local_authz.workspace_role ADD COLUMN IF NOT EXISTS rank_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_workspace_role_line') THEN
    ALTER TABLE local_authz.workspace_role ADD CONSTRAINT fk_workspace_role_line
      FOREIGN KEY (line_id) REFERENCES local_authz.role_line (id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_workspace_role_rank') THEN
    ALTER TABLE local_authz.workspace_role ADD CONSTRAINT fk_workspace_role_rank
      FOREIGN KEY (rank_id) REFERENCES local_authz.role_rank (id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_workspace_role_ws_line ON local_authz.workspace_role (workspace_id, line_id);
CREATE INDEX IF NOT EXISTS idx_workspace_role_ws_rank ON local_authz.workspace_role (workspace_id, rank_id);

-- The tenant may change both on its copy; the code stays locked (0046).
-- Restated whole: REVOKE resets, then the full list.
REVOKE UPDATE ON local_authz.workspace_role FROM yucer_svc;
GRANT UPDATE (name, description, line_id, rank_id, sort_order, updated_at)
  ON local_authz.workspace_role TO yucer_svc;

-- ============================================================================
-- 3. Fifteen presets join the nine
-- ============================================================================
-- The template's group, as codes into the shipped vocabulary. No CHECK list
-- here on purpose (owner: 不要写死): the vocabulary is the workspace's, and
-- catalog.test.ts holds these codes to the shipped rows above.
ALTER TABLE local_authz.role ADD COLUMN IF NOT EXISTS business_line VARCHAR(32) NOT NULL DEFAULT 'sales';
ALTER TABLE local_authz.role ADD COLUMN IF NOT EXISTS rank VARCHAR(32) NOT NULL DEFAULT 'staff';

-- --- Roles (15) ------------------------------------------------------------
INSERT INTO local_authz.role (role_code, name) VALUES
  ('executive',                 'Executive'),
  ('finance',                   'Finance'),
  ('workspace_admin',           'Workspace administrator'),
  ('senior_sales_manager',      'Senior sales manager'),
  ('regional_general_manager',  'Regional general manager'),
  ('channel_manager',           'Channel manager'),
  ('senior_channel_manager',    'Senior channel manager'),
  ('senior_delivery_manager',   'Senior delivery manager'),
  ('senior_presales',           'Senior presales'),
  ('marketing_specialist',      'Marketing specialist'),
  ('sales_ops_specialist',      'Sales operations specialist'),
  ('key_account_manager',       'Key account manager'),
  ('sdr',                       'Sales development representative'),
  ('deal_desk',                 'Deal desk'),
  ('customer_success',          'Customer success manager')
ON CONFLICT (role_code) DO NOTHING;

-- --- Role -> permission grants (170 pairs) ---------------------------------
-- Listed literally, like every increment before: a permission is granted
-- deliberately, per role, never swept in by pattern.
INSERT INTO local_authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('executive', 'strategy.read'),
  ('executive', 'planning.read'),
  ('executive', 'campaign.read'),
  ('executive', 'account.read'),
  ('executive', 'signal.read'),
  ('executive', 'pipeline.read'),
  ('executive', 'delivery.read'),
  ('executive', 'catalog.read'),
  ('executive', 'strategy.approve'),
  ('executive', 'copilot.use'),
  ('executive', 'copilot.decide'),
  ('finance', 'strategy.read'),
  ('finance', 'planning.read'),
  ('finance', 'campaign.read'),
  ('finance', 'account.read'),
  ('finance', 'signal.read'),
  ('finance', 'pipeline.read'),
  ('finance', 'delivery.read'),
  ('finance', 'catalog.read'),
  ('finance', 'catalog.price'),
  ('finance', 'pipeline.discount'),
  ('finance', 'copilot.use'),
  ('workspace_admin', 'strategy.read'),
  ('workspace_admin', 'planning.read'),
  ('workspace_admin', 'campaign.read'),
  ('workspace_admin', 'account.read'),
  ('workspace_admin', 'signal.read'),
  ('workspace_admin', 'pipeline.read'),
  ('workspace_admin', 'delivery.read'),
  ('workspace_admin', 'catalog.read'),
  ('workspace_admin', 'admin.manage'),
  ('workspace_admin', 'copilot.use'),
  ('senior_sales_manager', 'account.read'),
  ('senior_sales_manager', 'account.write'),
  ('senior_sales_manager', 'account.record'),
  ('senior_sales_manager', 'signal.read'),
  ('senior_sales_manager', 'signal.triage'),
  ('senior_sales_manager', 'pipeline.read'),
  ('senior_sales_manager', 'pipeline.write'),
  ('senior_sales_manager', 'pipeline.forecast'),
  ('senior_sales_manager', 'delivery.read'),
  ('senior_sales_manager', 'campaign.read'),
  ('senior_sales_manager', 'copilot.use'),
  ('senior_sales_manager', 'copilot.decide'),
  ('senior_sales_manager', 'catalog.read'),
  ('senior_sales_manager', 'planning.read'),
  ('senior_sales_manager', 'pipeline.discount'),
  ('senior_sales_manager', 'strategy.read'),
  ('regional_general_manager', 'account.read'),
  ('regional_general_manager', 'account.write'),
  ('regional_general_manager', 'account.record'),
  ('regional_general_manager', 'signal.read'),
  ('regional_general_manager', 'signal.triage'),
  ('regional_general_manager', 'pipeline.read'),
  ('regional_general_manager', 'pipeline.write'),
  ('regional_general_manager', 'pipeline.forecast'),
  ('regional_general_manager', 'pipeline.discount'),
  ('regional_general_manager', 'delivery.read'),
  ('regional_general_manager', 'campaign.read'),
  ('regional_general_manager', 'copilot.use'),
  ('regional_general_manager', 'copilot.decide'),
  ('regional_general_manager', 'catalog.read'),
  ('regional_general_manager', 'planning.read'),
  ('regional_general_manager', 'planning.write'),
  ('regional_general_manager', 'strategy.read'),
  ('regional_general_manager', 'strategy.write'),
  ('regional_general_manager', 'strategy.approve'),
  ('regional_general_manager', 'campaign.write'),
  ('regional_general_manager', 'delivery.write'),
  ('channel_manager', 'account.read'),
  ('channel_manager', 'account.write'),
  ('channel_manager', 'signal.read'),
  ('channel_manager', 'pipeline.read'),
  ('channel_manager', 'pipeline.write'),
  ('channel_manager', 'delivery.read'),
  ('channel_manager', 'campaign.read'),
  ('channel_manager', 'copilot.use'),
  ('channel_manager', 'copilot.decide'),
  ('channel_manager', 'catalog.read'),
  ('channel_manager', 'account.record'),
  ('senior_channel_manager', 'account.read'),
  ('senior_channel_manager', 'account.write'),
  ('senior_channel_manager', 'signal.read'),
  ('senior_channel_manager', 'pipeline.read'),
  ('senior_channel_manager', 'pipeline.write'),
  ('senior_channel_manager', 'delivery.read'),
  ('senior_channel_manager', 'campaign.read'),
  ('senior_channel_manager', 'copilot.use'),
  ('senior_channel_manager', 'copilot.decide'),
  ('senior_channel_manager', 'catalog.read'),
  ('senior_channel_manager', 'account.record'),
  ('senior_channel_manager', 'pipeline.forecast'),
  ('senior_channel_manager', 'planning.read'),
  ('senior_channel_manager', 'campaign.write'),
  ('senior_channel_manager', 'pipeline.discount'),
  ('senior_delivery_manager', 'delivery.read'),
  ('senior_delivery_manager', 'delivery.write'),
  ('senior_delivery_manager', 'account.read'),
  ('senior_delivery_manager', 'pipeline.read'),
  ('senior_delivery_manager', 'copilot.use'),
  ('senior_delivery_manager', 'copilot.decide'),
  ('senior_delivery_manager', 'catalog.read'),
  ('senior_delivery_manager', 'account.record'),
  ('senior_delivery_manager', 'account.write'),
  ('senior_delivery_manager', 'planning.read'),
  ('senior_delivery_manager', 'strategy.read'),
  ('senior_presales', 'account.read'),
  ('senior_presales', 'account.write'),
  ('senior_presales', 'pipeline.read'),
  ('senior_presales', 'delivery.read'),
  ('senior_presales', 'copilot.use'),
  ('senior_presales', 'catalog.read'),
  ('senior_presales', 'account.record'),
  ('senior_presales', 'catalog.write'),
  ('senior_presales', 'strategy.read'),
  ('senior_presales', 'copilot.decide'),
  ('marketing_specialist', 'campaign.read'),
  ('marketing_specialist', 'campaign.write'),
  ('marketing_specialist', 'signal.read'),
  ('marketing_specialist', 'account.read'),
  ('marketing_specialist', 'catalog.read'),
  ('marketing_specialist', 'copilot.use'),
  ('sales_ops_specialist', 'planning.read'),
  ('sales_ops_specialist', 'pipeline.read'),
  ('sales_ops_specialist', 'pipeline.forecast'),
  ('sales_ops_specialist', 'strategy.read'),
  ('sales_ops_specialist', 'account.read'),
  ('sales_ops_specialist', 'campaign.read'),
  ('sales_ops_specialist', 'catalog.read'),
  ('sales_ops_specialist', 'copilot.use'),
  ('key_account_manager', 'account.read'),
  ('key_account_manager', 'account.write'),
  ('key_account_manager', 'signal.read'),
  ('key_account_manager', 'signal.triage'),
  ('key_account_manager', 'pipeline.read'),
  ('key_account_manager', 'pipeline.write'),
  ('key_account_manager', 'delivery.read'),
  ('key_account_manager', 'campaign.read'),
  ('key_account_manager', 'copilot.use'),
  ('key_account_manager', 'copilot.decide'),
  ('key_account_manager', 'catalog.read'),
  ('key_account_manager', 'account.record'),
  ('key_account_manager', 'pipeline.forecast'),
  ('key_account_manager', 'planning.read'),
  ('key_account_manager', 'strategy.read'),
  ('sdr', 'signal.read'),
  ('sdr', 'signal.triage'),
  ('sdr', 'account.read'),
  ('sdr', 'account.write'),
  ('sdr', 'account.record'),
  ('sdr', 'pipeline.read'),
  ('sdr', 'campaign.read'),
  ('sdr', 'catalog.read'),
  ('sdr', 'copilot.use'),
  ('deal_desk', 'pipeline.read'),
  ('deal_desk', 'pipeline.discount'),
  ('deal_desk', 'catalog.read'),
  ('deal_desk', 'catalog.price'),
  ('deal_desk', 'account.read'),
  ('deal_desk', 'copilot.use'),
  ('customer_success', 'account.read'),
  ('customer_success', 'account.write'),
  ('customer_success', 'account.record'),
  ('customer_success', 'delivery.read'),
  ('customer_success', 'delivery.write'),
  ('customer_success', 'pipeline.read'),
  ('customer_success', 'signal.read'),
  ('customer_success', 'catalog.read'),
  ('customer_success', 'copilot.use'),
  ('customer_success', 'copilot.decide')
) AS grants(role_code, perm_code)
JOIN local_authz.role r ON r.role_code = grants.role_code
JOIN local_authz.permission p ON p.perm_code = grants.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- --- Name, sentence, line, rung and roster order, for all 24 ---------------
-- authz/catalog.ts mirrors these rows and catalog.test.ts holds the two in
-- lockstep - the same discipline as the grants.
UPDATE local_authz.role r SET name = v.name, description = v.description,
  business_line = v.line, rank = v.rank, sort_order = v.ord
FROM (VALUES
  ('sales_leader',              '销售负责人',     '统管销售全链路：审批计划、签批折扣、开启自动执行、管理配置。', 'group', 'executive', 1),
  ('executive',                 '高管',        '看全局、审批计划、裁决助手建议；不编辑业务数据。', 'group', 'executive', 2),
  ('finance',                   '财务',        '看回款、商机与价目，管底价并签批折扣。', 'group', 'staff', 3),
  ('workspace_admin',           '系统管理员',     '配置工作区：成员、角色与各类目录；不碰业务数据。', 'group', 'staff', 4),
  ('viewer',                    '只读成员',      '各模块只读，可向助手提问。', 'group', 'staff', 5),
  ('sales_rep',                 '销售代表',      '跟进客户与商机，推进阶段；不提交预测。', 'sales', 'staff', 6),
  ('sales_manager',             '销售经理',      '带团队推进商机，提交预测；不签批折扣。', 'sales', 'manager', 7),
  ('senior_sales_manager',      '高级销售经理',    '带团队推进商机，提交预测，签批折扣，看战略。', 'sales', 'senior', 8),
  ('regional_director',         '大区总监',      '统管一个大区的规划与商机，可签批折扣。', 'sales', 'director', 9),
  ('regional_general_manager',  '大区总经理',     '经营一个大区：战略、规划、活动、商机与交付全链路。', 'sales', 'general_manager', 10),
  ('channel_manager',           '渠道经理',      '经营渠道伙伴与联合商机；不处置信号。', 'channel', 'manager', 11),
  ('senior_channel_manager',    '高级渠道经理',    '经营渠道体系：提交预测、编辑渠道活动、签批渠道折扣。', 'channel', 'senior', 12),
  ('delivery_manager',          '交付经理',      '管理交付项目、里程碑与回款；客户与商机只读。', 'delivery', 'manager', 13),
  ('senior_delivery_manager',   '高级交付经理',    '统管交付：维护客户主数据，看规划与战略。', 'delivery', 'senior', 14),
  ('presales',                  '售前顾问',      '配合方案与客户资料；商机与项目只读。', 'presales', 'staff', 15),
  ('senior_presales',           '高级售前顾问',    '统管方案：维护方案目录，看战略，裁决助手建议。', 'presales', 'senior', 16),
  ('marketing_specialist',      '市场专员',      '执行活动，看信号；不做处置。', 'marketing', 'staff', 17),
  ('marketing_manager',         '市场经理',      '负责战役与信号处置，直到线索交接；不改商机。', 'marketing', 'manager', 18),
  ('sales_ops_specialist',      '销售运营专员',    '看规划与预测口径，提交预测汇总；不改口径。', 'ops', 'staff', 19),
  ('sales_ops',                 '销售运营经理',    '定口径、管配额与角色、设底价、签批折扣；不改商机。', 'ops', 'manager', 20),
  ('key_account_manager',       '大客户经理',     '经营少数重点客户，可提交预测，看规划与战略。', 'account', 'manager', 21),
  ('sdr',                       '商机开发代表',    '处置信号、开发线索，交给销售；不推进商机。', 'account', 'staff', 22),
  ('deal_desk',                 '商务专员',      '审核报价与折扣，管底价。', 'account', 'staff', 23),
  ('customer_success',          '客户成功经理',    '签约后经营客户：跟进交付、续约与新需求。', 'account', 'manager', 24)
) AS v(code, name, description, line, rank, ord)
WHERE r.role_code = v.code
  AND (r.name <> v.name OR r.description <> v.description OR r.business_line <> v.line
       OR r.rank <> v.rank OR r.sort_order <> v.ord);

-- ============================================================================
-- 4. The workspaces that already have roles
-- ============================================================================
-- (a) Existing preset copies learn their group - the columns are new, so no
--     tenant can have chosen one yet. Name, sentence, grants and order stay
--     the tenant's. A copy whose workspace lacks the code (a deleted line)
--     stays ungrouped rather than guessing.
UPDATE local_authz.workspace_role w
   SET line_id = l.id, rank_id = k.id
  FROM local_authz.role r
  JOIN local_authz.role_line l ON l.line_code = r.business_line
  JOIN local_authz.role_rank k ON k.rank_code = r.rank
 WHERE w.role_code = r.role_code
   AND l.workspace_id = w.workspace_id AND k.workspace_id = w.workspace_id
   AND w.line_id IS NULL AND w.rank_id IS NULL;

-- (b) The fifteen new presets are copied into every workspace that has
--     roles, with their grants and their group, in ONE statement so a re-run
--     inserts and grants nothing. A workspace with no roles yet is
--     materialised whole on its first sighting, by the application.
WITH made AS (
  INSERT INTO local_authz.workspace_role (workspace_id, role_code, name, description, line_id, rank_id, sort_order)
  SELECT w.workspace_id, r.role_code, r.name, r.description, l.id, k.id, r.sort_order
    FROM (SELECT DISTINCT workspace_id FROM local_authz.workspace_role) AS w
    CROSS JOIN local_authz.role r
    LEFT JOIN local_authz.role_line l ON l.workspace_id = w.workspace_id AND l.line_code = r.business_line
    LEFT JOIN local_authz.role_rank k ON k.workspace_id = w.workspace_id AND k.rank_code = r.rank
  ON CONFLICT (workspace_id, role_code) DO NOTHING
  RETURNING id, role_code
)
INSERT INTO local_authz.workspace_role_permission (workspace_role_id, permission_id)
SELECT made.id, rp.permission_id
  FROM made
  JOIN local_authz.role r ON r.role_code = made.role_code
  JOIN local_authz.role_permission rp ON rp.role_id = r.id
ON CONFLICT DO NOTHING;
