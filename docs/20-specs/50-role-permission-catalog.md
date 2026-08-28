# 角色与权限目录

这是**权限门**的定义：工作区内某个成员能做什么。权威数据是 `local_authz` 的
`role` / `permission` / `role_permission` 三张表，种子在
`deploy/database/ddl/incr/0001_seed_authz_catalog.sql`。

## 与平台角色的关系（不要混淆）

`local_authz.role` 是**产品职能角色**，与平台治理角色
（owner / manager / member / readonly / guest）是两套东西，不做镜像、不做映射表。

- 平台治理角色决定「你在这个工作区的治理地位」（谁能邀请人、谁能改订阅）。
- 产品职能角色决定「你在销售流程里担任什么职能」（销售、市场、交付、运营）。

一个平台 `member` 可以是产品里的 `sales_rep` 或 `delivery_manager`；平台 `owner`
在产品里默认授予 `sales_leader`，但这只是**初始化默认值**，之后可独立调整。

## 权限目录（19 项）

权限码格式 `<域>.<动作>`，域前缀与八个能力分区一致。

| perm_code | 名称 | 说明 |
|-----------|------|------|
| `strategy.read` | 查看战略 | D1 只读 |
| `strategy.write` | 编辑战略 | D1 创建/修改战略与细分市场 |
| `strategy.approve` | 审批计划 | D1 批准战略计划——计划由此成为承诺（`incr/0002`） |
| `planning.read` | 查看规划 | D2 只读 |
| `planning.write` | 编辑规划 | D2 设定区域与目标配额 |
| `campaign.read` | 查看战役 | D3 只读 |
| `campaign.write` | 编辑战役 | D3 创建战役与执行项 |
| `account.read` | 查看客户 | D4 只读 |
| `account.write` | 编辑客户 | D4 维护客户、联系人、关系图谱 |
| `signal.read` | 查看信号 | D5 只读 |
| `signal.triage` | 处置信号 | D5 评分、匹配客户、升级为线索、判重 |
| `pipeline.read` | 查看商机 | D6 只读 |
| `pipeline.write` | 编辑商机 | D6 推进阶段、改金额与预计成交 |
| `pipeline.forecast` | 提交预测 | D6 生成预测快照、调整预测类别 |
| `delivery.read` | 查看项目 | D7 只读 |
| `delivery.write` | 编辑项目 | D7 里程碑、任务、回款计划 |
| `copilot.use` | 使用助手 | D8 发起会话、提问 |
| `copilot.decide` | 裁决助手建议 | D8 accept / reject 建议动作 |
| `copilot.autopilot` | 开启自动执行 | D8 授权跳过人工确认（还需权益档位） |
| `admin.manage` | 产品管理 | 角色分配、口径与目录维护 |

注：`admin.manage` 是产品内管理，不含平台治理动作（成员邀请、订阅变更仍在平台侧）。

## 角色目录（7 个）

| role_code | 名称 | 权限 |
|-----------|------|------|
| `sales_leader` | 销售负责人 | 全部 20 项 |
| `marketing_manager` | 市场负责人 | `strategy.read` `strategy.write` `campaign.read` `campaign.write` `signal.read` `signal.triage` `account.read` `pipeline.read` `copilot.use` `copilot.decide` |
| `sales_rep` | 一线销售 | `account.read` `account.write` `signal.read` `signal.triage` `pipeline.read` `pipeline.write` `delivery.read` `campaign.read` `copilot.use` `copilot.decide` |
| `presales` | 售前/方案 | `account.read` `account.write` `pipeline.read` `delivery.read` `copilot.use` |
| `delivery_manager` | 交付经理 | `delivery.read` `delivery.write` `account.read` `pipeline.read` `copilot.use` `copilot.decide` |
| `sales_ops` | 销售运营 | `planning.read` `planning.write` `pipeline.read` `pipeline.forecast` `account.read` `campaign.read` `strategy.read` `admin.manage` `copilot.use` |
| `viewer` | 只读 | 全部 `*.read` + `copilot.use` |

### 分配逻辑说明

- **`copilot.autopilot` 只给 `sales_leader`**。它改变人机边界，必须由能对结果负责
  的人开启，且还要档位为 enterprise 才真正生效（两道门）。
- **`pipeline.forecast` 给运营和负责人，不给一线销售**。预测是管理动作：一线销售可
  推进商机（`pipeline.write`），但提交对上承诺的预测快照是另一件事。
