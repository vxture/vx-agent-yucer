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
- **pro - 管理层出现**：目标与区域、预测、信号自动评分、智能体主动建议。这一档是
  「从记录工具变成管理工具」的分水岭，也是主力档位。
- **business - 战略闭环与学习闭环**：战略与细分市场、战役执行、外部信号源、赢丢
  复盘、回款管理。链路首尾相接，经验开始回流。
- **enterprise - 授权智能体自动执行**：`copilot.autopilot`。这是唯一一个改变
  **人机边界**的能力，因此单独占据最高档——见 `30-business-rules.md` 第 7 节。

## 与权限门的关系

feature key **不是**权限码。两者是不同维度：

- feature key 回答「这个 **workspace** 买了吗」——粒度是工作区，权威在平台。
- 权限码回答「这个 **成员** 能做吗」——粒度是人，权威在产品（见
  `50-role-permission-catalog.md`）。

判定顺序固定为：先 `canUseFeature(entitlement, key)`，再查成员权限。任一不通过即
拒绝。反过来写（先查权限）会让未购买的工作区看到本不该暴露的功能形状。

## 计量（2026-09-14 owner 裁定；2026-09-15 metricKey 复核后维持）

yucer 有**一个**消耗型指标。没有第二个 counter，也不定义任何 `limits{}` 上限键。

| 指标 | 类型 | 动作点 | 口径 |
|------|------|--------|------|
| `yucer.copilot.turns` | counter | `runCopilotTurn()` 与 `streamCopilotTurn()`——一个问题到达模型的仅有两条路；两道门放行之后、问题行落库之后、调用模型之前 | 一次「问参谋」= 1；**开局即扣，不等模型结果**（模型失败也是一次被要求的对话） |

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
| 八项参谋能力（`CAPABILITY_SPEC`：滞单风险、竞争、链路图、节奏、分诊、折扣审批、回款风险、战役回报） | 不单独计 | 都在一次 turn 内运行，没有独立调用方；单独计是把同一次对话收两遍 |
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
