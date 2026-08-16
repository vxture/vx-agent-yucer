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

### 界面层的两条纪律

**没有任何页面在本地重算商业结论。** 按钮的可见性一律来自服务端动作会重跑的同一个
`can()` 门。信号页曾经用 `["pro","business","enterprise"].includes(tier)` 算过一次，
上线前被抓掉——那是产品在本地推导商业结论，套餐一改就漂移。

**全部面向用户的文案集中在 `(app)/lib/messages.ts` 一个文件**，是 `app/` 下唯一含
非 ASCII 的源文件（TD-002）。

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
