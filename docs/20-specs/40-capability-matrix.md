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

## 消费纪律

- 产品只读渲染商业事实，**绝不本地重算商业结论**（`30-business-rules.md` 第 8 节）。
- 门控公式是刚性区：UI 门 `tier != null`，数据门 `tier != null || bundled`，
  不得在产品内放宽。
- 未知的 `status` 值或新增字段必须容忍并保守降级（隐藏而非放行）。
