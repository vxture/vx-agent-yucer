# 能力矩阵（档位 x feature key）

这是**权益门**的定义：某个档位解锁哪些 feature key。权威实现是
`portals/app/app/entitlement/capability.ts`，本文件与它一一对应，改一处必须改另一处
（`capability.test.ts` 会校验矩阵的自洽性，但无法校验它与本文档一致——那是评审责任）。

**档位五值来自平台**（`@vxture/shared` 的 `TIERS`），产品不得新增或改名。feature key
是**产品知识**，平台从不配置它们。

## 矩阵

累进式：高档位包含低档位的全部能力（实现上用展开运算符保证，不靠查表时继承）。

| feature key | 域 | free | starter | pro | business | enterprise |
|-------------|----|:----:|:-------:|:---:|:--------:|:----------:|
| `account.manage` | D4 | O | O | O | O | O |
| `pipeline.manage` | D6 | O | O | O | O | O |
| `copilot.ask` | D8 | O | O | O | O | O |
| `signal.inbox` | D5 | - | O | O | O | O |
| `campaign.manage` | D3 | - | O | O | O | O |
| `delivery.project` | D7 | - | O | O | O | O |
| `planning.target` | D2 | - | - | O | O | O |
| `planning.territory` | D2 | - | - | O | O | O |
| `account.graph` | D4 | - | - | O | O | O |
| `signal.autoscore` | D5 | - | - | O | O | O |
| `pipeline.forecast` | D6 | - | - | O | O | O |
| `copilot.suggest` | D8 | - | - | O | O | O |
| `strategy.plan` | D1 | - | - | - | O | O |
| `strategy.segment` | D1 | - | - | - | O | O |
| `campaign.execute` | D3 | - | - | - | O | O |
| `signal.external_feed` | D5 | - | - | - | O | O |
| `pipeline.winloss` | D6 | - | - | - | O | O |
| `delivery.revenue` | D7 | - | - | - | O | O |
| `copilot.autopilot` | D8 | - | - | - | - | O |

## 分档的产品逻辑

每一档解锁的是**一个完整的工作方式**，不是零散功能点。这是定价能讲清楚的前提。

- **free - 手工跑通核心闭环**：客户、商机、问答。够一个人用，验证价值。
- **starter - 全链路骨架打通**：加上信号收件箱、战役、交付项目。链路从需求到交付
  完整了，但每一跳仍靠人推。
- **pro - 管理层出现**：目标与区域、预测、信号自动评分、会话里让参谋动手（工具循环）。这一档是
  「从记录工具变成管理工具」的分水岭，也是主力档位。
- **business - 战略闭环与学习闭环**：战略与细分市场、战役执行、外部信号源、赢丢
  复盘、回款管理。链路首尾相接，经验开始回流。
- **enterprise - 授权智能体自动执行**：`copilot.autopilot`。这是唯一一个改变
  **人机边界**的能力，因此单独占据最高档——见 `30-business-rules.md` 第 7 节。

## 参谋随功能开放（2026-09-24 owner 裁定，YC-042 第 03 节）

「功能有，对应的参谋就有。」参谋不再单独设档位门：每项参谋能力挂在它所在功能的
feature key 上，工作区能用这个功能，就能运行这项参谋、收到它的提案、裁决它的提案。
权威实现是 `CAPABILITY_SPEC[*].feature`（`domains/copilot/lib/capability.ts`）与
`domains/copilot/lib/advisor-gate.ts`；`advisor-gate.test.ts` 逐项钉住下表。

| 参谋能力（ADR-015 能力键） | 所在 feature key | 最低档 |
|----------------------------|------------------|:------:|
| `deal.stall_risk` · `deal.competition` · `pricing.discount_approval` · `deal.evidence`（证据抽取，deal batch 4b） | `pipeline.manage` | free |
| `account.chain_map` · `account.cadence` · `account.upsell` · `account.consistency` | `account.manage` | free |
| `signal.triage` | `signal.inbox` | starter |
| `campaign.return` | `campaign.manage` | starter |
| `delivery.payment_risk` | `delivery.project` | starter |
| `strategy.territory_attainment` | `planning.territory` | pro |
| `strategy.segment_coverage` | `strategy.segment` | business |

- `copilot.suggest` 的含义收窄为**会话工具循环**：成员在对话里让模型伸手进业务域。没有
  能力键的提案（工具循环产出、或早于 ADR-015 的历史行）仍按它门控，未知能力键同样按它——
  取严不取宽。
- 裁决分两半：动作 `copilot.action.decide` 只问「这个成员能不能裁决」（`copilot.ask` +
  `copilot.decide`）；服务层再逐行按提案的能力键查所在 feature。
- 不产出提案的参谋输出（会前准备）由调用方指明所属 feature（`canAdviseOn`）。
- 权限轴不变：运行参谋需 `copilot.use`，裁决需 `copilot.decide`。`copilot.autopilot`
  不变，仍只在 enterprise。
- 19 个 feature key 一个未增。

## 与权限门的关系

feature key **不是**权限码。两者是不同维度：

- feature key 回答「这个 **workspace** 买了吗」——粒度是工作区，权威在平台。
- 权限码回答「这个 **成员** 能做吗」——粒度是人，权威在产品（见
  `50-role-permission-catalog.md`）。

判定顺序固定为：先 `canUseFeature(entitlement, key)`，再查成员权限。任一不通过即
拒绝。反过来写（先查权限）会让未购买的工作区看到本不该暴露的功能形状。

## 计量（2026-09-24 owner 裁定两个指标；取代 2026-09-14/15 的「只有一个指标」）

yucer 有**两个**消耗型指标（YC-042 §04）。不定义任何 `limits{}` 上限键。

