# 全链路业务规则

本文件是产品的业务口径权威。实现必须与这里一致；不一致时改实现，不是改文档——
除非先在这里改口径。

## 1. 商机阶段机

七个阶段，其中两个是终态：

| 阶段 | 含义 | 默认赢率 |
|------|------|---------|
| `qualify` | 合格判定：预算/权限/需求/时间是否成立 | 10% |
| `discover` | 需求挖掘：确认痛点与决策链 | 25% |
| `validate` | 方案验证：POC/样板/技术认可 | 50% |
| `propose` | 正式报价/投标 | 70% |
| `negotiate` | 商务谈判/合同条款 | 90% |
| `won` | 赢单（终态） | 100% |
| `lost` | 丢单（终态） | 0% |

**流转规则**：

1. 阶段可以前进、可以回退，但**每一次变化都必须写一条
   `opportunity_stage_event`**（`from_stage` / `to_stage` / `reason` / `actor_sub`）。
   数据库 CHECK 已禁止 `from_stage = to_stage` 的空事件。
2. 进入终态（`won` / `lost`）必须同时置 `status` 与 `closed_at`。
3. 进入 `won` 后**必须**产生一条赢丢复盘 `win_loss_review`；进入 `lost` 同理。
   一个商机只有一条复盘（唯一约束在 `opportunity_id` 上）。
4. 默认赢率是**建议值不是锁定值**：`probability` 可以被人工覆盖，覆盖后阶段变化
   不再自动改写它。谁覆盖的、什么时候，由 `opportunity_stage_event.reason` 承载。
5. `account_id` 创建后不可改。换客户 = 换了一个单子，应新建商机。

## 2. 预测口径

`forecast_category` 四个值，与阶段解耦（可人工调整，这是销售管理的核心动作）：

| 类别 | 含义 | 计入 |
|------|------|------|
| `pipeline` | 在管道内，但不承诺 | 管道总额 |
| `best_case` | 乐观可拿 | 乐观额 |
| `commit` | 向上承诺一定拿下 | 承诺额 |
| `closed` | 已成交 | 已成交额 |

**快照规则**：

- `forecast_snapshot` 是**不可变时点快照**，一次预测写一行，永不覆盖、永不修改
  （DDL 层已收回 UPDATE 权限）。
- 唯一键是 `(workspace_id, period, scope_type, territory_id, owner_sub, snapshot_at)`，
  即同一作用域同一时刻只有一份。
- 预测准确率 = 期末实际 vs 期初快照，**只有保留全部历史快照才算得出来**。这是
  快照只追加的唯一理由，也是不可让步的理由。

**达成度**：达成度 = 对应作用域的 `forecast_snapshot.closed_amount` /
`sales_target.target_amount`。目标由 D2 设定，达成由 D6 计算，**两个域不互相写对方
的数据**。

## 3. 信号评分与线索转化

**信号评分** `signal.score`（0-100）由信号类型权重、客户匹配度、时效衰减三部分合成。
具体权重是模型侧配置，不写死在 DDL 里；本文件只锁定三条口径：

1. 未匹配到 `account_id` 的信号，评分**不得**因为「不认识这家公司」而归零——新客户
   信号恰恰是商机侦探的价值所在。
2. 评分随时间衰减：`detected_at` 越久远权重越低。
3. 评分可重算并写回（`score` 在可写白名单里），但**证据字段永不重写**。

**信号 -> 线索**：信号状态 `new -> scored -> promoted` 时创建 `lead`，`lead.signal_id`
指回来源信号。被判定重复的信号置 `duplicate`，不产生线索。

**线索 -> 商机**：线索 `qualified -> converted` 时创建 `opportunity`，回填
`lead.converted_opportunity_id`，并把 `lead.campaign_id` 复制到
`opportunity.campaign_id`。**这一步是全链路归因的接缝**，复制之后两边都不可改。

## 4. 归因规则

一个商机的来源归因，按以下优先级取**第一个非空**值，且只在创建时计算一次：

1. `opportunity.campaign_id`（经由线索继承的战役）
2. 线索来源信号所属的战役
3. 无战役来源 -> 归为「自拓」

归因键不可改（列级写锁已强制）。**这是有意的**：允许事后改归因，等于允许事后改
业绩分配，市场与销售之间的口径就没有仲裁基础了。归因确实错了，走数据订正流程
（`db-init` 增量 + 留痕），不走应用写入。

## 5. 客户健康度

`account.health_score`（0-100）由智能体维护，输入包括：活跃商机数与阶段、最近互动
时效、交付项目健康度（`project.health`）、回款逾期情况（`revenue_schedule.status =
overdue`）。

健康度是**派生值**，任何时候都可以从源数据重算。它入库只是为了排序和告警，**不作为
任何业务判断的唯一依据**。

## 6. 回款与落地

- `revenue_schedule` 按 `sequence` 排期，序号是行标识的一部分，不可改。
- 状态机：`planned -> invoiced -> settled`，逾期未结转 `overdue`，坏账转
  `written_off`。
- 项目健康度 `project.health`：`green` / `amber` / `red`。存在 `overdue` 的回款期次
  时不得为 `green`。

## 7. 人机边界（横切规则）

这一条覆盖所有域，优先级高于任何单域规则。

1. 智能体的一切写操作都以 `agent_action` 的形式**先提案**：
   `proposed -> accepted | rejected -> executed | failed`。
2. `accepted` 必须有人类 `decided_by_sub` 与 `decided_at`。**没有人落章就不存在
   accepted**。
3. 只有权益档位包含 `copilot.autopilot`、且工作区显式开启自动执行时，
   `proposed -> executed` 才可跳过人工确认；即便如此仍写完整 `agent_action` 记录，
   `decided_by_sub` 留空以明确标记「这是自动执行的」。
4. 提案内容（`payload` / `rationale` / `confidence`）**不可篡改**（列级写锁强制）。
   审计要能回答「智能体当时到底建议了什么」，而不是「现在看起来建议了什么」。
5. 提案超时未决置 `expired`，不得静默消失。

## 8. 与平台的关系（绝不本地重算）

- **权益**：`tier` / `status` / `limits` / `quota_pools` 全部来自平台 C2 通道，产品
  只读渲染。产品**不得**本地推导「他应该算 pro」这类商业结论。
- **门控公式**：UI 门 `tier != null`；数据门 `tier != null || bundled`。这条公式
  是刚性区，**不得在产品内放宽**。
- **用量**：计数型用量走本地缓冲 + flush 到平台，平台是计量权威。
- **身份**：`workspace_id` / `sub` 是平台下发的引用键，产品不做身份模型镜像。
