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

### 开通订阅的人是本产品的超级管理员（2026-09-15 重申并补洞）

这不是产品自己定的规矩，是平台契约：令牌里的 `workspace:owner` 就是「首登超级管理员」，
平台用它回答「产品的第一个管理员是谁」这个引导问题（`auth/lib/claims.ts`）。产品这边
`authz/context.ts` 据此授予 `OWNER_BOOTSTRAP_ROLE = sales_leader`（25/25 权限），所以
开通订阅的人进来就能做系统配置并给别人分配角色，不需要任何人先给他开门。

**引导的触发条件是「一个角色都没有」，不是「第一次见到这个人」**（2026-09-15 修）。
原本写的是 `created && isWorkspaceOwner`，只在首次见到成员时跑一次，这会把超级管理员
困住：成员行是工作区里**任意一个页面**首次加载时建的——包括「本工作区尚未订阅」那一张
——所以先来看过产品、之后才开通的人，那唯一一次机会早就用掉了。此后他永远停在「还没有
为你分配角色」上，而那张页面让他去找管理员，管理员就是他自己。

改成「持有角色数为 0 时才补」，两种状态各自成立：

| 状态 | 处理 | 理由 |
|------|------|------|
| owner 被改成 `viewer` 等其他角色 | **不动** | 这是管理员的决定，每次登录都覆盖回去等于偷偷推翻它 |
| owner 一个角色都没有 | **补回 `sales_leader`** | 工作区没有人能管理它了，这不是任何人能有意设定的状态 |

代价说明白：如果有人**故意**把工作区所有者的角色全部撤光来锁住他，这条会把它恢复。
接受，因为平台契约里 `workspace:owner` 就是该工作区下每个产品的超级管理员基线；而
「所有者无角色、又无人持有 `admin.manage`」的工作区是永久锁死的，没有任何出口。

## 权限目录（19 项）

权限码格式 `<域>.<动作>`，域前缀与九个能力分区一致（含 D9 产品目录的
`catalog.*`——D9 是唯一一个不带功能键、门控完全落在权限层的分区，见 ADR-017）。

**这张表下方的行数本身已经落后于种子。** 表头写的「19 项」是 D9 加入前的数字；
`incr/0010` 起陆续追加了 `catalog.*` 三条、`account.interaction`/`account.commitment`、
折扣签字、阶段/商机类型相关权限，且 `incr/0064` 退役过其中两条——净数没有随每次增量
回填到这里，逐条核对留给专门一批，不在本次一并猜一个数字。

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
| `catalog.read` | 读目录、方案、价目 | 全部九个角色 |
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


## 2026-09-01 增量 - 销售组织的两级（incr/0021）

**角色 7 → 9，授权 86 → 117。权限不变，仍是 25。**

owner 裁定：产品定义自己的角色，与平台无关，并点名 大区总监 / 总经理 / 销售经理。

| 角色 | 是什么 | 相对下一级多了什么 |
|------|--------|--------------------|
| `sales_manager` 销售经理 | 一线管理者：带一个团队，**向上承诺数字** | 在 `sales_rep` 之上加 `pipeline.forecast` + `planning.read` |
| `regional_director` 大区总监 | 可以**低于底价签字**，并**设定本区的目标** | 在 `sales_manager` 之上加 `pipeline.discount` + `planning.write` + `strategy.read` |

**两个角色，不是三个。** 「总经理」就是已经存在的 `sales_leader`——它持有
`admin.manage` / `copilot.autopilot` / `strategy.approve`，即一个销售组织顶端所持有的
全部。再加一个角色码只会得到**一套完全相同的权限集换个名字**，而两个码一个答案的目录，
是一份假装自己做了区分的目录。`catalog.test.ts` 现在有一条守卫直接断言这件事：
**没有任何两个角色持有相同的权限集**。要 org 头衔上屏，那是 `ROLE_LABEL` 的事。

**`sales_manager` 的分界线是「承诺」**，而目录早在一级之下就画过同一条线：`sales_rep`
持有 `pipeline.write` 却**没有** `pipeline.forecast`，注释写着「拥有这个单，但不拥有
预测承诺」。一线经理正是做出那个承诺的人。`planning.read` 随之而来——**你没法对着一个
看不见的目标做承诺**。

