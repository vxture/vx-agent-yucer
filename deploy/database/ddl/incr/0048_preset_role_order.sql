-- 0048_preset_role_order.sql - 预置角色排序固化: business line first, in the
-- order 分组管理 lists the lines; inside a line, rank from the top rung down.
--
-- THE RULING (owner, 2026-09-10): 预置角色排序固化，方便用户选择，以业务线第一
-- 维度，业务线内层级从高到低，进行 seed 级固化排序。业务线顺序来自分组管理的顺序，
-- 层级同理。
--
-- 0047 ordered each line's ladder from the bottom rung up. A person picking a
-- role reads an org chart from the top, so the ladder is turned over: 大区总经理
-- before 大区总监 before 高级销售经理 ... before 销售代表. The line order is the
-- shipped 业务线 vocabulary's (集团与通用 / 销售 / 渠道 / 交付 / 售前 / 市场 / 运营 /
-- 客户与商机开发); ties on the same rung keep their 0047 order.
--
-- TWO WRITES. (1) local_authz.role.sort_order - the template. (2) The
-- workspace copies, ONLY where the workspace has never re-ordered anything:
-- a workspace whose preset copies still sit at exactly 0047's numbers is
-- renumbered to the new ones; one that moved a single row keeps its order,
-- because that order is theirs (0046: sort_order is the tenant's column).
-- 重置预置 restores the new order on request either way.
--
-- authz/catalog.ts PRESET_ROLE_ORDER mirrors these rows; catalog.test.ts
-- parses the LAST such block across the increments - this one.
-- Idempotent throughout.

UPDATE local_authz.role r SET name = v.name, description = v.description,
  business_line = v.line, rank = v.rank, sort_order = v.ord
FROM (VALUES
  ('sales_leader',              '销售负责人',     '统管销售全链路：审批计划、签批折扣、开启自动执行、管理配置。', 'group', 'executive', 1),
  ('executive',                 '高管',        '看全局、审批计划、裁决助手建议；不编辑业务数据。', 'group', 'executive', 2),
  ('finance',                   '财务',        '看回款、商机与价目，管底价并签批折扣。', 'group', 'staff', 3),
  ('workspace_admin',           '系统管理员',     '配置工作区：成员、角色与各类目录；不碰业务数据。', 'group', 'staff', 4),
  ('viewer',                    '只读成员',      '各模块只读，可向助手提问。', 'group', 'staff', 5),
  ('regional_general_manager',  '大区总经理',     '经营一个大区：战略、规划、活动、商机与交付全链路。', 'sales', 'general_manager', 6),
  ('regional_director',         '大区总监',      '统管一个大区的规划与商机，可签批折扣。', 'sales', 'director', 7),
  ('senior_sales_manager',      '高级销售经理',    '带团队推进商机，提交预测，签批折扣，看战略。', 'sales', 'senior', 8),
  ('sales_manager',             '销售经理',      '带团队推进商机，提交预测；不签批折扣。', 'sales', 'manager', 9),
  ('sales_rep',                 '销售代表',      '跟进客户与商机，推进阶段；不提交预测。', 'sales', 'staff', 10),
  ('senior_channel_manager',    '高级渠道经理',    '经营渠道体系：提交预测、编辑渠道活动、签批渠道折扣。', 'channel', 'senior', 11),
  ('channel_manager',           '渠道经理',      '经营渠道伙伴与联合商机；不处置信号。', 'channel', 'manager', 12),
  ('senior_delivery_manager',   '高级交付经理',    '统管交付：维护客户主数据，看规划与战略。', 'delivery', 'senior', 13),
  ('delivery_manager',          '交付经理',      '管理交付项目、里程碑与回款；客户与商机只读。', 'delivery', 'manager', 14),
  ('senior_presales',           '高级售前顾问',    '统管方案：维护方案目录，看战略，裁决助手建议。', 'presales', 'senior', 15),
  ('presales',                  '售前顾问',      '配合方案与客户资料；商机与项目只读。', 'presales', 'staff', 16),
  ('marketing_manager',         '市场经理',      '负责战役与信号处置，直到线索交接；不改商机。', 'marketing', 'manager', 17),
  ('marketing_specialist',      '市场专员',      '执行活动，看信号；不做处置。', 'marketing', 'staff', 18),
  ('sales_ops',                 '销售运营经理',    '定口径、管配额与角色、设底价、签批折扣；不改商机。', 'ops', 'manager', 19),
  ('sales_ops_specialist',      '销售运营专员',    '看规划与预测口径，提交预测汇总；不改口径。', 'ops', 'staff', 20),
  ('key_account_manager',       '大客户经理',     '经营少数重点客户，可提交预测，看规划与战略。', 'account', 'manager', 21),
  ('customer_success',          '客户成功经理',    '签约后经营客户：跟进交付、续约与新需求。', 'account', 'manager', 22),
  ('sdr',                       '商机开发代表',    '处置信号、开发线索，交给销售；不推进商机。', 'account', 'staff', 23),
  ('deal_desk',                 '商务专员',      '审核报价与折扣，管底价。', 'account', 'staff', 24)
) AS v(code, name, description, line, rank, ord)
WHERE r.role_code = v.code
  AND (r.name <> v.name OR r.description <> v.description OR r.business_line <> v.line
       OR r.rank <> v.rank OR r.sort_order <> v.ord);

-- Workspaces that never re-ordered: every preset copy still at 0047's number.
WITH old AS (
  SELECT * FROM (VALUES
  ('sales_leader',              1),
  ('executive',                 2),
  ('finance',                   3),
  ('workspace_admin',           4),
  ('viewer',                    5),
  ('sales_rep',                 6),
  ('sales_manager',             7),
  ('senior_sales_manager',      8),
  ('regional_director',         9),
  ('regional_general_manager',  10),
  ('channel_manager',           11),
  ('senior_channel_manager',    12),
  ('delivery_manager',          13),
  ('senior_delivery_manager',   14),
  ('presales',                  15),
  ('senior_presales',           16),
  ('marketing_specialist',      17),
  ('marketing_manager',         18),
  ('sales_ops_specialist',      19),
  ('sales_ops',                 20),
  ('key_account_manager',       21),
  ('sdr',                       22),
  ('deal_desk',                 23),
  ('customer_success',          24)
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
