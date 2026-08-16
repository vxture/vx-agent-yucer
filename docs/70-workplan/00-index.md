# 70-workplan - 构建计划与批次跟踪

本仓由 `vxture-template` 实例化而来（product_code = `yucer`）。每个批次是一个 PR，
带机器可验收的门禁。治理基座、平台集成契约面、部署流水线随模板继承，**不重做**。

## 批次 0 - 继承自模板（已完成，不在本仓重做）

模板已交付并验证的部分，实例化后直接生效：

| 来源批次 | 范围 | 状态 |
|---------|------|------|
| 模板批次 1（A-D） | 治理基座、四层密钥卫生、SCA 硬门禁、docs 编号体系、分支保护 ruleset | 继承 |
| 模板批次 2（2a-2g） | 平台集成三通道（C1 OIDC RP / C2 权益 / C3 供给与用量）、业务面 DB 契约 schema、离线 Mock 验证页 | 继承 |
| 模板批次 E | 部署流水线（`deploy`/`build`/`rollback`/`db-init` + `tailnet-ssh-connect`），已在模板演示实例上端到端验证 | 继承 |

五个必需检查是稳定契约，**不得重命名**：`quality-gate` / `build` /
`test-coverage` / `audit` / `gitleaks`。

## 批次 1 - 产品域框架（本批次）

把模板的留白区按销售超级智能体填满。交付的是**结构**，不是业务页面实现。

| 项 | 交付物 | 验收 |
|----|-------|------|
| 1a | 产品定义与八大能力域边界 | `docs/20-specs/10`、`20` |
| 1b | 全链路业务规则（阶段机、预测口径、归因、人机边界） | `docs/20-specs/30` |
| 1c | 能力矩阵（档位 x feature key）+ 实现 + 单测 | `capability.ts` / `capability.test.ts`；`docs/20-specs/40` |
| 1d | 角色权限目录 + 幂等种子 | `incr/0001_seed_authz_catalog.sql`；`docs/20-specs/50` |
| 1e | 域数据模型：5 个域 schema / 24 张表 + 服务角色授权 + 列级写锁 | `00_baseline.sql`、`97`、`98` |
| 1f | Prisma 与 DDL lockstep | `check-data-architecture.mjs --strict` 34 张表全对齐 |
| 1g | 域架构与数据设计文档 + 三条 ADR | `docs/30-design/` |

**批次 1 验收**：`lint:docs-numbering --strict` 与 `lint:data-design --strict` 均
exit 0；五个 CI 检查全绿。

## 批次 2 - 域服务层、两道门、智能体两平面

| 项 | 范围 | 状态 |
|----|------|------|
| 2a | 权限门 `authz/`：成员懒加载、角色权限判定、与权益门的组合判定、动作目录 | 已交付 |
| 2b | 域业务规则纯函数 `domains/<d>/lib/`：阶段机、归因计算、预测汇总、信号评分、提案生命周期（全部可单测、不碰 IO） | 八域全部已交付 |
| 2c | 域持久化端口 + 服务层 + Prisma 适配器（沿用模板的 port/adapter 形态） | **八域全部交付**：端口、服务、Prisma 适配器齐备 |
| 2d | **智能体两平面接入**（ADR-004）：`platform/s2s` 令牌、`agent/atlas` 模型面、`agent/runos` 能力面与 Skill 分发 | 已交付 |
| 2e | 智能体编排 `agent/orchestrator`：会话回合把模型输出落成 `agent_action` 提案 | 已交付 |

### 2a/2b/2d 已交付内容

- `authz/`：19 权限 / 7 角色的**类型化镜像**，`catalog.test.ts` 逐条解析
  `incr/0001` 种子 SQL 断言双向一致——镜像漂移会让 CI 红，而不是悄悄分叉。
  两道门的顺序（权益先、权限后）由 `gate.ts` 固化并单测。
- `authz/actions.ts`：产品动作目录，把每个动作与它的 (feature key, 权限码) 配对
  写成**数据**。这是防「某个写接口只查了权益、忘了查权限」的结构性手段。
- `agent/atlas`：**只按 `endpointCode` 路由**，四个 copilot 任务各自可由环境变量改指；
  错误按码分类重试（`GRANT_DENIED` / `QUOTA_EXCEEDED` 永不重试，`RATE_LIMITED` 用
  body 里的延迟而非 `Retry-After` 头）；SSE 中途失败会**抛出**而不是被当成正常结束。
