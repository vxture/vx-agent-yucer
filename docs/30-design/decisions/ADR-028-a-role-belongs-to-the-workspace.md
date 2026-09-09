# ADR-028: 角色属于工作区，九个预置角色是起点

- Status: accepted
- Date: 2026-09-09
- Deciders: owner
- Amends: `docs/20-specs/50-role-permission-catalog.md` ("运行时纪律": the
  role catalogue was runtime-read-only); ADR-001's reading of the
  role/permission catalog as a build-time fill of the blank zone

## The ruling

角色页面，支持新建，排序，授权。按照区域设定模式，有系统预置角色，可以自定义。
And, asked whether roles are a table: 需要确认角色是不是库表，支持系统角色和多租户
自定义 - yes, and this records how.

## What was true before

`local_authz.role` held nine rows with no workspace on them and `role_permission`
held their grants; both were runtime-read-only, mirrored in `authz/catalog.ts`,
and the only way to change what 销售经理 may do was a numbered increment. Every
tenant had the same nine roles with the same grants. That was the honest shape
while a role was a fact of the build.

## What is true now (incr/0046)

The shape is the one 大区 have (incr/0036, 0045): a shipped reference and a
per-workspace copy the tenant owns.

| Table | Is | Runtime |
|-------|----|---------|
| `local_authz.role`, `role_permission` | the 预置角色 - nine rows, now with `name`, `description` and `sort_order` as data | read-only, as before |
| `local_authz.workspace_role` | one row per (workspace, `role_code`): preset copies and the tenant's own | `name` / `description` / `sort_order` writable; `role_code` locked |
| `local_authz.workspace_role_permission` | which permissions a workspace role holds | insert / delete only |
| `local_authz.member_role.role_id` | a `workspace_role` id, `ON DELETE RESTRICT` | as before |

A workspace is materialised from the presets on its first sighting (the
increment did it for every workspace that already had a member, re-pointing
every existing link), edits from there, and can reset the presets to the seed.
系统预置 / 自定义 is derived by comparison - name, sentence and grant set - never
stored.

## What stays closed

The permission catalogue. 权限当前全部为预置功能，不可增删改: a role is a set of
permissions the workspace composes; `PERM_CODES` is still the whole vocabulary,
and a code outside it is refused by the service and by the foreign key.

## The one rule that could lock a workspace out

After any change to a role, somebody active must still hold a role that carries
`admin.manage`. `authz/admin.ts` guarded this per member; `authz/roles.ts`
guards it per role, because a role changes under every member at once. The
guard is on the service, where it was, and refuses in the product's words
(`last_admin`).

## Consequences

- `authz/catalog.ts` stays, as the mirror of the PRESETS: the demo path and
  the tests still stand on it, and `catalog.test.ts` now also holds the nine
  names and sentences to the increment.
- `AuthzContext.roles` and `MemberRecord.roles` are strings, not `RoleCode`:
  the list is the workspace's.
- 权限管理 reads its columns from the workspace's roles, in the workspace's
  order; 成员管理's assignment menu does the same.
- `planMove` moved to `domains/shared/ordering.ts` so authz could order roles
  without importing a domain.

## Amended 2026-09-09 (incr/0047): the ladder, and two vocabularies

The owner redesigned the presets for a group-scale company - 24 rungs and
functions, so a tenant seldom needs a role of its own - and added two
groupings, 业务线 and 层级. Both are TABLES the workspace owns (`role_line`,
`role_rank`, the shape `industry` has), related by uuid from `workspace_role`,
seeded from the shipped lists and extended by the tenant; a preset names its
group by code. The rule that no two presets share a permission set holds
across all 24 and is now a test.
