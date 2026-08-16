# ADR-005 - 审批计划是与编辑计划不同的权限

- 状态：已接受
- 日期：2026-08-16

## 背景

`strategy.plan.approve` 从批次 1 写下角色目录时就作为一个 **action id** 存在，但它
解析到的权限是 `strategy.write` —— 与 `strategy.plan.update` **完全相同**。

也就是说这个分离一直是**名义上的**：action 层面有两个名字，权限层面只有一个。而
`strategy.write` 由**两个**角色持有（`sales_leader` 与 `marketing_manager`），所以
市场负责人可以批准销售组织自己的承诺。

这不是理论问题。`strategy_plan.approved_at` 是下游所有周期性报表读取的基准 ——
批准是计划从草稿变成**被度量的数字**的那一刻。

## 候选方案

1. **维持现状，把 `strategy.plan.approve` 这个 action id 删掉**。承认没有分离，
   减少一个误导性的名字。代价：放弃一个目录其他地方已经在用的模式。
2. **新增权限 `strategy.approve`，发给两个持有 `strategy.write` 的角色**。分离了
   动作但没分离人，等于只换了个写法。
3. **新增权限 `strategy.approve`，只发给 `sales_leader`**（本 ADR 采纳）。

## 决策

`incr/0002` 新增权限 `strategy.approve`，**只授予 `sales_leader`**。目录规模从
19 权限 / 67 授予变为 20 / 68。

`marketing_manager` 保留 `strategy.write`：它仍然可以创建和修改计划，只是不能替
销售组织在这个数字上签字。

## 理由

**这个目录已经在一层之下做同样的切分。** `sales_rep` 持有 `pipeline.write` 但
**不**持有 `pipeline.forecast`，`catalog.ts` 的注释写着「拥有这个商机，但不拥有预测
承诺」。计划审批是同一个形状上移了一层：**谁能改** 与 **谁能承诺** 是两件事。

`docs/20-specs/50-role-permission-catalog.md` 的权限表原本也没有描述审批 ——
`strategy.write` 的说明是「D1 创建/修改战略与细分市场」。规格文档从未主张编辑者可以
审批；是实现把两者折在了一起。

## 后果

- 触及四处，必须同步变更：`incr/0002`（种子，运行时权威）、`authz/catalog.ts`
  （类型镜像）、`authz/actions.ts`（action → 权限映射）、
  `20-specs/50-role-permission-catalog.md`（发布口径）。`catalog.test.ts` 的双向
  parity 断言会在任一处漏改时变红。
- `PERM_CODES` 与种子做**顺序**比对，而种子按增量追加增长，所以 `strategy.approve`
  列在数组末尾而非与其他 D1 权限归组。为整齐而重排会破坏那条捕捉意外重排的断言。
- 一个测试断言**整个角色目录**中只有 `sales_leader` 持有 `strategy.approve`，因此
  将来多发一份是会先在测试里变红的刻意行为。

## 关于本 ADR 的补记

CLAUDE.md 规定：填过的空白槽（含角色/权限目录）「changing them is a product decision
with an ADR, not a free edit」。PR #33 完成了变更本身与四处同步，**但没有写这份
ADR** —— 该 ADR 在变更合并之后才补上。规则要求的是变更**附带** ADR，不是事后补记；
记在此处以免这个先后顺序被后来者当作先例。
