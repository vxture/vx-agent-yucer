# ADR-002 - 八个能力分区映射到五个 DB schema

- 状态：已接受
- 日期：2026-08-12

## 背景

[ADR-001](ADR-001-eight-capability-domains.md) 把产品切成八个能力分区。存储侧需要决定
schema 的数量与边界。模板保留了三个契约 schema（`vx_provision` / `local_authz` /
`local_usage`）作为刚性区，产品域 schema 的命名与数量是留白区，由产品自行决定。

## 候选方案

1. **单一 schema**（`yucer`）。最简单，但 24 张表挤在一个命名空间里，且无法用
   schema 粒度做权限与运维隔离。
2. **一域一 schema**（8 个）。与产品概念一一对应，但会把本应在同一事务里完成的写入
   拆到多个 schema，且 `yucer_strategy` / `yucer_planning` 两个 schema 各自只有 2-3
   张强耦合的表，切得过碎。
3. **按事务边界合并到 5 个**（本 ADR 采纳）。

## 决策

五个域 schema：

| Schema | 承载域 |
|--------|--------|
| `yucer_core` | D4 客户管理 |
| `yucer_gtm` | D1 战略 + D2 规划 + D3 市场执行 |
| `yucer_pipeline` | D5 商机侦探 + D6 商机管理 |
| `yucer_delivery` | D7 项目落地 |
| `yucer_agent` | D8 销售智能助手 |

**域是产品概念，schema 是存储边界，两者不必一一对应。**

## 理由

合并依据是**事务边界**——经常在同一个事务里被一起写的对象，放同一个 schema：

- **D1+D2+D3 -> `yucer_gtm`**：制定一个周期的打法时，战略、细分市场、区域、目标、
  战役往往是一次规划会的产物，一起落库。拆开会把一个业务动作变成跨 schema 事务。
- **D5+D6 -> `yucer_pipeline`**：信号 -> 线索 -> 商机是一条连续管道，「线索转化为
  商机」必须是单事务（创建商机 + 回填 `converted_opportunity_id`），拆开则需要分布式
  一致性来解决一个本不该存在的问题。
- **D4 独立 -> `yucer_core`**：客户主数据被所有域引用，是稳定的引用中心，读多写少，
  生命周期与其他域完全不同。
- **D7 独立 -> `yucer_delivery`**：只在赢单后产生，与前面几段解耦，可以独立归档。
- **D8 独立 -> `yucer_agent`**：横切八个能力分区但自身数据独立，且增长最快（消息、动作），
  独立 schema 便于单独扩容、单独设置保留期与清理策略。

## 后果

- 正面：没有为了 schema 整齐而制造的跨 schema 事务；`yucer_agent` 可以独立做数据
  保留策略而不影响业务数据。
- 负面：`yucer_gtm` 和 `yucer_pipeline` 各承载 2-3 个域，读代码时需要靠表名而非
  schema 名判断所属域。缓解措施是 DDL 内按域分节注释，并在
  `data_yucer_200_domain-schemas.md` 维护域->表清单。
- 跨 schema 外键是允许的且已显式声明，删除行为规则（向上引用绝不 CASCADE）见
  `design_yucer_100_capability-domains.md` 第 3 节。
- 五个名字均不与保留的契约 schema 名冲突。
