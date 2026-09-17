# 计量能力清单（给平台侧的对接输入）

本文档回答的问题和 `40-capability-matrix.md` 不同，不要混淆：

- `40-capability-matrix.md` 第「计量」节是**裁定结果**——已经决定要计的（`yucer.copilot.turns`
  一个）、复核过决定不计的（八项顾问能力、token、外部信号源等）。那是产品侧的商业决策记录，
  权威、且已实现。
- 本文档是**能力盘点**——技术上「有没有可测量的数据源、上报机制是否具备」，不代表任何一项
  会真的变成指标或配额。是否设指标、要不要门控，是**平台侧的商业决定**；产品侧的责任只是把
  「能不能测」讲清楚。哪怕平台最终选择不设，这份清单仍然成立——它描述的是能力，不是决策。

2026-09-16 整理，覆盖 owner 点名的六个维度（AI 消耗、存储、席位、CRM 客户数量、Runos 调用
次数、行业对比）。每一节都标了代码/文档出处，不凭印象写。

## 1. AI 消耗

### 已具备的能力

`yucer.copilot.turns`（counter）已实现并计量，口径见 `40-capability-matrix.md`。**问题数量**
这个维度已经是现成能力，不是空白。

### 流式与非流式的区别（代码原文，不是概念性描述）

判据在 `app/domains/copilot/streaming-turn.ts` 的 `shouldStream()`：唯一依据是工作区**有没有
`copilot.suggest` 权益**（免费/入门档只买了 `copilot.ask`）。

| | 流式（免费/入门档） | 非流式（专业档及以上） |
|---|---|---|
| 能否调工具 | 不能——`STREAMING_OMITS_TOOL` 显式屏蔽 `propose_action` 工具 | 能——可调 Runos 工具、可写 `agent_action` 待人审提案 |
| 输出方式 | SSE 实时逐字返回 | 一次性返回完整答案 |
| 不能流式的原因 | — | 工具循环需要拿到模型的**完整**响应才能判断是否再调一次模型；半截答案后面可能被工具结果推翻，无法边吐字边改 |
| 计量口径 | 与非流式**完全相同**：准入 → 问题行落库 → `meter.record()` → 才调模型 | 同左 |

两条路径是同一个 counter，不是两个指标。历史修正：流式路径在 2026-09-15 之前完全没有计量
（免费/入门档白嫖），已修复。

### 「自动分析任务」vs「人工触发任务」——现状是空的

直接排查 `app/domains/account/commitment-sweep.ts` 与 `app/jobs/scheduler.ts`（grep
`atlasClient`/`runosClient`/`runCopilotTurn`，零匹配）：**yucer 今天没有任何自动触发的 AI
任务**，100% 是用户主动发起的交互式对话。这个分类不是「没报」，是对应的产品能力还不存在——
`copilot.autopilot`/`carryOut()` 在 `40-capability-matrix.md` 里已标注为「产品内部写操作，无
外部成本，将来若按次卖再登记」，是未来的能力点。

### 可补的能力点（技术上可行，不代表建议做）

今天 `yucer.copilot.turns` 不分维度。`CAPABILITY_SPEC` 已经给八项顾问能力标了任务类型元数据，
按能力类型给 turn 打标签、报成带维度的 counter（而非新开指标），是现成可加的能力，不涉及冻结
的 19 个 feature key。

## 2. 存储空间（数据库 + 附件）

### 平台侧机制：counter 与 gauge 是结构级区分的两种指标形态

平台仓 `docs/30-design/data_commerce_240_usage-gauge.md`（D5 决策，`product_310_arda-integration.md`
引用，值域权威在 `product_220_catalog-resource-model.md` §4）。「水管/水缸」不是平台文档的书面
用词（全仓搜索零命中），但对应的机制是真实的，且有数据库 CHECK 约束强制两种形态互斥：

| | counter（流量） | gauge（存量） |
|---|---|---|
| 写入接口 | `POST /usage/consume`，增量扣减 | `PUT /usage/gauge`，**绝对值覆盖** |
| 账本 | 落 `metering.usage_events` 流水 | 不进流水，只留最新一条（`metering.usage_gauges`） |
| 重置 | 周期性（日/月） | 永不重置 |
| `remaining` 的算法 | `limit − quota_used` | `limit − Σ`（**跨该工作区内所有产品求和**） |
| 幂等 | 幂等键去重 | `observed_at` 更新的才落，旧快照静默丢弃（last-write-wins） |

