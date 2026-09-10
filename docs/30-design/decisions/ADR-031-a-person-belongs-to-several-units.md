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

### 4. Two views of the roster

`/admin/members` keeps the table (清单视图) and adds 组织视图: the units laid
out as the tree draws them - the root across the page, its children side by
side, everything deeper stacked inside its parent - with the people placed in
each unit listed under it BY NAME ONLY. No codes, kinds, leaders or scopes
there; those are the roster's and the org page's. A person in two units is
listed under both. Whoever is placed nowhere is listed apart as 未归属单位.
The switch lives in the URL (`?view=org`) like the drawer's `?details=`.

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
- No drag-and-drop between units in the org view. Placement is set on the
  member's form, as every other member fact is (the 2026-09-10 display/form
  split).