**为什么取代了「一个指标」**：2026-09-15 的判定写的是「参谋能力都在一次 turn 内运行，
没有独立调用方」。参谋全面开放（2026-09-24，见上一节）之后这句话不再成立：参谋在
成员保存跟进、推进阶段、手动点「核对说法」时由产品自己触发，没有成员在对话里发问。
触发方不同、用量驱动不同，平台需要能分开定价、分开给配额。

**计量归产品，配额归平台**（owner 2026-09-24）：产品定义「一次」是什么并如实上报；给多少、
用了多少、放不放行都由平台下发，产品不持有配额数值。

| 指标 | 类型 | 动作点 | 口径 |
|------|------|--------|------|
| `yucer.copilot.turns` | counter | `runCopilotTurn()` 与 `streamCopilotTurn()`——成员的一个问题到达模型的仅有两条路；两道门放行之后、问题行落库之后、调用模型之前 | 一次「问参谋」= 1；**开局即扣，不等模型结果**（模型失败也是一次被要求的对话） |
| `yucer.advisor.runs` | counter | `runAdvisor()`——参谋能力到达模型的唯一入口（`domains/copilot/advisor.ts`）；门控、指纹、查缓存、放行之后，调用模型之前 | 一次**真正调到模型**的参谋任务 = 1，手动与后台触发都算；任务内几轮模型或工具调用都只算 1；**缓存命中不算**（输入指纹没变就不调模型） |

- `yucer.advisor.runs` 的幂等键 = `yucer.advisor.runs:<run id>`，run id 由输入指纹确定
  （能力、对象、输入的规范化 JSON 的 sha-256），同一份输入的重试、并发、每日重跑都指向同一个
  run，平台只记一个事件。缓存行在 `yucer_agent.agent_briefing`（incr/0083）。
- 一次参谋任务若借用会话的工具循环（例如说法核对），只记 `advisor.runs`，不再记 `copilot.turns`——
  同一份工作不以两个名字各收一次。
- 按参谋能力拆分模型用量走 Atlas：每次调用带 `featureId`（能力键；会话为 `copilot.chat`）与
  `businessId`（run id 或用户消息 id）。C3 上报体不加维度字段。
- 放行目前仍按 C2 信封的配额池在产品内判断——与 owner 裁定不符，登记为 **TD-035**，待平台给出
  放行字段后替换。

- 准入读 C2 信封里该指标的 `quota_pools`：**没有池 = 平台没卖这个配额，不门控**（销售轴决定，不是代码决定）；有池且 `remaining <= 0` → 舰队码 `QUOTA_EXCEEDED`，HTTP 409；流式路径则以首个事件 `error` / `quota_exceeded` 拒绝，不开会话。
- **幂等键 = 指标 + 业务对象 id**：`yucer.copilot.turns:<用户消息 id>`（tenderforge 范本的规矩）。所以扣费等问题行落库之后才记——重试的冲洗、重复提交、重放的请求都指向同一条消息，平台折叠为一个事件。2026-09-15 之前用的是每次调用新生成的 UUID，等于每次重试都是一笔新费，已改。
- 上报走既有的缓冲 + 冲洗（`POST /usage/consume`，永远 200，`gated` 在体内）。指标须先在平台**登记**，否则 consume 返 `unknown_metric`，事件留在缓冲表重试——这是正常态。
- 模型平面自己的用量由 Atlas 统一上报（通则「谁执行谁上报」的例外），本指标**不是**模型 token，两者不重复。
- 平台侧登记请求：[vxture-platform/vxture-platform#329](https://github.com/vxture-platform/vxture-platform/issues/329) 第 6 项。

### 复核过、不计的（2026-09-15）

按产品的可计数对象与所有外部成本点逐一过了一遍。再提新指标时先对照这张表，
每一行的「依据」变了才有重议的理由。

| 候选 | 判定 | 依据 |
|------|------|------|
| ~~八项参谋能力~~ | **已取代（2026-09-24）** | 参谋全面开放后有了独立触发方，现按 `yucer.advisor.runs` 计，见上 |
| 模型 token | 不计 | Atlas 统一上报，通则明文例外 |
| 外部信号源（`signal.external_feed`，arda facts） | 不计 | 谁执行谁上报：arda 是平台侧服务，yucer 的 sync 只拉取插入 |
| 信号自动评分（`signal.autoscore`） | 不计 | `scoreSignal` 是本地规则函数，无模型调用，无外部成本 |
| 自动驾驶（`copilot.autopilot`，`carryOut()`） | 暂不计 | 产品内写操作，无外部成本；enterprise 层本身已是卖点。将来若按次卖，动作点是 `carryOut()`，届时另行登记 |
| 席位 | 不是产品指标 | 2026-09-01 裁定：平台决定有多少席位，产品只做启用/停用；首登自动建成员，没有可门控的动作点 |
| 客户 / 商机 / 战役 / 项目 / 组织单元的数量上限 | 不定义 `limits` 键 | 五档已按 19 个功能键分层，没有商业规则要求按数量卖；`withinCap` 缺键即拒绝，一旦定义就要在每个 create 动作点加计数查询 |
| 导出 / 外发 / 附件存储 | 无物可计 | 代码里没有 csv/pdf 导出、没有外发通道，DDL 没有附件表 |

## 消费纪律

- 产品只读渲染商业事实，**绝不本地重算商业结论**（`30-business-rules.md` 第 8 节）。
- 门控公式是刚性区：UI 门 `tier != null`，数据门 `tier != null || bundled`，
  不得在产品内放宽。
- 未知的 `status` 值或新增字段必须容忍并保守降级（隐藏而非放行）。
