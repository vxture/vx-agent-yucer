# 20-specs - 产品与业务规格

yucer 的产品定义落在这一层。yucer 是面向企业市场销售的超级智能体，覆盖
「市场战略 -> 销售规划 -> 市场执行 -> 客户管理 -> 商机侦探 -> 商机管理 ->
项目落地 -> 智能助手」的全链路。

本层回答**产品是什么、边界在哪、业务规则是什么**；不回答怎么实现（实现设计在
`docs/30-design/`）。

| 文件 | 内容 |
|------|------|
| `10-product-definition.md` | 产品定义、目标用户、核心价值主张、非目标 |
| `20-capability-domains.md` | 八大能力域（D1-D8）的边界与交接契约 |
| `30-business-rules.md` | 全链路业务规则：阶段机、评分、预测、归因、人机边界 |
| `40-capability-matrix.md` | 商业档位 x 能力（tier -> feature key），与 `capability.ts` 一一对应 |
| `50-role-permission-catalog.md` | 产品角色/权限目录，与 `local_authz` 种子数据一一对应 |

## 两道门的分工（不要混淆）

产品里任何一个动作都要过两道独立的门，缺一不可：

1. **权益门（买没买）** - 平台 C2 通道下发的 `Entitlement`，决定这个 workspace
   的档位解锁了哪些 feature key。权威在平台，产品只读消费，**绝不本地重算商业
   结论**。见 `40-capability-matrix.md`。
2. **权限门（能不能做）** - 产品自有的 `local_authz` 角色/权限，决定这个成员在
   本 workspace 内可否执行该动作。权威在产品。见 `50-role-permission-catalog.md`。

先过权益门，再过权限门。两者互不替代：企业版买了 `copilot.autopilot`，不代表
一个只读角色的成员可以让智能体自动执行动作。
