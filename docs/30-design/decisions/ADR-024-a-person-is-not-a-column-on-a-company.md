# ADR-024 - 人不是公司上的一列，采购角色不是人身上的一个字段

- 状态：**草案**（待 owner 裁定）
- 日期：2026-09-04
- 相关：ADR-001（能力分区按对象归属切）、ADR-002（域的形状）、
  ADR-013（商机只关心当前决策链）、ADR-018（证据面）、ADR-023（先确认问题还没有答案）

## 背景

`yucer_core.contact` 现在同时承担三件不同的事：

| 它存的 | 真实归属 |
|--------|----------|
| `name` / `title` / `department` | 一个**人**，以及他在某家单位的**任职** |
| `account_id NOT NULL` | 这个人**属于**一家单位 |
| `decision_role` / `influence` | 这个人在**某一单**里的采购影响力 |

三件事被压进一张表，产生两个具体缺陷。

### 缺陷一：人被钉死在一家单位上

`contact.account_id` 是 `NOT NULL` 且带外键。于是：

- 一个人**换公司**，只能改 `account_id`——原来的任职事实被覆盖，而"三个月前他还在长江物流"
  恰恰是销售最需要的历史。
- 一个人**同时服务两家**（集团与子公司、或本人兼任），只能建两条记录。两条记录之后
  各自积累交互、承诺、关系边，再也合不回一个人。

### 缺陷二：采购角色按客户存，而它按商机变

`decision_role` 的取值是 `economic / technical / user / coach / blocker / unknown`——
这是 Miller-Heiman 的采购影响力分类，**那套方法论里角色天然是按单的**：同一个人在 A 单
是决策者，在 B 单可能只是使用者。

但本仓把它存成了人的全局属性，`analyzeChain(contacts, relations)` 也不接收商机参数——
**决策链按客户算**。

**演示数据里这个缺陷已经具体存在**：七个客户各有 2–3 个在谈商机。`acc_demo_2` 同时在谈
供应链协同平台、生产排程系统、智能仓储升级三单，分属不同部门，却共用一条决策链——
「决策人未触达」这个徽章在三单上要么全亮要么全灭，而真实情况几乎不可能一致。

**产品自己已经知道角色是情境化的。** `yucer_field.interaction_participant` 有
`role_at_time`——那次会议上他是什么角色。这个概念在**交互层**存在，在**商机层**缺席。

ADR-013 写过「商机只关心**当前**决策链」，但那句话说的是商机要读这条链，没有论证链
为什么按客户存。查过 ADR 与 specs，**没有成文理由**。这更像是列放错了位置，不是一个
被权衡过的决定。

## 决策

### 1. 把 `contact` 拆成「人」与「任职」，但**不换主键**

```
person(id, workspace_id, name, mobile, email, wechat, status)
person_affiliation(id, workspace_id, person_id, account_id,
                   title, department, is_primary, started_at, ended_at)
```

**`person.id` 沿用现有 `contact.id`。** 这不是省事，是唯一可行的路径——见下节。

任职是**有起止的**。离职换公司是「旧任职 `ended_at` + 新建一条」，不是改
`account_id`。这样历史不会被覆盖，而"他现在在哪、以前在哪"是同一张表的两行。

### 2. 迁移必须保 id，因为三张引用表根本不可改写

查过服务角色的实际授权：

| 表 | `yucer_svc` 的权限 |
|----|--------------------|
| `interaction_participant` | **仅 INSERT / SELECT**——完全追加型 |
| `commitment` | INSERT / SELECT + 窄列 UPDATE，**不含 `counterpart_contact_id`** |
| `account_relation` | DELETE / INSERT / SELECT，无 UPDATE |

这三张表各自持有指向 `contact.id` 的外键，而**应用层没有改写它们的权限，这是有意的**：
它们是证据。CLAUDE.md 说得明确——追加型表的更正是新增一行，归因键的修正走 `db-init`
数据订正，不走应用写入。

