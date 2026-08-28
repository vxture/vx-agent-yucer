# ADR register (architecture decision records)

Append-only log of architecture decisions for this repo. Each ADR is a file named
`ADR-NNN-slug.md` with a stable, never-reused, never-renumbered ID (taxonomy
meta-rule section 4). New decisions append; IDs may skip.

| ID | Title | Status | Date |
|----|-------|--------|------|
| ADR-001 | [产品切成八个能力分区](ADR-001-eight-capability-domains.md) | accepted | 2026-08-12 |
| ADR-002 | [八个能力分区映射到五个 DB schema](ADR-002-five-schemas-for-eight-domains.md) | accepted | 2026-08-12 |
| ADR-003 | [智能体的写操作一律是「可审阅提案」](ADR-003-agent-actions-are-proposals.md) | accepted | 2026-08-12 |
| ADR-004 | [模型走 Atlas，能力与技能走 Runos](ADR-004-atlas-and-runos-as-the-only-agent-planes.md) | accepted | 2026-08-15 |
| ADR-005 | [审批计划是与编辑计划不同的权限](ADR-005-approving-a-plan-is-not-editing-it.md) | accepted | 2026-08-16 |
| ADR-006 | [现场证据独立成 schema：`yucer_field`](ADR-006-field-evidence-as-its-own-schema.md) | accepted | 2026-08-16 |
| ADR-007 | [知识只经 karda；契约发布前本仓不写任何 karda 代码](ADR-007-karda-as-the-only-knowledge-crossing.md) | accepted | 2026-08-16 |
| ADR-010 | [后台作业面：内部令牌路由 + 外部定时器](ADR-010-recurring-jobs.md) | accepted | 2026-08-16 |
| ADR-011 | [arda 接在信号缝上：一期只取数、不外发、零 DDL](ADR-011-arda-on-the-signal-seam.md) | accepted | 2026-08-16 |
| ADR-012 | [采集习惯的杀死判据](ADR-012-the-capture-kill-criterion.md) | accepted | 2026-08-17 |
| ADR-013 | [战略客户与跟进节奏](ADR-013-strategic-accounts-and-the-cadence.md) | accepted | 2026-08-17 |
| ADR-014 | [产品体系](ADR-014-the-product-catalogue.md) | accepted | 2026-08-17 |
| ADR-015 | [能力键而非智能体身份](ADR-015-capability-keys-not-agent-identities.md) | accepted | 2026-08-18 |
| ADR-016 | [招标信号与定向挖掘](ADR-016-tender-signals-and-targeted-mining.md) | accepted | 2026-08-18 |
| ADR-017 | [目录是一个不带功能键的能力分区](ADR-017-the-catalogue-is-a-partition-without-a-key.md) | accepted | 2026-08-26 |
| ADR-018 | [证据面不单独售卖，但记录不等于编辑](ADR-018-the-evidence-plane-is-not-sold-separately.md) | accepted | 2026-08-26 |
| ADR-019 | [底价必须有人能签字，签字不能挂在行项上](ADR-019-a-floor-nobody-could-cross.md) | accepted | 2026-08-28 |
| ADR-020 | [计数不是金额，指标必须自己决定分子](ADR-020-a-count-is-not-an-amount.md) | accepted | 2026-08-28 |
| ADR-021 | [预测总是对某个周期的，而周期要真的过滤](ADR-021-a-forecast-is-always-for-a-period.md) | accepted | 2026-08-28 |
| ADR-022 | [任务表删除：一条产品从没声明要开的战线](ADR-022-a-front-this-product-never-opened.md) | accepted | 2026-08-28 |