**`regional_director` 拿到 `pipeline.discount`，但刻意不给 `catalog.price`。** 这是
ADR-019 的分离套在新一级上：**为低于底价的单签字，和决定底价画在哪里，是两件事**。
一个能移动底价的总监，等于在对着自己画的线签字。

**两个都不给 `admin.manage` / `copilot.autopilot` / `strategy.approve`。** 管理销售组织
和管理工作区不是同一份工作；裁决一条提案，也不等于有权关掉「需要裁决」这件事本身。

**权限一个没加**，这是这次改动的诚实形状：产品没有多出任何一件**谁可以做的新事**，
只是多了**两个可以站的位置**。

### 必须一起读的一条：这两个角色没有数据范围

`listPipeline` 过了门之后**返回整个工作区的商机**，`filter` 是界面传的、不是强制的。
**本产品只有「你能做什么」一个轴，没有「你能看到哪些行」。**

所以今天：**大区总监看到的行和销售经理看到的行完全一样**——整个工作区。而「大区」的
区别性特征恰恰是这个产品还没有的范围。owner 于 2026-09-01 裁定 **先加角色、数据范围
下一批**，这一段写在这里，是为了让目录**不假装范围已经分开了**。

## 2026-09-09 增量 - 角色属于工作区（incr/0046，ADR-028）

权限目录不变（25 条，预置，不可增删改）。变的是**角色**：

- `local_authz.role` / `role_permission` 成为**预置角色**——九行，带 `name`、
  `description`（一句话说明）与 `sort_order`，仍为运行时只读。
- 新增 `local_authz.workspace_role`（工作区自己的角色：预置的副本与自定义角色，
  `role_code` 为锚不可改，`name` / `description` / `sort_order` 可改）与
  `workspace_role_permission`（角色持有哪些权限，只增删）。
- `member_role.role_id` 改指向 `workspace_role`，`ON DELETE RESTRICT`：有成员持有
  的角色不能删。增量已为每个有成员的工作区物化九个预置并改指链接；此后首次见到
  的工作区由应用在首次登录时物化。
- 「系统预置 / 自定义」由**比对**得出（名称、说明、权限集合），不落库。重置预置
  把九个预置恢复为种子，自定义角色不动。
- 唯一可能把工作区锁死的改动——去掉管理员唯一持有的管理角色上的 `admin.manage`——
  在服务层拒绝（`last_admin`），与成员侧同一条规则。

## 2026-09-09 增量 - 集团级预置角色（incr/0047）

权限目录不变（25 条）。角色 9 → 24，授权 117 → 287；任意两个预置的权限集合都不相同
（catalog.test.ts 守着这一条）。清单按层级从集团层起：

| 业务线 | 角色（层级） |
|--------|-------------|
| 管理 | 销售负责人（高管）、高管（高管）、财务（专员）、系统管理员（专员）、只读成员（专员） |
| 销售 | 销售代表（专员）、销售经理（经理）、高级销售经理（高级经理）、大区总监（总监）、大区总经理（总经理） |
| 渠道 | 渠道经理（经理）、高级渠道经理（高级经理） |
| 交付 | 交付经理（经理）、高级交付经理（高级经理） |
| 售前 | 售前顾问（专员）、高级售前顾问（高级经理） |
| 市场 | 市场专员（专员）、市场经理（经理） |
| 运营 | 销售运营专员（专员）、销售运营经理（经理，原「销售运营」） |
| 商拓 | 大客户经理（经理）、商机开发代表（专员）、商务专员（专员）、客户成功经理（经理） |

两个分组是**词表**，不是写死的枚举（owner：数据库不要写死，支持自定义，参考区域
设置）：`local_authz.role_line` / `role_rank`，一工作区一份，与 `yucer_core.industry`
同形（代码为锚、名称与顺序可改、有角色在用的删不掉）；`workspace_role.line_id` /
`rank_id` 按 uuid 关联，可空。预置角色表以代码记录自己的业务线与层级，物化到工作区
时解析成该工作区的词表行。增量为已有角色的工作区种入预置词表（仅当词表为空）、补上
十五个新预置并为既有副本填好分组；名称、说明、授权不动。

## 2026-09-10 增量 - 预置角色排序固化（incr/0048）

