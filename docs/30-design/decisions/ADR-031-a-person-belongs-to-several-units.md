# ADR-031: 一人可在多个单位，持多个角色；成员管理有清单与组织两个视图

- Status: accepted
- Date: 2026-09-10
- Deciders: owner
- Amends: ADR-029 (`org_unit_member` keyed on (workspace, sub) - one placement
  per person); ADR-030's unit scope (the frame is now the union of subtrees)

## The ruling

> 支持一人在多个组织内，可以多个角色。
>
> 完善成员管理页面，提供清单视图，组织视图（按照组织架构布局，只显示主名称）
> 人员归入在组织之下。注意文字大小要符合规范。

## What changes

### 1. A placement is a pair (incr/0053)

`yucer_gtm.org_unit_member` was keyed on `(workspace_id, sub)` with UPDATE
granted on `unit_id` - a person was filed in one unit and moved by rewriting
that column. The key is now `(workspace_id, sub, unit_id)`: the same shape as
`member_role`, `member_territory` and `territory_unit`. A change is a delete
and an insert; UPDATE is revoked (the column form, because 0051 granted at the
column level and a table-level REVOKE does not reach column grants - the
db lane caught that).

The existing rows are already valid pairs. Nothing is migrated.

### 2. The unit scope frames the union

`resolveDataScope` reads every unit a member is placed in and takes the union
of their subtrees. The people in the frame are everyone placed anywhere in it;
the ground is every territory a unit in it works. A member placed nowhere still
sees only the queue, as ADR-030 ruled.

### 3. Roles were already a set

`local_authz.member_role` has been a pair since incr/0046. The form ticks
roles as a set and always did. The ruling's second half is restated here so
the two halves are read together: a person's roles are workspace-wide, not
per unit. A role that applies in one unit and not another is NOT this design
and would be a new ruling.

### 4. Two views of the roster - the page is 组织管理

The menu entry and the page are 组织管理 (owner, 2026-09-10: 成员管理改为组织
管理); the route stays `/admin/members`. The organisation view is the DEFAULT
and the first position of the switch; `?view=list` is the roster.

The tree table's columns are 选择｜序号｜名称｜关联区域｜数据范围｜角色｜操作:
a unit's 关联区域 is the ground it works (0052), a person's is what their
territory scope assigns, 数据范围 is the person's scope kind. Selecting person
rows raises the DS BulkActionBar with 移除原单位 / 移动到单位 / 复用到单位 -
each selected row is one placement, so the same person under two units is
two of them; 复用 adds a unit and ends nothing.


`/admin/members` keeps the table (清单视图) and adds 组织视图: the SAME TREE
TABLE 组织结构 draws - tree order, indented, a muted chevron per branch - in
which UNITS AND PEOPLE ARE BOTH ROWS (owner: 每个人是一行，与组织是同级的行).
Under a unit its child units come first, then the people placed in it, each
with their roles; a unit row wears one `buildings` icon (no kind
differentiation), a person row the DS avatar. The unit column carries the
NAME ONLY (no codes, kinds, leaders or scopes; those are the org page's). A
person in two units is a row under both. Whoever is placed nowhere sits under
a last row, 未归属单位. The switch is the toolbar's left end and lives in the
URL (`?view=org`) like the drawer's `?details=`; 添加成员 is its right end.

The difference from 组织结构 is the row operations (owner: 差别就是在各单位内
可以添加成员): a unit row offers 添加成员 / 移出成员; a person row offers
成员详情 / 成员配置 / 移动到单位 (this placement goes elsewhere) / 添加到单位
(more units, and 新角色 alongside) / 移出本单位. Every one rewrites the
person's SET of units through the same service verb the form uses - so
adding somebody somewhere keeps their other units - and roles go through
the roster service's own gate.

The nesting is a pure function (`lib/member-org-view.ts`) with its own test;
the component only draws.

### 5. Type per the DS scale

The org roster and the permission tree set their title lines with
`text-body`, which is not a tier the DS has (`body` runs `sm`/`md`/`lg`/`xl`),
so the class did nothing and the names fell through to the table's 12px base.
Both cells are now the DS's `TableTitleCell` - `label-md` bold over `body-sm`,
the table tier the DS documents - and the thirteen other untiered `text-body`
uses across the app are `text-body-md`, the control default. Secondary lines
in tables stay `body-sm` (12px): that is the DS's table tier, not an
oversight, and the minimum the scale allows.

## What this does NOT do

- No role-per-unit. See 3.
- No head-count roll-up in the org view: a unit's tag counts the people placed
  THERE. The subtree total is a different fact and nobody has asked for it.
- No drag-and-drop between units in the org view. A placement is added or
  removed through a confirmed dialog on the unit's row, or on the member's
  form - two doors to one fact, never a gesture that files somebody by
  accident.
