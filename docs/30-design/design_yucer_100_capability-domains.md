# design_yucer_100 - 能力域架构设计

规格对应：`docs/20-specs/20-capability-domains.md`（产品边界）。本文件回答**怎么落到
代码与存储结构上**。

## 1. 分层

```
                 portals/app/app/
  ┌────────────────────────────────────────────────────────┐
  │ (domains)/            域路由与页面（留白：批次 3 实现） │
  ├────────────────────────────────────────────────────────┤
  │ entitlement/          权益门 - 平台 C2 只读消费         │  [刚性]
  │   capability.ts       能力矩阵：tier -> feature key      │
  ├────────────────────────────────────────────────────────┤
  │ authz/                权限门 - local_authz 角色权限      │  [留白]
  ├────────────────────────────────────────────────────────┤
  │ domains/<d>/lib/      域业务规则（纯函数，可单测）       │  [留白]
  ├────────────────────────────────────────────────────────┤
  │ lib/db.ts             Prisma 客户端（结构权威在 DDL）    │  [刚性]
  └────────────────────────────────────────────────────────┘
```

`auth/`、`entitlement/`、`provisioning/`、`usage/` 四块是平台集成契约面，属于**刚性
区**，不因产品域而改动。产品域代码一律新增在 `domains/` 之下，不侵入这四块。

## 2. 域 -> schema 的映射

八个产品域映射到五个 DB schema。映射依据是**事务边界**：经常在同一个事务里被一起
写的对象放同一个 schema。

| Schema | 承载域 | 事务边界理由 |
|--------|--------|-------------|
| `yucer_core` | D4 | 客户主数据被所有域引用，是稳定的引用中心 |
| `yucer_gtm` | D1 D2 D3 | 制定战略时常同时落细分市场、区域、目标、战役 |
| `yucer_pipeline` | D5 D6 | 信号->线索->商机是一条连续管道，转化是单事务 |
| `yucer_delivery` | D7 | 赢单后才产生，生命周期与前面几段解耦 |
| `yucer_agent` | D8 | 横切八域，但自身数据独立，可独立扩容与清理 |

完整理由见 `decisions/ADR-002-five-schemas-for-eight-domains.md`。

## 3. 跨 schema 引用

跨 schema 的外键是**允许的**，且已在 DDL 中显式声明：

| 引用 | 删除行为 | 理由 |
|------|---------|------|
| `pipeline.opportunity.account_id -> core.account` | `RESTRICT` | 有单的客户不允许被删掉 |
| `delivery.project.account_id -> core.account` | `RESTRICT` | 同上 |
| `delivery.project.opportunity_id -> pipeline.opportunity` | `SET NULL` | 商机清理不应连带毁掉已在交付的项目 |
| `pipeline.signal.account_id -> core.account` | `SET NULL` | 信号是证据，客户没了证据仍有效 |
| `pipeline.lead.campaign_id -> gtm.campaign` | `SET NULL` | 战役归档不应删除线索 |
| `gtm.campaign.plan_id -> gtm.strategy_plan` | `SET NULL` | 战略归档不应删除战役 |

**规则**：向上引用（下游指上游）一律 `SET NULL` 或 `RESTRICT`，**从不 CASCADE**。
CASCADE 只用于真正的从属关系（联系人属于客户、里程碑属于项目、消息属于会话）。
理由：链路下游的数据是既成事实，不该被上游的整理动作抹掉。

## 4. 三类表的写入形态

DDL 与列级写锁把域内的表分成三类，实现时必须按类别处理：

| 类别 | 表 | 写入形态 |
|------|----|---------|
| **可变实体** | account / opportunity / project / campaign ... | INSERT + 白名单列 UPDATE |
| **只追加日志** | opportunity_stage_event / forecast_snapshot / agent_message / account_relation | 只 INSERT，纠错=新增 |
| **半不可变** | signal / lead / agent_action | 事实字段冻结，仅结论字段可写 |

「半不可变」是本产品最容易写错的一类。以 `agent_action` 为例：`payload` /
`rationale` / `confidence` 是模型当时的判断，冻结；`status` / `decided_by_sub` /
`decided_at` / `executed_at` 是人类决策与执行，可写。实现时若试图「顺手更新一下
rationale」，服务角色会直接 permission denied——这是设计意图，不是障碍。

## 5. 两道门在代码中的落点

```
请求 -> 会话解析(auth/)     -> 拿到 workspace_id + sub
     -> 权益门(entitlement/) -> canUseFeature(entitlement, "pipeline.forecast")
     -> 权限门(authz/)       -> memberHasPerm(sub, "pipeline.forecast")
     -> 域业务规则(domains/)  -> 纯函数校验（阶段机、归因、口径）
     -> 持久化(lib/db.ts)     -> DDL 列级写锁兜底
```

四层是**递进收紧**的，任何一层都不得跳过。最后一层的列级写锁是兜底而非主防线：
应用层写对了它不该触发，触发了说明上面某层漏了。

## 6. 留白与批次

本批次交付的是**结构**（数据面、商业面、文档面），不含域页面与域服务实现。
`(domains)/`、`authz/`、`domains/<d>/lib/` 三处是显式留白，落地计划见
`docs/70-workplan/00-index.md`。