owner：预置角色排序固化，方便用户选择，以业务线第一维度，业务线内层级从高到低；
业务线顺序来自分组管理的顺序，层级同理。0047 每条线自下而上排，0048 翻过来：
大区总经理 → 大区总监 → 高级销售经理 → 销售经理 → 销售代表。只改 `sort_order`；
从未调整过顺序的工作区副本同步重排，调整过的保持自己的顺序（重置预置可恢复）。
`PRESET_ROLE_ORDER` 为镜像，catalog.test.ts 对着最后一个增量校验，并断言线序与
线内层级降序。

## 2026-09-10 增量 - 管理线、七个负责人与销售阶梯重切（incr/0049）

owner：业务线「集团与通用」改为「管理」，顺序：高管、销售负责人、财务管理员、系统
管理员、只读成员；销售：大区总经理、大区销售总监、分公司总经理、销售总监、高级销售
经理、销售经理、销售代表；渠道、交付、售前各增负责人；市场：市场负责人、高级市场经理、
市场专员；运营：运营负责人、高级运营经理、运营专员；客户与商机开发不变。

角色 24 → 31，授权 287 → 397；任意两个预置的权限集合仍不相同。销售阶梯重切：
`sales_director`（销售总监）接过原大区总监的集合，`regional_director`（改名大区销售
总监）在其上加 `strategy.write` + `campaign.write`，`branch_general_manager`（分公司
总经理）加 `delivery.write` + `campaign.write`；大区总经理不变。五个改名：财务 → 财务
管理员，大区总监 → 大区销售总监，市场经理 → 高级市场经理，销售运营经理 → 高级运营
经理，销售运营专员 → 运营专员。工作区副本：仍用预置原名的改名，仍持原集合的
`regional_director` 补两条授权，从未调序的按新顺序重排，仍叫「集团与通用」的业务线
改「管理」；租户改过的一律不动。

## 2026-09-10 增量 - 层级词表自上而下（incr/0050）

owner：业务线的顺序改了，层级配置的顺序还没改。预置层级顺序改为 高管 / 总经理 /
总监 / 高级经理 / 经理 / 专员，与角色清单一致；最低一级由「专员 / 代表」改称「专员」；从未调过顺序的工作区同步重排。

## 2026-09-13 增量 - 商机阶段目录的编辑权（incr/0057-0059）

**权限 25 → 26，授权 397 → 411。角色数不变，仍是 31。**

`incr/0057` 把「商机阶段」从硬编码的七值联合（`STAGES`/`DEFAULT_PROBABILITY`/
`TERMINAL_STAGES`/`OPEN_STAGE_ORDER`，散落在 `stage.ts` 四个模块常量里）变成一份
每个工作区自己拥有、可改名/排序/改默认赢率/增删的目录（`yucer_pipeline.
stage_definition`）；`incr/0058` 把 `opportunity.stage` 原来的固定 `CHECK` 换成指向
这份目录的复合外键。两个都不动权限，因为**推进单个商机**（advanceStage，调用
`pipeline.opportunity.advance`）根本没变。

`incr/0059` 加的是**另一件事**：重新定义阶段目录本身——改名、调顺序、改某个非终态
阶段的默认赢率、增删阶段。这和"推一个单子往前走"不是同一份权力，形状与
`pipeline.write` / `pipeline.forecast` 的既有分割完全一致（一线销售拥有自己的单，
不拥有"预测承诺"）：一个只拥有自己单子的销售，不能重新定义"赢单"对全团队意味着什么。

| 权限 | 是什么 | 授予 |
|------|--------|------|
| `pipeline.stage.view`（读，权限码复用 `pipeline.read`） | 查看阶段目录 | 与查看商机同一批人——查看目录不是新权力 |
| `pipeline.stage.manage`（写，新权限码 `pipeline.stage`） | 改名/排序/改默认赢率/增删阶段 | 与 `pipeline.forecast` 完全相同的十四个角色 |

**不给 `pipeline.write`，给 `pipeline.forecast` 的持有者。** `pipeline.forecast` 已经是
目录里"商机相关、但超出一线销售自己单子范围"的那条线——提交预测快照要向上承诺一个
数字，重新定义阶段目录要向上承诺一整个团队的漏斗形状，是同一类动作。`sales_rep` /
`presales` / `delivery_manager` 都不持有 `pipeline.forecast`，因此也都不持有
`pipeline.stage`。

