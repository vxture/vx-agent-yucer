# ADR-029: 组织结构是第四个轴，完全自定义，预置模版作基准

- Status: accepted
- Date: 2026-09-10
- Deciders: owner
- Amends: `docs/30-design/data_yucer_200_domain-schemas.md` (yucer_gtm gains
  three tables; yucer_ref gains two reference tables); the "部门团队 is
  planned" note in `admin-nav.ts` (2026-09-08), which is now closed

## The ruling

我考虑是不是缺少一个组织结构，结合成员管理，数据授权，便于管理。And, on the
proposal: 1. 组织结构是完全可以自定义的 2. 与前面相同，提供平台预置模版，多套
模版-作基准。 3. 模版覆盖集团型大公司，中规模全国组织，小规模简单团队。。。
默认中规模全国公司，总部-大区-团队 三级架构。

## What was missing

The product had three axes and no fourth. A role says what a person may DO
(ADR-028). A territory says which GROUND a team works. A 大区 says how the
market is CUT (ADR-027). Nothing said which UNIT a person belongs to, or who
leads it. 数据范围 was a hand-picked list of territory ids per member; there
was no reporting line for an approval or a hand-over to follow; 成员管理 could
not answer "who is in 华南分公司". The nav carried 部门团队 as a planned item
for two days with the honest note that a department entity is a table, an
increment, column locks and a mirror - its own decision, not a side effect of
drawing a menu. This is that decision.

## What is true now (incr/0051)

The shape every configuration here has: a shipped reference, a per-workspace
copy the tenant owns, an anchor code that never changes.

| Table | Is | Runtime |
|-------|----|---------|
| `yucer_ref.org_template`, `org_template_unit` | the three shipped templates as rows: 集团型大公司 (21 units, five levels), 中规模全国公司 (15, three levels, DEFAULT), 小规模简单团队 (4, two levels) | read-only; a template changes by increment |
| `yucer_gtm.org_unit_kind` | 单位类型 as the workspace's own vocabulary: 总部 / 事业部 / 大区 / 分公司 / 团队 shipped; a 中心 is one row | `name` / `sort_order` writable; `kind_code` locked; deletable only while no unit is of it |
| `yucer_gtm.org_unit` | the tree: `unit_code` (locked), name, kind by id, parent by id (`ON DELETE RESTRICT`), `leader_sub`, order among siblings | name, kind, parent, leader, order writable |
| `yucer_gtm.org_unit_member` | which unit a member is in: ONE per (workspace, sub), `ON DELETE CASCADE` with the unit | placement replaced whole |

A workspace is materialised on first contact - the kinds and the default
template together, guarded on "no kinds yet" so a workspace that emptied its
tree on purpose is not re-seeded behind its back. 重置预置 replaces the tree
with any of the three, says how many units go and how many members it
un-places, and asks twice.

## Why it sits in yucer_gtm, beside 销售区域

The organisation is a planning object: a territory is what a unit WORKS, and
the two will be linked. It is not a second tree. 销售区域 already has a parent,
an owner and a number, and remains "a team working that ground"; nothing in
0051 duplicates it. Members stay in `local_authz` with no foreign key across -
the rule `member_territory` already follows, because authz sits under the
domains and a domain table cannot reference upward.

## What this batch does NOT do

- 按组织 data scope. The obvious next step - a member scope of kind `unit`
  whose visible territories derive from the unit's subtree - is the next
  batch, with `territory.unit_id` as the link. Placing a member is gated on
  `admin.member.scope` TODAY for that reason: it is the permission that
  governs what a member sees, and the unit is about to be that.
- The leader chain as an approval route. `leader_sub` is stored; nothing reads
  it yet. When 折扣审批 wants "my leader", it is one join away.

## Consequences

- Two action ids under the admin plane: `admin.org.upsert` (a unit, its
  order, a kind, a template applied) and `admin.org.remove` (the two deletes),
  both on `admin.manage`. Reads ride `admin.member.view`.
- `domains/planning/lib/org.ts` mirrors the kinds and the templates the way
  `market-division.ts` mirrors the carves; `org.test.ts` parses 0051 and fails
  on drift, and `org.db.test.ts` proves the table equals the mirror.
- 成员管理 gains a 所属单位 column, inline like 可见范围, one unit per member.
- The nav's `orgUnit` entry is built; its label reads 组织结构.
