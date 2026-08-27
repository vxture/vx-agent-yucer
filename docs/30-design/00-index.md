# 30-design - Architecture, ADRs, domain design, DB schema

Design documents for this repo: architecture, architecture decision records
(`decisions/`), domain design, and database schema docs.

Domain documents use the strict org underscore family `{kind}_{domain}_{NNN}_{slug}`
(kind in data/design/ops). This product's domain code is `yucer`.

| File | Holds |
|------|-------|
| `design_yucer_100_capability-domains.md` | 能力分区架构：分层、域->schema 映射、跨 schema 引用规则、两道门在代码中的落点 |
| `data_yucer_200_domain-schemas.md` | 产品域数据模型：34 张表清单、命名与类型约定、不可变约束、变更通道 |

## Subdirectories

- `decisions/` - architecture decision records (`ADR-NNN`, append-only, stable IDs)

## 上游规格

设计文档回答「怎么做」，产品边界与业务口径的权威在 `docs/20-specs/`：
`20-capability-domains.md`（域边界）、`30-business-rules.md`（业务规则）。
两者冲突时以 `20-specs/` 为准。
