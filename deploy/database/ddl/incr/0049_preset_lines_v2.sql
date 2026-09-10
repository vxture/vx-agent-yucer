-- 0049_preset_lines_v2.sql - 管理 line, seven more presets, five renames, and
-- the order the owner gave.
--
-- THE RULING (owner, 2026-09-10): 业务线把集团和通用改为管理，角色顺序：高管、销售
-- 负责人、财务管理员、系统管理员、只读成员。销售：大区总经理、大区销售总监、分公司
-- 总经理、销售总监、高级销售经理、销售经理、销售代表。渠道、交付、售前各增加负责人；
-- 市场：市场负责人、高级市场经理、市场专员；运营：运营负责人、高级运营经理、运营专员；
-- 客户与商机开发不变。
--
-- WHAT THIS LEAVES BEHIND:
-- 1. The shipped line `group` reads 管理. Workspace rows still carrying the
--    shipped name 集团与通用 follow; a renamed row is the tenant's.
-- 2. Seven presets join the 24 (31): 销售总监 takes the ladder set 大区总监
--    held; 大区销售总监 (renamed regional_director) and 分公司总经理 branch
--    from it - strategy.write + campaign.write, delivery.write +
--    campaign.write - so no two presets hold one set; a 负责人 heads 渠道 /
--    交付 / 售前 / 市场 / 运营. regional_director's own grant set widens by two,
--    on the template and on workspace copies still holding exactly the old
--    set.
-- 3. Five presets read differently: 财务 -> 财务管理员, 大区总监 -> 大区销售总监,
--    市场经理 -> 高级市场经理, 销售运营经理 -> 高级运营经理, 销售运营专员 -> 运营专员.
--    Workspace copies still carrying the old shipped name follow.
-- 4. Order (0048's rule): line first, rank from the top rung down, ties as
--    the owner listed them. Workspace copies follow only where the
--    workspace never re-ordered (every preset copy still at 0048's number).
-- Idempotent throughout.

-- ============================================================================
-- 1. 管理
-- ============================================================================
UPDATE local_authz.role_line SET name = '管理', updated_at = now()
 WHERE line_code = 'group' AND name = '集团与通用';

-- ============================================================================
-- 2. Seven presets, and 大区销售总监's two more grants
-- ============================================================================
-- --- Roles (7) -------------------------------------------------------------
INSERT INTO local_authz.role (role_code, name) VALUES
  ('sales_director',            'Sales director'),
  ('branch_general_manager',    'Branch general manager'),
  ('channel_head',              'Head of channel'),
  ('delivery_head',             'Head of delivery'),
  ('presales_head',             'Head of presales'),
  ('marketing_head',            'Head of marketing'),
  ('ops_head',                  'Head of operations')
ON CONFLICT (role_code) DO NOTHING;

-- --- Role -> permission grants (108 + 2 pairs) ---------------------------
INSERT INTO local_authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('sales_director', 'account.read'),
  ('sales_director', 'account.write'),
  ('sales_director', 'account.record'),
  ('sales_director', 'signal.read'),
  ('sales_director', 'signal.triage'),
  ('sales_director', 'pipeline.read'),
  ('sales_director', 'pipeline.write'),
  ('sales_director', 'pipeline.forecast'),
  ('sales_director', 'pipeline.discount'),
  ('sales_director', 'delivery.read'),
  ('sales_director', 'campaign.read'),
  ('sales_director', 'copilot.use'),
  ('sales_director', 'copilot.decide'),
  ('sales_director', 'catalog.read'),
  ('sales_director', 'planning.read'),
  ('sales_director', 'planning.write'),
  ('sales_director', 'strategy.read'),
  ('branch_general_manager', 'account.read'),
  ('branch_general_manager', 'account.write'),
  ('branch_general_manager', 'account.record'),
  ('branch_general_manager', 'signal.read'),
  ('branch_general_manager', 'signal.triage'),
  ('branch_general_manager', 'pipeline.read'),
  ('branch_general_manager', 'pipeline.write'),
  ('branch_general_manager', 'pipeline.forecast'),
  ('branch_general_manager', 'pipeline.discount'),
  ('branch_general_manager', 'delivery.read'),
  ('branch_general_manager', 'campaign.read'),
  ('branch_general_manager', 'copilot.use'),
  ('branch_general_manager', 'copilot.decide'),
  ('branch_general_manager', 'catalog.read'),
  ('branch_general_manager', 'planning.read'),
  ('branch_general_manager', 'planning.write'),
  ('branch_general_manager', 'strategy.read'),
  ('branch_general_manager', 'delivery.write'),
  ('branch_general_manager', 'campaign.write'),
  ('channel_head', 'account.read'),
  ('channel_head', 'account.write'),
  ('channel_head', 'signal.read'),
  ('channel_head', 'pipeline.read'),
  ('channel_head', 'pipeline.write'),
  ('channel_head', 'delivery.read'),
  ('channel_head', 'campaign.read'),
  ('channel_head', 'copilot.use'),
  ('channel_head', 'copilot.decide'),
  ('channel_head', 'catalog.read'),
  ('channel_head', 'account.record'),
  ('channel_head', 'pipeline.forecast'),
  ('channel_head', 'planning.read'),
  ('channel_head', 'campaign.write'),
  ('channel_head', 'pipeline.discount'),
  ('channel_head', 'planning.write'),
  ('channel_head', 'strategy.read'),
  ('delivery_head', 'delivery.read'),
  ('delivery_head', 'delivery.write'),
  ('delivery_head', 'account.read'),
  ('delivery_head', 'pipeline.read'),
  ('delivery_head', 'copilot.use'),
  ('delivery_head', 'copilot.decide'),
  ('delivery_head', 'catalog.read'),
  ('delivery_head', 'account.record'),
  ('delivery_head', 'account.write'),
  ('delivery_head', 'planning.read'),
  ('delivery_head', 'strategy.read'),
  ('delivery_head', 'planning.write'),
  ('delivery_head', 'signal.read'),
  ('presales_head', 'account.read'),
  ('presales_head', 'account.write'),
  ('presales_head', 'pipeline.read'),
  ('presales_head', 'delivery.read'),
  ('presales_head', 'copilot.use'),
  ('presales_head', 'catalog.read'),
  ('presales_head', 'account.record'),
  ('presales_head', 'catalog.write'),
  ('presales_head', 'strategy.read'),
  ('presales_head', 'copilot.decide'),
  ('presales_head', 'catalog.price'),
  ('presales_head', 'planning.read'),
  ('marketing_head', 'strategy.read'),
  ('marketing_head', 'strategy.write'),
  ('marketing_head', 'campaign.read'),
  ('marketing_head', 'campaign.write'),
  ('marketing_head', 'signal.read'),
  ('marketing_head', 'signal.triage'),
  ('marketing_head', 'account.read'),
  ('marketing_head', 'pipeline.read'),
  ('marketing_head', 'copilot.use'),
  ('marketing_head', 'copilot.decide'),
  ('marketing_head', 'catalog.read'),
  ('marketing_head', 'account.record'),
  ('marketing_head', 'planning.read'),
  ('marketing_head', 'delivery.read'),
  ('marketing_head', 'pipeline.forecast'),
  ('ops_head', 'planning.read'),
  ('ops_head', 'planning.write'),
  ('ops_head', 'pipeline.read'),
  ('ops_head', 'pipeline.forecast'),
  ('ops_head', 'account.read'),
  ('ops_head', 'campaign.read'),
  ('ops_head', 'strategy.read'),
  ('ops_head', 'admin.manage'),
  ('ops_head', 'copilot.use'),
  ('ops_head', 'catalog.read'),
  ('ops_head', 'catalog.write'),
  ('ops_head', 'catalog.price'),
  ('ops_head', 'pipeline.discount'),
  ('ops_head', 'strategy.write'),
  ('ops_head', 'copilot.decide'),
  ('regional_director', 'campaign.write'),
  ('regional_director', 'strategy.write')
) AS grants(role_code, perm_code)
JOIN local_authz.role r ON r.role_code = grants.role_code
JOIN local_authz.permission p ON p.perm_code = grants.perm_code
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Workspace copies of regional_director still holding EXACTLY the old set
-- get the two grants too; a copy the tenant edited is theirs.
WITH old AS (
  SELECT id FROM local_authz.permission WHERE perm_code IN ('account.read', 'account.record', 'account.write', 'campaign.read', 'catalog.read', 'copilot.decide', 'copilot.use', 'delivery.read', 'pipeline.discount', 'pipeline.forecast', 'pipeline.read', 'pipeline.write', 'planning.read', 'planning.write', 'signal.read', 'signal.triage', 'strategy.read')
),
untouched AS (
  SELECT w.id
    FROM local_authz.workspace_role w
   WHERE w.role_code = 'regional_director'
     AND NOT EXISTS (SELECT 1 FROM local_authz.workspace_role_permission x WHERE x.workspace_role_id = w.id AND x.permission_id NOT IN (SELECT id FROM old))
     AND (SELECT count(*) FROM local_authz.workspace_role_permission x WHERE x.workspace_role_id = w.id) = (SELECT count(*) FROM old)
)
INSERT INTO local_authz.workspace_role_permission (workspace_role_id, permission_id)
SELECT u.id, p.id FROM untouched u CROSS JOIN local_authz.permission p
 WHERE p.perm_code IN ('campaign.write', 'strategy.write')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. Name, sentence, line, rung and order, for all 31
-- ============================================================================
UPDATE local_authz.role r SET name = v.name, description = v.description,
  business_line = v.line, rank = v.rank, sort_order = v.ord
FROM (VALUES
  ('executive',                 '高管',        '看全局、审批计划、裁决助手建议；不编辑业务数据。', 'group', 'executive', 1),
  ('sales_leader',              '销售负责人',     '统管销售全链路：审批计划、签批折扣、开启自动执行、管理配置。', 'group', 'executive', 2),
  ('finance',                   '财务管理员',     '看回款、商机与价目，管底价并签批折扣。', 'group', 'staff', 3),
  ('workspace_admin',           '系统管理员',     '配置工作区：成员、角色与各类目录；不碰业务数据。', 'group', 'staff', 4),
  ('viewer',                    '只读成员',      '各模块只读，可向助手提问。', 'group', 'staff', 5),
  ('regional_general_manager',  '大区总经理',     '经营一个大区：战略、规划、活动、商机与交付全链路。', 'sales', 'general_manager', 6),
  ('regional_director',         '大区销售总监',    '统管一个大区的销售：定区域与目标，编辑战略与活动，签批折扣。', 'sales', 'director', 7),
  ('branch_general_manager',    '分公司总经理',    '经营一个分公司：区域与目标、活动、商机与交付。', 'sales', 'director', 8),
  ('sales_director',            '销售总监',      '统管销售团队的规划与商机，定区域与目标，签批折扣。', 'sales', 'director', 9),
  ('senior_sales_manager',      '高级销售经理',    '带团队推进商机，提交预测，签批折扣，看战略。', 'sales', 'senior', 10),
  ('sales_manager',             '销售经理',      '带团队推进商机，提交预测；不签批折扣。', 'sales', 'manager', 11),
  ('sales_rep',                 '销售代表',      '跟进客户与商机，推进阶段；不提交预测。', 'sales', 'staff', 12),
  ('channel_head',              '渠道负责人',     '统管渠道体系：定渠道区域与目标，看战略。', 'channel', 'director', 13),
  ('senior_channel_manager',    '高级渠道经理',    '经营渠道体系：提交预测、编辑渠道活动、签批渠道折扣。', 'channel', 'senior', 14),
  ('channel_manager',           '渠道经理',      '经营渠道伙伴与联合商机；不处置信号。', 'channel', 'manager', 15),
  ('delivery_head',             '交付负责人',     '统管交付组织：定交付规划，看信号。', 'delivery', 'director', 16),
  ('senior_delivery_manager',   '高级交付经理',    '统管交付：维护客户主数据，看规划与战略。', 'delivery', 'senior', 17),
  ('delivery_manager',          '交付经理',      '管理交付项目、里程碑与回款；客户与商机只读。', 'delivery', 'manager', 18),
  ('presales_head',             '售前负责人',     '统管售前：维护方案目录与底价，看规划。', 'presales', 'director', 19),
  ('senior_presales',           '高级售前顾问',    '统管方案：维护方案目录，看战略，裁决助手建议。', 'presales', 'senior', 20),
  ('presales',                  '售前顾问',      '配合方案与客户资料；商机与项目只读。', 'presales', 'staff', 21),
  ('marketing_head',            '市场负责人',     '统管市场：战役与信号处置，看规划与交付，提交预测。', 'marketing', 'director', 22),
  ('marketing_manager',         '高级市场经理',    '负责战役与信号处置，直到线索交接；不改商机。', 'marketing', 'senior', 23),
  ('marketing_specialist',      '市场专员',      '执行活动，看信号；不做处置。', 'marketing', 'staff', 24),
  ('ops_head',                  '运营负责人',     '统管运营：定口径与战略，管配额与角色，裁决助手建议。', 'ops', 'director', 25),
  ('sales_ops',                 '高级运营经理',    '定口径、管配额与角色、设底价、签批折扣；不改商机。', 'ops', 'senior', 26),
  ('sales_ops_specialist',      '运营专员',      '看规划与预测口径，提交预测汇总；不改口径。', 'ops', 'staff', 27),
  ('key_account_manager',       '大客户经理',     '经营少数重点客户，可提交预测，看规划与战略。', 'account', 'manager', 28),
  ('customer_success',          '客户成功经理',    '签约后经营客户：跟进交付、续约与新需求。', 'account', 'manager', 29),
  ('sdr',                       '商机开发代表',    '处置信号、开发线索，交给销售；不推进商机。', 'account', 'staff', 30),
  ('deal_desk',                 '商务专员',      '审核报价与折扣，管底价。', 'account', 'staff', 31)
) AS v(code, name, description, line, rank, ord)
WHERE r.role_code = v.code
  AND (r.name <> v.name OR r.description <> v.description OR r.business_line <> v.line
       OR r.rank <> v.rank OR r.sort_order <> v.ord);

-- Copies still carrying the old shipped name (and sentence) follow the rename.
UPDATE local_authz.workspace_role w SET name = v.new_name, description = r.description, updated_at = now()
  FROM (VALUES
  ('finance',                   '财务',          '财务管理员'),
  ('regional_director',         '大区总监',        '大区销售总监'),
  ('marketing_manager',         '市场经理',        '高级市场经理'),
  ('sales_ops',                 '销售运营经理',      '高级运营经理'),
  ('sales_ops_specialist',      '销售运营专员',      '运营专员')
  ) AS v(code, old_name, new_name)
  JOIN local_authz.role r ON r.role_code = v.code
 WHERE w.role_code = v.code AND w.name = v.old_name;

-- ============================================================================
-- 4. The workspaces that already have roles
-- ============================================================================
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

-- Untouched workspaces (every 0048 preset copy still at 0048's number) take
-- the new order; the seven new copies already carry it.
WITH old AS (
  SELECT * FROM (VALUES
  ('sales_leader',              1),
  ('executive',                 2),
  ('finance',                   3),
  ('workspace_admin',           4),
  ('viewer',                    5),
  ('regional_general_manager',  6),
  ('regional_director',         7),
  ('senior_sales_manager',      8),
  ('sales_manager',             9),
  ('sales_rep',                 10),
  ('senior_channel_manager',    11),
  ('channel_manager',           12),
  ('senior_delivery_manager',   13),
  ('delivery_manager',          14),
  ('senior_presales',           15),
  ('presales',                  16),
  ('marketing_manager',         17),
  ('marketing_specialist',      18),
  ('sales_ops',                 19),
  ('sales_ops_specialist',      20),
  ('key_account_manager',       21),
  ('customer_success',          22),
  ('sdr',                       23),
  ('deal_desk',                 24)
  ) AS o(code, ord)
),
untouched AS (
  SELECT w.workspace_id
    FROM local_authz.workspace_role w
    JOIN old ON old.code = w.role_code
   GROUP BY w.workspace_id
  HAVING bool_and(w.sort_order = old.ord)
)
UPDATE local_authz.workspace_role w SET sort_order = r.sort_order, updated_at = now()
  FROM local_authz.role r
 WHERE w.role_code = r.role_code
   AND w.workspace_id IN (SELECT workspace_id FROM untouched)
   AND w.sort_order <> r.sort_order;