- **`strategy.approve` 只给 `sales_leader`**。与上一条同形，只是上移了一层：
  `marketing_manager` 持有 `strategy.write`，可以起草和修改计划，但把销售组织**承诺**
  到这个数字上不是它的职权。`strategy_plan.approved_at` 是下游所有报表的基准，签字
  和编辑是两个动作。（`incr/0002`；在此之前 `strategy.plan.approve` 这个 action id
  解析到 `strategy.write`，分离仅是名义上的。）
- **`sales_ops` 有 `admin.manage` 但没有 `pipeline.write`**。运营定口径、管配额、管
  角色，但不替销售改单子——避免口径制定者同时是数据修改者。
- **`marketing_manager` 有 `signal.triage` 但没有 `pipeline.write`**。市场负责信号到
  线索这一段，商机推进交给销售，交接点清晰。
- **`viewer` 保留 `copilot.use`**。只读用户仍可以向智能体提问，因为提问不产生写入。

## 运行时纪律

- 目录表在运行时**只读**：`role` / `permission` 的 UPDATE 权限已被
  `98_column_locks.sql` 收回，新增权限走 `incr/` 增量 + db-init，不走应用写入。
- `member` 采用**首次登录懒加载**：第一次见到 `(workspace_id, sub)` 时 upsert，
  它不是平台成员关系的实时镜像。
- 成员角色关系（`member_role`）是连接表，只增删不修改。

## 2026-08-26 增量 - 目录分区（incr/0010，ADR-017）

权限 20 → 23，授权 68 → 79。

| 权限 | 是什么 | 授予 |
|------|--------|------|
| `catalog.read` | 读目录、方案、价目 | 全部七个角色 |
| `catalog.write` | 维护产品与方案 | sales_leader / sales_ops |
| `catalog.price` | 定标价与**底价** | sales_leader / sales_ops |

**功能键不变，仍是 19。** 目录是能力分区但不带功能键——它是链路基础设施，
不是可售卖能力，所以门控完全在权限层。理由见 ADR-017。

`catalog.price` 单独成权：能移动底价的人等于能在不批准任何东西的情况下批准
每一笔折扣。刻意不给 `sales_rep`——底价存在的意义就是约束正在成交的那个人。

## 2026-08-26 增量 - 证据采集（incr/0011，ADR-018）

权限 23 → 24，授权 79 → 84。

| 权限 | 是什么 | 授予 |
|------|--------|------|
| `account.record` | 记录互动与承诺——发生了什么，不是客户是谁 | sales_leader / marketing_manager / sales_rep / presales / delivery_manager |

**功能键不变，仍是 19。** ADR-006 曾要求为证据面新增两个功能键，ADR-018 以
「裁定而非新增」收口：证据面不单独售卖，随免费的 `account.manage` 一起走。

原来整个证据面挤在 `account.write` 下，而只有三个角色持有它——坐在客户会议里的
交付经理写不下发生过什么，跑活动的市场经理记不下由此产生的一次对话。记录发生了
什么和编辑客户主记录不是同一件事，把两者合并等于让最常见客户的人闭嘴。
不给 `sales_ops`（运营不见客户）和 `viewer`（只读就是只读）。

## 2026-08-28 增量 - 折扣签字权（incr/0012，ADR-019）

权限 24 → 25，授权 84 → 86。

| 权限 | 是什么 | 授予 |
|------|--------|------|
| `pipeline.discount` | 批准低于底价的报价 | sales_leader / sales_ops |

**功能键不变，仍是 19。** 一次签字不是可单独售卖的能力，它约束的行项已经在
`pipeline.manage` 键后面。

底价从 incr/0007 就存在，定价规则也一直在低于底价时把行项标成待批——但**没有任何
角色能把这个标志降下来**。「折扣待批」于是不是流程里的一步，而是商机的永久属性。
一个只会说不的控制不是控制，是大家学会绕开的障碍。

**刻意与 `pipeline.write` 分离**：报出低于底价的人，不能是给它签字的人。合并两者
等于每个能敲价格的销售都能自我授权，底价就不再约束任何人。

授予的两个角色与 `catalog.price` 完全相同，理由是一个：定底价和为底价开例外是同
一份权力的两半。`sales_ops` 本来就能移动底价，所以在交易层面扣着例外权不给运营，
是姿态而不是职责分离。不给 `sales_rep`（底价就是用来约束正在成交的那个人的），
也不给 `presales` / `delivery_manager`（都不拥有商务条款）。