- `agent/runos`：MCP 四工具面，`task_id` 本地先校验；两层错误（传输层 / 工具结果层）
  分别建模。Skill **只分发不执行**：校验 `result_kind`、逐次核对 `content_digest`、
  渲染进提示词时带来源围栏。
- `platform/s2s`：缺 `workspace_id` **直接抛错**——Atlas 缺它不报错，只是静默跳过配额
  并把用量记到 NULL 工作空间。

### 2c 的分层形态（八域一致）

```
service.ts   两道门 -> 规则纯函数 -> 端口          [八域全覆盖]
store.ts     端口 + 内存实现（workspace_id 是每个方法的第一个参数）
prisma-*.ts  Prisma 适配器，写入前过列锁镜像       [八域全覆盖]
```

`domains/shared/column-locks.ts` 是 `98_column_locks.sql` 的类型化镜像，
`column-locks.test.ts` 解析 DDL 双向对账。适配器写库**前**校验补丁，把
`permission denied for column ...` 变成调用点上的具名违规——数据库仍是兜底，
但不再是第一个说不的人。

`pnpm --filter @yucer/app test`：560 项全绿。

## 批次 3 - 产品界面与智能体交互（已交付）

| 项 | 范围 | 状态 |
|----|------|------|
| 3a | 八域路由与导航，两道门接入页面。UI 元件一律取自 `@vxture/design-system` | 已交付。`routes.test.ts` 断言每个导航项都有页面——导航先于目的地上线过一次，这条守卫防它再来 |
| 3b | 商机管道与预测视图 | 已交付。汇总与快照写入用**同一个** `rollUp()`，读到的和冻结的不可能不一致 |
| 3c | 智能体会话与提案裁决——含批量裁决 | 已交付。会话与队列同页但**视觉分离**，无内联采纳；批量确认由 `batchRisk()` 生成，无法渲染成「采纳 200 项」 |
| 3d | 信号收件箱与处置 | 已交付（超出原计划）。评分、判重、忽略、升级为线索 |
| 3e | 流式回答 | 已交付（超出原计划）。持久化契约与非流式一致，含消费者中途放弃的情形 |
| 3f | 剧本接地与剧本目录 | 已交付（超出原计划）。`agent_playbook` 按主题域选取、**上限 3 条**、仅 active、内容加围栏并标注为参考材料；目录在助手页只读可见——被注入提示词的文本必须可被阅读和质疑 |
| 3g | 全链路演示数据 | 已交付（超出原计划）。5 家客户 / 10 条商机（覆盖全部开放阶段）/ 4 个交付项目 / 8 条信号 / 5 条线索 / 4 条剧本，跨域引用由 `demo-seed.test.ts` 断言，含一条贯穿计划→战役→信号→线索→商机→项目→回款的完整链条 |
| 3h | 商机详情：推进 / 定价 / 阶段轨迹 | 已交付（PR #22）。`advanceStage` 与 `submitForecast` 此前**零非测试调用方**——后端完整而界面从未接上，转化来的商机永远停在 `qualify`、金额为 null、无法关闭。同时让 `planProbabilityOverride` 首次可达：「人工赢率覆盖机器建议」在没人能设置赢率之前只能表达一半 |
| 3i | 成员与角色管理 | 已交付（PR #23）。此前每个工作区**只有一个可用的人**：同事登录后 `roles: []`、八域全隐藏、渲染锁定态。含**最后一名管理员不可移除**守卫（所有者引导只在首次登录跑，无人持有 `admin.manage` 即无回头路），以及 `lockoutReason()` 区分「未订阅」与「无角色」——后者付再多钱也解决不了 |
| 3j | 决策链补录关系 | 已交付（PR #27）。`linkContacts` 此前无调用方：面板告诉销售「决策人不可达」却不提供任何能改变它的动作。测试断言的是**判断翻转**，不是写入成功 |
| 3k | 计划与战役生命周期控件 | 已交付（PR #28）。`transitionPlan` / `transitionCampaign` 是最后两个无调用方的服务函数。选择器只列迁移表允许的动作，并以**等价关系**断言（每一组 `(from,to)`，「提供」与「接受」必须同真同假） |