**没有新增功能键。** 阶段目录是 `pipeline.manage` 这个既有键背后的配置面，和
`pipeline.discount` 治理该键下的一个侧面而不单独成键是同一个理由——功能键冻结在 19。

## 2026-09-13 增量 - 商机类型分轴（incr/0060-0061）

**权限 26 → 27，授权 411 → 423。角色数不变，仍是 31。**

`incr/0060` 建了一条全新的分类轴——`opportunity` 此前完全没有 type/kind/category 字
段，五个预置值（新签/续费/增购/项目型/产品型，`yucer_pipeline.deal_type`）混合了两
个维度：新签/续费/增购是商业动作，项目型/产品型是交付形态，与本产品别的词表同一种
"一份摊平列表"的简化。`opportunity.deal_type_id` 可空，因为绝大多数历史商机没有类
型，"没分类"是诚实的默认值而不是要填的错误。

`incr/0061` 加的权限对，**添加方式跟 `pipeline.stage` 一样**（读复用 `pipeline.read`，
写是新权限码），但**授予范围完全不同**：

| 权限 | 是什么 | 授予 |
|------|--------|------|
| `pipeline.dealType.view`（读，权限码复用 `pipeline.read`） | 查看类型目录 | 与查看商机同一批人 |
| `pipeline.dealType.manage`（写，新权限码 `pipeline.dealType`） | 改名/排序/增删类型 | 与 `pipeline.write` 完全相同的十二个角色，**包含 `sales_rep`** |

**给 `pipeline.write` 的持有者，不是 `pipeline.forecast` 的。** 这是与 `pipeline.stage`
刻意不同的一个判断：重新定义阶段目录改写了"赢单"对全团队漏斗的意思，是工作区级别的
政策；给一笔商机分类是"新签还是续费""项目型还是产品型"，更接近**拥有这一单**本身的
一部分，而不是重新定义一条团队规则。一线销售能推进自己的单（`pipeline.write`），也
应该能说清这一单是什么类型——`sales_rep` 因此持有 `pipeline.dealType`，但不持有
`pipeline.stage`。

**没有新增功能键，理由与 `pipeline.stage` 相同。**

## 2026-09-13 增量 - 商机配置装配页（PR4，无新增 DDL）

**本节的写权限部分已被下面「商机配置：统一权限」一节取代——六个区块各自的写权限
段落、以及"预测阈值和账龄分档区块可能整页可见但区块本身仍然读不到"那条限制，都
不再成立。保留本节是因为它记录了装配页本身诞生的真实过程；读当前状态请看下一节。**

**权限数不变，仍是 27。角色数、授权数都不变。**

商机配置批次的最后一步：把 赢丢原因/商机类型/商机阶段/预测阈值/计价规则/账龄分档
六个区块装到同一个页面 `/admin/opportunity`，取代它们各自散落的（或者，对前三个来说，
是这个批次自己刚建的临时）路由。新增一个 ActionId `pipeline.opportunityconfig.view`
门禁整页可不可见，但**权限码复用 `pipeline.read`**——跟 `pipeline.stage.view` /
`pipeline.dealtype.view` 完全一样的选择，所以这次装配不给任何人多开一寸读权限，也
不需要新的种子增量：`pipeline.read` 已经存在，六个区块各自的写权限（
`pipeline.winloss.record` / `pipeline.dealType` / `pipeline.stage` /
`pipeline.forecast` / `catalog.pricebook.upsert` / `delivery.revenue.upsert`）
原样保留在各自的保存动作里，页面本身只决定"能不能看见这六个区块"，不决定"能不能改
哪一个"。

**预测阈值和账龄分档区块可能整页可见但区块本身仍然读不到**：`pipeline.forecast.view`
挂着 `pipeline.forecast` 付费功能键，`delivery.revenue.view` 挂着 `delivery.revenue`
功能键，两者都不是 `pipeline.opportunityconfig.view` 唯一检查的 `pipeline.read` 能
保证的。页面因此对这两个区块（以及计价规则，虽然它的 `catalog.pricebook.view` 只挂
`catalog.read`，实务上人人都有）分别再做一次它们各自的读权限判断，读不到就整块不渲
染——展示"工作区的默认值"当作"工作区的真实设置"会是比不渲染更糟的错误。

