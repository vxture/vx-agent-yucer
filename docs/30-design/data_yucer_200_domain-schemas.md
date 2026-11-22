# data_yucer_200 - 产品域数据模型

结构权威是 `deploy/database/ddl/00_baseline.sql`（单一 DDL 权威，create-once）。
`portals/app/prisma/schema.prisma` 只是客户端生成源，必须与 DDL 严格 lockstep——
`scripts/guardrails/check-data-architecture.mjs --strict` 在 CI 强制校验。

当前基线：**37 张表**（契约面 10 + 产品域 27）。产品域 24 张为批次 1 的五个域 schema，另 3 张为 `yucer_field` 证据面（ADR-006，`incr/0004`）。

## 1. 域表清单

### yucer_core（4）

| 表 | 说明 | 业务号 |
|----|------|-------|
| `account` | 客户 | `account_no` |
| `contact` | 联系人（含决策角色、影响力） | - |
| `account_relation` | 关系图谱有向边（只追加） | - |

### yucer_gtm（20）

| 表 | 说明 | 业务号 |
|----|------|-------|
| `strategy_plan` | 战略及其草稿/版本，lineage 归组（incr/0110） | `plan_no`（战略根唯一） |
| `strategy_option` | 工作区价值主张与实现路径配置，UUID 引用（incr/0125） | kind + code |
| `strategy_plan_event` | 修订、发布、放弃事件，只读授权服务角色（incr/0110） | - |
| `market_segment` | 可复用的细分市场（`criteria` 保存过滤条件与场景说明） | `segment_code` |
| `market_segment_solution` | 市场默认方案；独立维护、供战略首次选入继承（incr/0112） | - |
| `market_segment_product` | 市场默认产品（incr/0114） | - |
| `strategy_plan_product` | 战略通用产品引用（incr/0114） | - |
| `strategy_plan_market_product` | 目标市场主推产品引用（incr/0114） | - |
| `strategy_plan_solution` | 战略通用方案引用（incr/0107） | - |
| `strategy_plan_market` | 战略选用的细分市场、选入时的名称与条件、投入方式和打法（incr/0108） | - |
| `strategy_plan_market_solution` | 单个目标市场的主推方案引用（incr/0108） | - |
| `territory` | 销售区域（自引用树） | `territory_code` |
| `sales_target` | 旧目标/独立个人配额；显式接管后禁止旧写 | - |
| `sales_plan` | 年度规划稳定身份，工作区/年份唯一（incr/0106） | - |
| `sales_plan_revision` | 共享草稿及整份 JSONB 冻结版本 | 根内 V 编号 |
| `sales_plan_event` | 草稿/保存/发布/取消/锁定/结案事件，只追加 | 根内 event_no |
| `sales_plan_legacy_target` | 旧目标显式接管及来源快照，只追加 | - |
| `campaign` | 市场战役 | `campaign_no` |
| `campaign_execution` | 战役执行项 | - |
| `org_unit_kind` | 单位类型词表，工作区自有（`incr/0051`，ADR-029） | `kind_code` |
| `org_unit` | 组织单位（自引用树；上级 RESTRICT，负责人为成员 sub） | `unit_code` |
| `org_unit_member` | 成员归属：(成员, 单位) 对，一人可在多个单位（incr/0053），随单位 CASCADE | - |
| `territory_unit` | 销售区域挂靠的单位，多对多（`incr/0052`，ADR-030） | - |
| `territory_division` | 销售区域覆盖的大区，按 id；`territory.regions` 自此只读不写 | - |

`yucer_ref.org_template` / `org_template_unit`（`incr/0051`）为三套预置组织模版，
只读参考行；工作区首次接触时按默认模版物化，重置预置可整体替换。

### yucer_pipeline（7）

| 表 | 说明 | 业务号 |
|----|------|-------|
| `signal` | 商机信号（证据，半不可变） | - |
| `lead` | 线索 | `lead_no` |
| `opportunity` | 商机 | `opportunity_no` |
| `opportunity_stage_event` | 阶段流转（只追加） | - |
| `forecast_snapshot` | 预测快照（只追加） | - |
| `forecast_target_basis` | 预测提交采用的目标版本/金额，与快照同事务，只追加（incr/0106） | - |
| `win_loss_review` | 赢丢复盘（每商机一条） | - |

### yucer_delivery（4）