对存储而言**产品是唯一数据源**：平台不会替产品计算，产品需要定期把「自己这部分对象的绝对
字节总数」PUT 上去（参考实现 arda：`SUM(Dataset.sizeBytes) + observed_at`）；平台只负责跨产品
求和与 `limit − Σ` 的准入判断。`limit` 目前仍来自产品自己的 `plan_component` 配额（过渡态，
平台尚未把它挪到工作区级资源池——不能假设已经建好）。

### yucer 现状：不是「没报」，是数据源不存在

- `deploy/database/ddl/00_baseline.sql` 全文搜索 `file`/`附件`/`document`/`attachment`：
  **零匹配**。yucer 的产品域模型（`yucer_core`/`yucer_gtm`/`yucer_pipeline`/`yucer_delivery`/
  `yucer_agent`，D1-D9 共 44 张表）里没有「附件/文件」这个对象。
- `local_usage` schema（平台集成层，模板原样）只有 `raw`（counter 缓冲）+ `checkpoint` 两张
  表，没有任何 gauge/存量相关的表。
- `40-capability-matrix.md` 里「导出/外发/附件存储」一行早已记录「无物可计」，与本节结论一致，
  不是新发现，是同一个事实的进一步展开。

### 平台侧是否已经提出这个对接需求：没有

