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
| `offering` | 销售侧产品目录 | `offering_code` |

### yucer_gtm（6）

| 表 | 说明 | 业务号 |
|----|------|-------|
| `strategy_plan` | 战略规划 | `plan_no` |
| `market_segment` | 细分市场（`criteria` 为 JSONB 过滤条件） | `segment_code` |
| `territory` | 销售区域（自引用树） | `territory_code` |
| `sales_target` | 目标/配额 | - |
| `campaign` | 市场战役 | `campaign_no` |
| `campaign_execution` | 战役执行项 | - |

### yucer_pipeline（6）

| 表 | 说明 | 业务号 |
|----|------|-------|
| `signal` | 商机信号（证据，半不可变） | - |
| `lead` | 线索 | `lead_no` |
| `opportunity` | 商机 | `opportunity_no` |
| `opportunity_stage_event` | 阶段流转（只追加） | - |
| `forecast_snapshot` | 预测快照（只追加） | - |
| `win_loss_review` | 赢丢复盘（每商机一条） | - |

### yucer_delivery（4）

| 表 | 说明 | 业务号 |
|----|------|-------|
| `project` | 交付项目 | `project_no` |
| `project_milestone` | 里程碑（`sequence` 唯一） | - |
| `revenue_schedule` | 回款期次（`sequence` 唯一） | - |

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

## 3. 隔离键

每张业务根表都带 `workspace_id`，它是**唯一权威隔离键**。所有唯一约束都以它开头
（`uidx_account_ws_no`、`uidx_opportunity_ws_no` ...），保证业务号只在工作区内唯一，
不同工作区可以各自有 `OPP-0001`。

从属表（`contact` / `project_milestone` / `agent_message` ...）同样冗余 `workspace_id`，
目的是让所有查询都能不经 JOIN 直接带上隔离条件——这是防止跨租户泄漏最有效的一层。

## 4. 不可变约束一览

列级写锁的完整定义在 `deploy/database/ddl/98_column_locks.sql`。三条判定规则：

1. **锚点永不可写**：`id`、`workspace_id`、`*_no` / `*_code` 业务号、`created_at`。
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