## 2026-09-13 增量 - 商机配置：统一权限（incr/0063-0064）

**权限 27 → 28 → 26，授权 423 → 446 → 420。角色数不变，仍是 31。**

owner 定的原则："admin 权限简单化、开放化——档位门槛主要用在真正的业务域页面
（预测复核 `/forecast`、赢丢复盘 `/winloss`、收款 `/collection`），配置页应该是
基础全面提供的，这样开通档位后立刻就能用，不用现开现配。" 据此把 PR4 装配页
六个区块各自的写权限、以及预测阈值/赢丢原因/账龄分档三块各自的付费档位门槛，
一次性收拢成页面级的单一读/写模型。

**写：incr/0063 新增一个权限码，替换原来六个。**

| 权限 | 是什么 | 授予 |
|------|--------|------|
| `pipeline.opportunityconfig.manage`（写，新权限码 `pipeline.opportunityConfig`） | 商机类型/商机阶段/赢丢原因/预测阈值/账龄分档/计价货币，六块任意一块的增删改 | 原六个权限点（`pipeline.write` / `pipeline.forecast` / `delivery.write` / `catalog.price` / `pipeline.dealType` / `pipeline.stage`）持有者的**并集**，31 个角色里的 23 个 |

授予按并集：现在持有六个权限点中任意一个的角色，都拿到新的统一权限，不缩小任何人
现有的写权限范围。原六个权限点中的 `pipeline.write` / `pipeline.forecast` /
`delivery.write` / `catalog.price` **不退役**——它们各自还门禁着装配页之外的其他
动作（`recordWinLossReview`、`applySuggestedCategory`、真正的价目表、
`delivery.project.upsert`/`.milestone.upsert`、线索转化、商机创建/编辑/推进），
装配页六个保存动作的 SERVICE 层门禁换成新权限，不影响这些其他动作。

**`pipeline.dealType` / `pipeline.stage` 是例外，incr/0064 把这两个退役了。** 这两个
权限点从建立起就只被装配页自己的商机类型/商机阶段增删改动词检查，没有像另外四个
那样在别处还有别的用处——incr/0063 把这两个动词的门禁换成新权限后，这两个权限点
变成了"发出去了、但没有任何动词再检查"的状态，`authz/actions.test.ts` 的硬规则
（每个权限点都必须被某个动作要求，没有例外机制）不允许这种状态存在。incr/0064
因此把这两行从 `local_authz.permission` 删掉（`ON DELETE CASCADE` 一并清掉对应的
`role_permission` 授权行）——这是这个权限目录第一次真正的**退役**，而不是新增。

**读：不新增权限点，复用装配页已有的 `pipeline.opportunityconfig.view`。** 预测
阈值/赢丢原因/账龄分档三块原来各自叠加的付费档位门槛（`pipeline.forecast`
PRO 档、`pipeline.winloss`/`delivery.revenue` BUSINESS 档）全部收掉——六个区块
现在统一只要通过装配页自己的 `pipeline.opportunityconfig.view`（复用
`pipeline.read`，FREE 档 `pipeline.manage` 功能键，等于没有档位门槛）就都读得到，
不再有"整页可见但某一块读不到"的情况。`listWinLossReasonsForConfig`/
`ageingCutoffsForConfig`（`domains/pipeline/service.ts`、
`domains/delivery/service.ts`）是专门为装配页开的两个只读分支，跟原来给
`/winloss`、`/collection` 用的 `listWinLossReasons`/`ageingCutoffs` 门禁完全不同——
后两者的付费档位门槛原样保留，`/winloss`、`/collection`、`/forecast` 三个真正的
业务页面对这三项能力的门槛完全没动，只收了装配页自己的。`pipeline.dealtype.view`/
`pipeline.stage.view`/`catalog.pricebook.view` 本来就没有真正的档位门槛（前两者是
FREE 档 `pipeline.manage`，后者压根没有功能键），不用动。

**顺带修掉一个缺陷**：赢丢原因区块原来没有像预测阈值/账龄分档那样单独做
"整页可见但这一块读不到"的降级——`pipeline.winloss.view` 一样挂着付费档位
（`pipeline.winloss`，BUSINESS 档），档位不够时会让**整个装配页**报错，而不是
只缺赢丢原因这一块。收掉这块的档位门槛之后，这个缺陷自然不再存在。