查 `docs/80-liaison/00-index.md`（跨仓联络的权威台账），当前唯一开着的平台对接需求是
[vxture-platform/vxture-platform#329](https://github.com/vxture-platform/vxture-platform/issues/329)
（「C2 正式对接」），范围明确列出：`PLATFORM_API_BASE`、`/platform`+`/usage` 通道凭据、webhook
测试投递、换票请求体形状——**完全没有提存储/gauge**。也就是说 gauge 机制是平台仓自己的通用
设计（为 arda 建的），平台没有主动向 yucer 提过这项要求，是一个平台已具备、但没人问 yucer
要的能力缺口。

### 要具备这项能力需要先做的产品决策

1. 「附件存储」要不要作为一个产品域对象建出来（D7 交付项目域下，或参照 D9 走 ADR-017 的
   「无 feature key，纯基础设施」路线）——这是产品设计决策，不是代码遗漏。
2. 建对象之后才谈得上定时任务汇总字节数、PUT 给平台、注册 `storage.bytes` 为 gauge 指标。

本机唯一可比对的兄弟仓 `vx-agent-vxtpl` 也只做了 counter（`usage/lib/store.ts` 注释承认知道
gauge 但未实现）；真正的参考实现 `arda` 是独立仓，不在本机，没有现成代码可抄。

## 3. 产品用户——席位

2026-09-01 owner 已裁定并记录在 `40-capability-matrix.md`：席位是**平台的决定**，产品侧首登
自动建成员，没有可门控的动作点。这与行业一致——席位是企业 SaaS CRM 通用的主计费轴（Salesforce
按 license 类型/月、Pipedrive/Dynamics 365 同样按席位）。

产品侧不需要建限制能力，但可以额外提供一个非限制性信号：**licensed 席位**（合同数，平台管）
vs **active 席位**（实际登录/用过 copilot 的人数，产品能测、平台不一定能测）。后者对续约/
扩容谈判有参考价值，可列为一个可选的度量能力点（measurement-only，不建议做限额）。

## 4. CRM 客户数量——行业是否有上限

企业级 CRM 定价结构对照（Salesforce / HubSpot / Zoho / Pipedrive / Dynamics 365）：**客户/公司
记录数几乎从不单独作为计费轴**。

- Salesforce：不按记录数限，按**存储空间**（GB）限，记录数只是间接通过存储占用体现。
- HubSpot：唯一的例外是 Marketing Hub 按「营销联系人数」分档——但那是给营销触达定价，不是
  核心销售 CRM；Sales Hub/CRM 本体仍按席位。
- Zoho / Pipedrive / Dynamics 365：都是存储或席位维度，没有客户数上限这一说。

结论：客户数量这个轴，行业惯例是**并入存储配额**，不单独立轴，与本文档第 2 节直接挂钩。
`entitlement/quota.ts` 里 `withinCap`/`limitOf` 至今零调用方，`40-capability-matrix.md` 也已
记录「没有商业规则要求按数量卖」——这不是疏漏，是符合行业惯例的现状。产品侧技术上随时能加一个
`COUNT(account)` 的能力，但按行业经验，不建议单独立轴，除非平台有特殊商业理由。

## 5. Runos 调用次数

### 响应协议现状：没有资源消耗字段

`app/agent/runos/types.ts` 的 `InvokeResult`：`content`、`structured`、
`meta.{call_id, version_resolved, result_kind, content_digest}`。**没有耗时、没有
CPU/内存、没有沙箱资源统计**——不是 yucer 丢弃了字段，是 Runos 的响应协议本身不携带这些数据。

### 已捕获但未上报的数据：调用次数

`app/agent/orchestrator/turn.ts` 的 `TurnResult.invocations` 已经把每次调用的
`toolName`/`capabilityId`/`operation`/`ok`/`callId`/`versionResolved` 都记录下来了——**调用
次数这个能力已经现成具备**（`invocations.length`/`toolRounds`），只是今天只用来跑完这一轮
对话本身，没有额外上报成指标。补一个「按 turn 汇总调用次数」的维度，是几乎零成本的能力点。

### 待确认的外部事实：沙箱资源消耗是否由 Runos 中心化上报

`client.ts`/`types.ts` 里没有类似 Atlas token「统一上报」的对应声明（专门 grep 了
`duration|cost|resource|cpu|memory|sandbox`，只有一句架构性的「Atlas 管智能、Runos 管能力
边界」，不是数据上报承诺）。**这一点不能假设，也不该类比 Atlas 处理**——如果平台侧要这个
维度，需要向 Runos 团队单独确认协议是否支持，这是真正该走 liaison 渠道去问的外部事实。
`meta.call_id` 是现成的对账键，即使 `invoke` 响应里没有资源字段，如果 Runos 自己的执行日志
留了资源统计，理论上还能靠 `call_id` 事后对账。

## 6. 行业维度对比

| 维度 | 行业例子 | yucer 现状 |
|---|---|---|
| 席位 | 全行业通用主轴 | 平台管，产品无需建能力（第 3 节） |
| 存储（GB） | Salesforce/Zoho/Dynamics 通用副轴，客户数并入其中 | 能力缺口——附件对象未建（第 2 节） |
| AI 对话/凭证 | Salesforce Agentforce 约 $2/次固定 credit；HubSpot Breeze AI 按任务类型加权 credit | 已有单一 counter；`CAPABILITY_SPEC` 已有分类元数据，往「加权 credit」演化是在现有数据上加一层 |
| 任务/自动化执行次数 | Zapier/Make 按任务数计费，独立于「对话」的轴 | 对应 Runos 调用次数（第 5 节），能力已具备，未上报 |
| API 调用量 | Salesforce 按 license 类型限 API 请求数，独立于 AI 消耗的轴 | 尚无对外 API 产品面，暂不适用 |
| 营销联系人数 | HubSpot 独有，给营销触达定价 | 不适用——yucer 是销售 CRM，不是营销工具 |

## 优先级建议（纯技术可行性排序，非商业决策）

1. **Runos 调用次数**——数据已捕获，只差上报，成本最低。
2. **AI 消耗按能力类型分维度**——元数据已具备，成本低。
3. **存储**——需要先做产品设计决策（附件对象要不要建），成本中等；是唯一「平台机制已就绪、
   产品侧完全空白」的项。
4. **客户数量**——不建议单独立轴，行业惯例并入存储。
5. **沙箱资源消耗**——技术上目前拿不到数据，需要先问 Runos 团队协议是否支持，不是产品侧
   能单方面决定的。

## 参考

- `portals/app/app/domains/copilot/turn-service.ts`、`streaming-turn.ts` —— 计量口径与流式/
  非流式差异的权威实现
- `portals/app/app/usage/lib/store.ts` —— counter 缓冲机制注释
- `portals/app/app/agent/runos/types.ts`、`client.ts` —— Runos 响应协议
- `portals/app/app/domains/account/commitment-sweep.ts`、`app/jobs/scheduler.ts` —— 自动触发
  任务排查
- `deploy/database/ddl/00_baseline.sql` —— 产品域与平台集成 schema 现状
- `docs/20-specs/40-capability-matrix.md` —— 已计量/复核不计的权威裁定
- `docs/80-liaison/00-index.md`、[vxture-platform/vxture-platform#329](https://github.com/vxture-platform/vxture-platform/issues/329) —— 平台对接需求的实际范围