| 表 | 说明 | 业务号 |
|----|------|-------|
| `project` | 交付项目 | `project_no` |
| `project_milestone` | 收款/验收关口（`sequence` 唯一；承诺日 `baseline_due_at` 不可改） | - |
| `revenue_schedule` | 回款期次（`sequence` 唯一；`milestone_id` **非空**） | - |
| `milestone_change` | 计划变更记录（只追加，带原因） | - |

`project_task` 于 2026-08-28 删除（ADR-022），`milestone_change` 于 2026-09-06 新增
（ADR-025），所以本域仍是 4 张表。

**里程碑是收款关口，不是工作包**（ADR-025）。`baseline_due_at` 记承诺日且**不在 UPDATE
授权内**——于是"晚了多久"是减法而不是记忆；验收三列
（`accepted_at` / `accepted_by` / `acceptance_recorded_by_sub`）记的是**我们录下来的**
客户签字，客户不使用本系统。回款与关口之间是**复合外键** `(milestone_id, project_id)`，
它拦住的是"甲项目的钱被乙项目的关口放出去"——单列外键两边都能通过。

### yucer_agent（4）

| 表 | 说明 | 业务号 |
|----|------|-------|
| `agent_session` | 会话（可锚定到域对象） | - |
| `agent_message` | 消息（只追加，`seq` 单调） | - |
| `agent_action` | 建议动作（半不可变） | - |
| `agent_playbook` | 剧本/话术 | `playbook_code` |

## 2. 命名与类型约定（与契约面一致）

- 主键 `UUID PRIMARY KEY DEFAULT gen_random_uuid()`。
- 时间一律 `TIMESTAMPTZ`：`created_at` / `updated_at` / `deleted_at`。
- 状态一律 `VARCHAR(32)` + `CHECK`，**从不使用 PG ENUM**（ENUM 改值需要 DDL，
  与 create-once 冲突）。
- 金额 `NUMERIC(18,2)` + 独立 `currency VARCHAR(8)`，**从不用浮点**。
- 评分/比例 `SMALLINT` + `CHECK BETWEEN 0 AND 100`。
- 索引前缀 `idx_` / `uidx_` / `fk_` / `chk_`。
- 平台引用键（`workspace_id` / `tenant_id` / `sub`）只存引用，注释标 `[ref]`。

业务记录之间以 UUID 关联，按工作区隔离。选择器提交 UUID，编辑以 UUID 定位，编号只作展示、搜索及旧链接解析。细分市场、方案和产品新建时预填 `MKT/SOL/PRD-YYYYMMDD-NNN`（北京时间）；实际保存由服务端查重分配，产品允许用自有编号。历史快照保留当时的编号和名称，版本号与事件序号仍用于排序和并发检查。

0117–0121 将客户的细分市场和销售区域、战略类型、商机阶段及退出条件、销售规划的撤销事件关系统一落到 UUID。旧版本兼容入口只在边界解析原值。不匹配或有歧义的旧归属保留已有文本，UUID 留空，不猜测。平台账号 `sub`、静态枚举、筛选条件和历史快照不是本产品的记录引用。

## 3. 隔离键

每张业务根表都带 `workspace_id`，它是**唯一权威隔离键**。所有唯一约束都以它开头
（`uidx_account_ws_no`、`uidx_opportunity_ws_no` ...），保证业务号只在工作区内唯一，
不同工作区可以各自有 `OPP-0001`。

从属表（`contact` / `project_milestone` / `agent_message` ...）同样冗余 `workspace_id`，
目的是让所有查询都能不经 JOIN 直接带上隔离条件——这是防止跨租户泄漏最有效的一层。

## 4. 不可变约束一览

列级写锁的完整定义在 `deploy/database/ddl/98_column_locks.sql`。三条判定规则：

1. **身份锚点不可写**：`id`、`workspace_id`、`created_at`。业务编号用于展示和查找，默认不改；产品编号可按客户需要修改（0116），仍在工作区内查重。
2. **归因键永不可写**：`lead.signal_id`、`lead.campaign_id`、
   `opportunity.campaign_id`、`opportunity.account_id`，以及 `signal` 的全部证据列
   （`source` / `source_ref` / `signal_type` / `subject` / `payload` / `detected_at`）。
   规划键（`opportunity.plan_id` / `territory_id` / `owner_sub`）反映当前归属，可写。