所以"新建 `person` 表 + 把旧引用重指过去"这条路是**走不通的**：重指就是 UPDATE，
而那个权限不存在。

**保 id 让这个问题消失**：把 `contact` 本身演进成 `person`（改名 + 移走 `account_id`），
每一条既有外键仍然指向同一个 UUID，三张证据表一个字节都不用动。

### 3. 采购角色移到商机上

```
opportunity_contact(id, workspace_id, opportunity_id, person_id,
                    buying_role, influence, is_primary)
```

`buying_role` 沿用现有那五个值。同时：

- 人在单位的**职务** → `person_affiliation.title`
- 人在**这一单**的采购角色 → `opportunity_contact.buying_role`
- `analyzeChain` 改为接收商机上下文

`contact.decision_role` 与 `influence` **不迁到 `person` 上**。它们是"这个人在这一单里
是什么"，迁到人身上就是把刚拆开的东西又粘回去。

### 4. 客户层级用既有模式，不发明新的

`account.parent_id UUID NULL REFERENCES account(id)`。

`yucer_gtm.territory.parent_id -> territory` 已经是自引用层级，防环判据照搬。

**父子不共享决策链**——集团与子公司的采购小组通常不是一批人。这条要写死，否则
`analyzeChain` 会在层级上产生一个谁都没设计过的语义。

## 这条 ADR 不决定什么

**合同与报价不在本 ADR 内。** 现状是：全库零张 `contract` / `quote` 表，
「合同」只是 `project.contract_amount` 一个金额，「报价」是 `opportunity_line` 的集合。
`/renewal` 模块因此建立在一个不存在的实体上——它实际读的是 project，而业务上续的是
**合同到期**，不是项目结束。

这是真缺口，但它比本 ADR 大，且依赖本 ADR 的人模型先落地（合同签署人是谁、
盖章人是谁，都要指向 `person`）。单开一条。

**我方团队也不在本 ADR 内。** `account.owner_sub` / `opportunity.owner_sub` /
`project.manager_sub` 各是一个字符串，售前与交付经理无法结构化表达。但 `owner_sub`
是**归因键**，CLAUDE.md 规定创建后不可变——任何替代方案都必须保留它作为快照，
不能直接删。这个约束值得单独想清楚。

## 代价，如实写

- **`contact` 改名会波及每一处引用**：两个 store、Prisma 镜像、列锁镜像、以及
  `analyzeChain` 的调用方。这不是一个增量能装下的。
- **`analyzeChain` 改签名是破坏性的**：它现在被判断域按客户批量调用，改成按商机后
  调用方要重新想清楚"没有商机上下文时算什么"——很可能需要保留一个"客户级默认链"
  的降级答案。
- **多对多之后，"这个客户有几个联系人"不再是一次查询**。所有按 `account_id` 数联系人
  的地方都要经 `person_affiliation`，且要决定是否只数 `ended_at IS NULL` 的。

## 顺序

| 批 | 内容 | 依赖 |
|----|------|------|
| A | `person` 的 email/mobile/wechat、`account` 的信用代码/网站/规模 —— 纯加列 | 无 |
| B | `account.parent_id` | 无 |
| C | `contact` → `person` + `person_affiliation`（保 id） | A |
| D | `opportunity_contact` + `analyzeChain` 改签名 | C |

**A 与 B 可以立刻做**，纯增量、不碰既有语义、不需要本 ADR 被接受。

**C 是分水岭**，D 依赖它。

## 附：为什么先查授权再设计

本 ADR 的第 2 节——"保 id"——不是设计偏好，是查了 `information_schema.role_column_grants`
之后剩下的唯一选项。第一版草稿写的是"新建 `person` 表并重指外键"，那个方案在服务角色
的权限下**根本执行不了**，而这件事从表结构上看不出来，只有查授权才能看见。

和 ADR-023 的教训是同一条：**建一张新表之前，先确认这个问题还没有答案；
改一张旧表之前，先确认你有权改它。**