**商机类型"停滞天数覆盖值"字段（incr/0062）一并并入。** 这个字段之前故意单独
挂在 `pipeline.forecast.categorize`（与预测阈值本身同一权限，不给 `sales_rep`），
现在跟同一行的改名/排序字段一样走 `pipeline.opportunityconfig.manage`——装配页
统一成一个写权限之后，不再需要在同一个对话框里区分两条独立授权的写路径。

## 2026-09-14 增量 - 商机类型真正拆成两根轴（incr/0067）

**权限、角色、授权数全部不变（25 / 9 / 117 那一套种子没被碰）。这一条记在这里，
是因为上面 2026-09-13 那节亲手写下的"混合了两个维度"现在不成立了。**

`incr/0060` 的注释和本文上一节都白纸黑字承认过：五个预置值里，新签/续费/增购说的
是**这笔交易是什么性质**，项目型/产品型说的是**卖的是什么形态**，一个下拉框答两道
题，读的人得自己猜它答的是哪一道。当时按"跟本产品别的词表一样的一份摊平列表"接受
了这个成本。`incr/0067` 不再接受：

| 新表 | 中文 | 预置值 |
|------|------|--------|
| `yucer_pipeline.contract_type` | 签约类型 | 新签 / 续签 / 增购 |
| `yucer_pipeline.business_form` | 业务形态 | 项目定制类 / 标化产品类 / 咨询服务类 |

`opportunity` 相应地长出 `contract_type_id` + `business_form_id` 两列（都可空，
理由跟 `deal_type_id` 当初可空一样），回填之后 `deal_type_id` 与
`yucer_pipeline.deal_type` 在同一个增量里删除——`incr/0029`（product 的
category/status）、`0039`（赢丢原因）、`0040`（行业分类）都是这个套路，不留僵尸表。

**门禁一个字没改**，这是这次能低成本做的原因：读仍是
`pipeline.opportunityconfig.view`，写仍是 `pipeline.opportunityconfig.manage`
(incr/0063 统一后的那一个)，只是被这两条门禁管的动词由一套变成两套。
`authz/actions.ts` 里 `pipeline.dealtype.view` 换成
`pipeline.contracttype.view` + `pipeline.businessform.view`，两条都与被替换的那条
完全同型（`feature: "pipeline.manage"` + `permission: "pipeline.read"`）——ActionId
是纯 TypeScript 的动作目录，不是权限码，改它不动种子。

**"停滞天数覆盖"跟着业务形态走，不跟签约类型。** `incr/0062` 把它挂在混合轴上，
现在它落到它本来就属于的那根：一单能在同一阶段停多久，是**交付复杂度**的事——定制
项目的谈判周期天然长于标准品——跟这单是新签还是续签毫无关系。代价写在增量头注释
里：曾给新签/续费/增购设过覆盖值的工作区，那三个数字随旧表一起消失，因为它们在新
轴上没有位置，替它们编一个位置等于这个增量替谁都没决定的事做了决定。

**顺带修掉两个一致性问题**（owner 裁定一并处理）：

1. **续约商机从来不会自动打标签。** `openRenewal` 调 `createOpportunity` 时，别的
   可选字段都显式传了 `null`，唯独 `dealTypeId` 是静默遗漏的——续约身份只活在
   `sourceProjectId` 里，销售还得再手动选一次"续费"。
2. **「新签」有两套定义。** 报表口径的「新客户数」由 `countNewLogos()` 按"该客户
   历史首次赢单"算，销售手打的标签报表根本不读，两者可以各说各话。

一条规则函数 `suggestContractType({ fromRenewal, accountHasPriorWin })` 同时收口
这两件事：`createOpportunity` 在调用方没显式指定时算一个默认值填上——来自续约的落
「续签」，客户此前没赢过单的落「新签」，赢过的落「增购」——销售随时可改。
`countNewLogos()` 的算法**不动**，报表也**不去读**手工标签：标签是事前意图，
「新客户数」是事后事实，分工写进两边的注释。工作区把默认值那行删了或改了 code
就留空，不报错——猜不出来就不猜。