3. **只追加表完全不授 UPDATE**：`account_relation`、`opportunity_stage_event`、
   `forecast_snapshot`、`agent_message`。

新增一个可写列**必须**同步更新 `98_column_locks.sql`，否则服务角色写入直接
permission denied。这是有意的失败模式：让遗漏在开发期暴露，而不是在生产期变成
悄悄写不进去。

## 5. 服务角色权限

`97_service_role.sql` 给 `yucer_svc` 在五个域 schema 上授予 `USAGE` +
`SELECT/INSERT/DELETE`，**无 DDL、无整表 UPDATE**。UPDATE 一律走
`98_column_locks.sql` 的列级白名单。

## 6. 变更通道

结构变更**只走** `deploy/database/ddl/incr/NNNN_slug.sql` + db-init 工作流，必须幂等
（`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`）。

- **绝不**编辑 `00_baseline.sql`（create-once）。
- **绝不**由容器 entrypoint 迁移。
- **绝不**使用 Prisma migrate（本仓无 migrations 目录，Prisma 不是结构权威）。

已应用增量见 `deploy/database/ddl/incr/README.md`。


### 战略版本接管（0110）

战略根 `plan_no` 在工作空间内唯一，修订沿用编码并持有独立 id。
`lineage_id`、`base_plan_id` 使用工作空间复合外键；每个 lineage 至多一份草稿，版本号唯一。
`published_snapshot` 只在受控发布事务冻结；所有关系行随父版本锁定，事件只可通过受控函数追加。
下游 `plan_id` 保持指向具体版本。旧正式记录采用 legacy V1 快照，保留原状态与引用。


## 战略制定结果（incr/0125）

`strategy_plan.result` 是草稿/版本聚合内的 JSONB：价值主张 UUID、结构化目标、路径 UUID、
资源预算、里程时间、风险假设和关联新旧属性。目标、里程和风险条目具有独立 UUID。
发布快照冻结完整结果与已选字典名称，修订复制全部结果，原版本不修改。
保留 `expectations` 作为三个既有指标向销售规划的兼容投影，目标 UUID 不变；数据库核对投影一致。
`strategy_option` 按 workspace + kind + code 唯一，标识 UUID，允许修改名称、启用状态与顺序；
服务角色无删除、无更换标识授权。目标市场、人员与产品方案仍沿用原有关系，不另造客户规模关系。


## 产品方案新旧属性（incr/0126）

`product.novelty` 与 `solution.novelty` 为可空目录属性，只接受 existing/new，
未配置为 NULL。关联均以 UUID 识别，属性不改变关联标识。服务角色拥有列级 UPDATE；
战略编辑与助手只能读取目录值，不能通过战略关联回写目录。发布快照冻结已关联产品方案的属性。


## 小聿私有任务底座（incr/0133）

D8 新增 agent_task、agent_task_reference、agent_task_session、agent_task_draft、
agent_task_checkpoint、agent_task_turn 六表；agent_session 增加不可变 kind 区分旧会话与任务会话。
对象身份使用 UUID，复合外键额外校验 workspace、OIDC actor_sub 和会话种类，防止私有内容混连。
目标、请求指纹、归属不可变；来源依赖、私有笔记快照与检查点只追加；模型回执只可从运行中进入不可改写终态。
DDL、Prisma、列锁及服务角色授权同步，升级／新库／重复应用均须验证。
数据字典、事务与读取边界见 [240 第七节](design_yucer_240_xiaoyu-collaboration.md)。

## 小聿私人记忆（incr/0134）

`agent_private_memory` 仅以 workspace + actor 读取，保存来源业务 UUID／版本、原任务／消息、
类别（事实／决策／推断／假设）、有效状态及乐观版本。身份、来源和父记忆依赖不可变。
内容纠正、停止和恢复均递增版本，同时在 `agent_private_memory_revision` 追加不可改写快照。
`agent_task_memory` 追加某个私有任务实际使用的记忆版本，复合外键同时约束工作空间和本人。
不能把旧依赖改为新版后继续回放旧正文。来源撤权、业务改版、父记忆停用／纠正均沿依赖传递失效。
管理页只在来源仍可核验时显示正文；停用不影响本人在合法范围内纠正或恢复。
团队业务知识不使用本表，不存在将私人记忆设为共享的列或接口。