### 一轮六视角审计（2026-08-16）

对全仓做了一次六视角审计（产品完整性 / 门控正确性 / 数据完整性 / 智能体两平面 /
测试缺口 / 界面质量），36 条原始发现，经**独立质疑者对抗验证**后确认 4 条 critical，
4 条被驳回（这正是验证阶段的价值——半数没扛住敌意复读）。四条已全部关闭：

| 发现 | 处置 |
|------|------|
| D6 管道完全只读，无人能推进/定价/关闭商机 | PR #22 |
| 无角色管理界面，工作区只能有一个可用的人 | PR #23 |
| 放弃 SSE 流只 `releaseLock()` 不取消，上游继续生成并计费 | PR #24 |
| `platform/s2s.ts` 零测试，ADR-004 的计费主体不变量无人守 | PR #25 |

PR #24 顺带发现超时其实什么都没管住：`timeoutMs` 在响应 resolve 时清除，而那是
**响应头到达**的时刻，两个客户端的 body 读取都是无界的。PR #25 在写测试的过程中发现
`cacheKey()` 用 `"|"` 拼接**不是单射的**（`tenant "a|b"+ws "c"` 与 `tenant "a"+ws "b|c"`
同键），一个工作区铸出的凭证会被交给另一个——测试第一次跑就红。

PR #26 处理审计尾部中**不涉及商业判断**的部分：账户详情页直接持有 store 句柄（隐藏
导航链接不是访问控制，直接输 URL 照样返回客户档案与联系人名单）；`execute()` 在门之前
读行，使未授权者能通过 `not_found` 与 `permission_denied` 的差异**枚举有效提案 id**。

### 界面层的两条纪律

**没有任何页面在本地重算商业结论。** 按钮的可见性一律来自服务端动作会重跑的同一个
`can()` 门。信号页曾经用 `["pro","business","enterprise"].includes(tier)` 算过一次，
上线前被抓掉——那是产品在本地推导商业结论，套餐一改就漂移。

**全部非 ASCII 文本集中在两个纯数据文件**：`(app)/lib/messages.ts`（界面文案）与
`domains/shared/demo-fixtures.ts`（演示数据的展示文本）。两者都不含逻辑，`app/` 下
其余源文件全部 ASCII，可机器穷举（TD-002）。

## 已交付的运行形态（批次 2-3 完成后）

```
浏览器 ─ (app)/ 八域页面 + 会话/裁决
           │  服务端组件解析会话 → 权益 → 权限，客户端只拿结论
           ↓
        domains/<d>/service.ts    两道门 → 规则纯函数 → 端口
           ↓
        domains/<d>/store.ts      端口（workspace_id 是每个方法第一个参数）
           ↓                      内存实现 | Prisma 适配器（写前过列锁镜像）
        PostgreSQL 34 张表        列级写锁兜底

        agent/atlas   模型面（唯一 LLM 出口，只按 endpointCode 路由）
        agent/runos   能力面（MCP 四工具，Skill 只分发不执行）
```

**609 项单测**；`quality-gate` / `build` / `test-coverage` / `audit` / `gitleaks`
五个必需检查全绿。

## 批次 4 - 平台注册与首次上线

| 项 | 范围 |
|----|------|
| 4a | 平台侧注册：OIDC client `yucer` / `yucer-beta`、域名 `yucer.vxture.com`、端口分配 |
| 4b | `PRODUCT_CODE` 仓库变量、部署 Environment 与密钥、worker02 栈根目录 |
| 4c | `db-init` 应用三段式 DDL + `incr/0001` 种子 |
| 4d | 首个生产 tag `v0.1.0` |

清单见 `docs/50-deployment/10-platform-registration-checklist.md` 与
`20-github-bootstrap-checklist.md`。

## 批次 5 - 商机侦探数据接入

| 项 | 范围 |
|----|------|
| 5a | 信号采集接入（`signal.external_feed`，business 档位能力） |
| 5b | 信号评分模型与衰减策略（口径见 `20-specs/30` 第 3 节） |
| 5c | 线索转商机的归因闭环验证 |

## 等待外部裁定的事项

