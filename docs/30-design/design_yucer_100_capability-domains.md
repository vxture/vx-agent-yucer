# design_yucer_100 - 能力域架构设计

规格对应：`docs/20-specs/20-capability-domains.md`（产品边界）。本文件回答**怎么落到
代码与存储结构上**。

## 1. 分层

```
                 portals/app/app/
  ┌────────────────────────────────────────────────────────┐
  │ @vxture/design-system  组织设计系统（外部包，刚性）      │  [刚性]
  ├────────────────────────────────────────────────────────┤
  │ (domains)/            域路由与页面（留白：批次 3 实现） │
  ├────────────────────────────────────────────────────────┤
  │ entitlement/          权益门 - 平台 C2 只读消费         │  [刚性]
  │   capability.ts       能力矩阵：tier -> feature key      │
  ├────────────────────────────────────────────────────────┤
  │ authz/                权限门 - local_authz 角色权限      │  [已交付]
  │   catalog.ts          19 权限 / 7 角色（种子的类型镜像） │
  │   gate.ts             两道门合成，顺序固定：权益 -> 权限 │
  │   actions.ts          动作 -> (feature key, 权限码) 目录 │
  ├────────────────────────────────────────────────────────┤
  │ agent/                智能体两平面（ADR-004）            │  [刚性]
  │   atlas/              模型面：唯一 LLM 出口，按 endpoint │
  │   runos/              能力面：MCP 四工具 + Skill 分发    │
  ├────────────────────────────────────────────────────────┤
  │ platform/s2s.ts       两平面的 S2S 令牌铸造              │  [刚性]
  ├────────────────────────────────────────────────────────┤
  │ domains/<d>/lib/      域业务规则（纯函数，可单测）       │  [部分交付]
  ├────────────────────────────────────────────────────────┤
  │ lib/db.ts             Prisma 客户端（结构权威在 DDL）    │  [刚性]
  └────────────────────────────────────────────────────────┘
```

`agent/` 与 `platform/s2s.ts` 是**新增的两条平台集成通道**，与 C1/C2/C3 同属刚性区：
产品域代码调用它们，但不改它们，更不绕过它们直连模型厂商或自建能力目录。理由与
契约细节见 ADR-004。

`auth/`、`entitlement/`、`provisioning/`、`usage/` 四块是平台集成契约面，属于**刚性
区**，不因产品域而改动。产品域代码一律新增在 `domains/` 之下，不侵入这四块。

### UI 层：组织设计系统是唯一来源

产品页面的视觉与交互元件**一律取自 `@vxture/design-system`（^2.0.0）**，不自建组件、
不复制其源码、不为了"改一点样式"而 fork 出本地副本。

- 需要 DS 没有的元件时，**先向 DS 提需求**，而不是在本仓造一个。确实必须临时自建的，
  按偏差纪律登记 TD 条目（写明缺失的 DS 元件、临时实现位置、回收条件），不得静默偏离。
- 允许的本地封装只有一种：把 DS 元件与本产品的**域语义**绑定的薄封装（例如把
  DS 的表格封装成"商机管道表"，注入阶段机的列定义）。薄封装不得重写 DS 的视觉。
- 主题与设计令牌以 DS 为准；`@yucer/shared` 的 `brand.ts` 只承载产品标识
  （productCode / displayName / defaultLocale），**不承载颜色、间距、字体**。

这条约束现在就写死，是因为它极难回补：等批次 3 把八域页面写完再换 DS，等于重做 UI 层。

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
