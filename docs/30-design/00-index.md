# 30-design - Architecture, ADRs, domain design, DB schema

Design documents for this repo: architecture, architecture decision records
(`decisions/`), domain design, and database schema docs.

Domain documents use the strict org underscore family `{kind}_{domain}_{NNN}_{slug}`
(kind in data/design/ops). This product's domain code is `yucer`.

| File | Holds |
|------|-------|
| `design_yucer_100_capability-domains.md` | 能力分区架构：分层、域->schema 映射、跨 schema 引用规则、两道门在代码中的落点 |
| `design_yucer_110_the-funnel.md` | 销售漏斗：五段贯穿、每段的入口条件与中途终止、终止原因的记录 |
| `design_yucer_120_panorama-layers.md` | 客户全景图信息架构：六层加证据底座、场景×层优先级、首屏裁决、不服务的四件事、成功度量 |
| `design_yucer_130_panorama-ownership.md` | 客户全景图业务架构：读侧聚合不拥有对象、对象归属清单、跨域写四条规矩、决策链特例、合同归 D7 |
| `design_yucer_140_panorama-rules.md` | 客户全景图规则：三条元规则、规则归域还是留页面、各规则的边界与退化、智能体产出的成分要求 |
| `data_yucer_200_domain-schemas.md` | 产品域数据模型：表清单、命名与类型约定、不可变约束、变更通道（**数字已陈旧**，见文件内注） |

## Subdirectories

- `decisions/` - architecture decision records (`ADR-NNN`, append-only, stable IDs)

## 上游规格

设计文档回答「怎么做」，产品边界与业务口径的权威在 `docs/20-specs/`：
`20-capability-domains.md`（域边界）、`30-business-rules.md`（业务规则）。
两者冲突时以 `20-specs/` 为准。