| 事项 | 卡在哪里 | 记录 |
|------|---------|------|
| **TD-002** 界面文案违反 source ASCII-only | 等**平台仓修订标准**。`CLAUDE.md` 规定标准缺口先在平台仓修、不得在产品仓自造，因此本仓只登记不裁定 | `docs/60-operations/00-index.md` |
| 提案队列在免费档是否可读 | 等**产品裁定**。`listProposals` 用 `copilot.playbook.view`（功能 `copilot.ask`，free），而其他所有提案入口要 `copilot.suggest`（pro）。留着它当降级挽留面是正当理由，收紧它也是——两者都是商业决策，按 `CLAUDE.md` 需要 ADR，不是悄悄改一个门 | 审计确认发现，未处置 |
| `strategy.plan.approve` 是否成为真权限 | 等**产品裁定**。它与 `strategy.plan.update` 是两个不同 action id，但都解析到 `strategy.write`——**分离是名义上的**，能编辑计划的人也能审批。要做成真正的职责分离，需 `catalog.ts`、种子 SQL 与角色文档一起动 | PR #28 记录了现状 |
| Prisma 适配器完整性问题 | 等**一条能连数据库的 CI 通道**。见下 | 审计 R7/R8，未处置 |

### 为什么 Prisma 适配器的问题没有一并修掉

审计在适配器层指出了几处真问题：用 `count()` 分配 `opportunity_no` / `lead_no`
（其注释声称事务提供了 READ COMMITTED **并不提供**的串行化，并发下靠唯一索引兜底成
偶发失败）、`saveWinLossReview` 的 upsert `where` **未按工作区限定**（服务层先做了
归属校验所以当前不可利用，但它是潜在的跨工作区写，且与该 port 自己声明的规则矛盾）、
`recordSignal` 的裸 `catch {}` 把外键/CHECK 失败一律报成重复。

**这些没有修，是因为在本环境里无法验证**：所有 Prisma 适配器一个测试都没有，且这里
没有数据库。往写路径上打没验证过的补丁，比留着一个已登记的已知问题更危险。正确顺序
是审计 R8——先做 `store-contract.ts` 契约套件，对 in-memory 恒跑、对 Prisma 在
`DATABASE_URL` 存在时跑——然后再改。这也会顺带抓住已知的适配器分歧：
`PrismaPipelineStore.listOpportunities` 过滤 `deletedAt: null` 而 in-memory 没有软删
概念，也就是说**全仓的服务层断言目前证明的是另一个实现**。

TD-002 的现状是**收敛而非解决**：全部非 ASCII 文本集中在两个纯数据文件——
`portals/app/app/(app)/lib/messages.ts`（界面文案）与
`portals/app/app/domains/shared/demo-fixtures.ts`（演示数据展示文本），其余源文件
全部可机器校验。**收敛的口径是「可穷举且只含数据」，不是「只有一个文件」**：新增中文
文本只能进入这两个文件，装配逻辑（如 `demo-seed.ts`）必须保持 ASCII。

标准修订后二选一收口——平台仓为终端用户文案开显式口子，或引入正式 i18n 方案把文案
移出源码树。**在裁定之前收敛状态维持不变，不要「顺手修掉」**：把文案改成 `\uXXXX`
转义确实能满足字面规则，但会得到一份人类无法维护的文案和一份无法评审的演示数据。

## 未决事项

- ~~智能体的模型编排与工具协议尚未定型~~ → 已由
  [ADR-004](../30-design/decisions/ADR-004-atlas-and-runos-as-the-only-agent-planes.md)
  决策：模型走 Atlas（只按 `endpointCode` 路由），能力与技能走 Runos 四工具面，
  Skill 只分发不执行。
- Runos 的 `delegation_token`（对象级判定凭据）如何从 yucer 会话派生，未定型；当前
  实现只透传，不自行构造。
- 信号外部数据源的选型与合规边界未定，是批次 5 的前置；走 Runos connector 还是平台
  数据服务取决于运营侧注册了什么。
- **接入前置（运营侧，不在本仓）**：Atlas 需要一条 `(yucer, endpointCode)`
  product-grant，否则任何模型调用都是 `403 GRANT_DENIED`；Runos 生产目录当前为空且
  enforcement 关闭，首注册 / 首授权 / 开 enforcement 是三步运营动作。在那之前
  `runos_discover` 返回空列表是**正常返回**，不是故障。
