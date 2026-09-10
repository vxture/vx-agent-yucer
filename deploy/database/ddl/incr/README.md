# incr - numbered DDL increments

Structure changes to a live database ship here as idempotent, numbered SQL
increments (`0001_slug.sql`, `0002_slug.sql`, ...) applied by the db-init
workflow - never by editing `00_baseline.sql` (which is create-once) and never by
the container entrypoint.

Each increment must be idempotent: `ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, etc. Adding a writable column to an EXISTING table
also requires updating `../98_column_locks.sql`, or the service-role write fails
with permission denied.

## An increment that CREATES a table carries its own grants

db-init applies `00_baseline.sql` -> `97_service_role.sql` -> `98_column_locks.sql`
-> `incr/*.sql`, in that order. Two consequences, both silent, both fatal, and
neither has fired yet only because no increment has ever created a table:

1. **`97` cannot grant on it.** That file uses `GRANT ... ON ALL TABLES IN SCHEMA`,
   which Postgres evaluates AT GRANT TIME, and there is no `ALTER DEFAULT
   PRIVILEGES` anywhere in this repo. A table created afterwards has NO
   privileges for the service role - not "writes fail", nothing works - and it
   fails at runtime against a database that applied cleanly.
2. **`98` cannot lock it.** Its `REVOKE` would run against a table that does not
   exist yet, and db-init dies on the spot.

So an increment that creates a table MUST also, in the same file, `GRANT` the
service role its SELECT/INSERT/DELETE and `REVOKE`/`GRANT` its column-level
UPDATE whitelist. `scripts/guardrails/check-incr-grants.mjs` enforces the first
half in CI; put a mirrored comment in `../98_column_locks.sql` pointing at the
increment so the whitelist stays discoverable from one place.

## Applied increments

| File | Purpose |
|------|---------|
| `0001_seed_authz_catalog.sql` | Seed the yucer product role/permission catalog (19 permissions, 7 roles, 67 grants). Authority: `docs/20-specs/50-role-permission-catalog.md`. |
| `0002_strategy_approve_permission.sql` | Split approving a plan from editing one: adds `strategy.approve`, granted to `sales_leader` alone (catalog becomes 20 / 7 / 68). |
| `0003_scope_unique_nulls_not_distinct.sql` | Rebuild `uidx_sales_target_scope` and `uidx_forecast_snapshot_scope_at` as `NULLS NOT DISTINCT`. Postgres treats NULLs as distinct by default, so both were inert for the WORKSPACE-scope row (NULL territory and owner) - the case every other number is measured against. |

THIS TABLE STOPPED BEING MAINTAINED AT `0003`. Increments 0004-0031 shipped
without a row here, so the DIRECTORY LISTING is the authority on what exists,
not this table - read it that way rather than concluding the repo has four
increments. Only entries worth a paragraph are added below; the rest document
themselves in their own header comment.

| `0032_milestone_as_commercial_gate.sql` | A milestone becomes a payment gate (ADR-025): an immutable `baseline_due_at`, the recorded-acceptance trio, `revenue_schedule.milestone_id` NOT NULL behind a COMPOSITE foreign key, and the append-only `milestone_change`. It CREATES a table, so it carries its own grants per the section above - `check-incr-grants.mjs` counts 19 increment-created tables and verifies every one of them. |
| `0046_workspace_role.sql` | 角色管理: roles belong to the workspace. `local_authz.role` / `role_permission` become the 预置角色 (Chinese names, `sort_order`); new `workspace_role` (`role_code` locked, `name`/`sort_order` writable) and `workspace_role_permission` (insert/delete only); the nine presets are materialised for every workspace that has a member and `member_role.role_id` is re-pointed at the workspace's own copy, `ON DELETE RESTRICT`. |
| `0047_group_scale_presets.sql` | 集团级预置角色: 9 -> 24 presets on a ladder (287 grants, no two sets equal); `local_authz.role_line` / `role_rank` as per-workspace vocabularies (`workspace_role.line_id` / `rank_id` by uuid, RESTRICT); the preset carries its group as codes; existing workspaces get the vocabularies (empty-guard), the fifteen new presets and their copies' groups. |
| `0048_preset_role_order.sql` | 预置角色排序固化: preset `sort_order` runs business line first (the shipped 业务线 order), then rank from the top rung down inside each line; workspace copies that never re-ordered follow. |
| `0049_preset_lines_v2.sql` | 管理 line (was 集团与通用), seven more presets (a 负责人 per line; 销售总监 / 分公司总经理 / 大区销售总监 cut from the sales ladder), five renames, the owner's order; 24 -> 31 presets, 397 grants. Workspace copies follow only where still at the shipped value. |
| `0050_rank_order.sql` | The 层级 vocabulary reads top rung first (高管 ... 专员) like the roster since 0048, and 专员 / 代表 reads 专员; workspace rows follow only where never re-ordered. |
| `0051_org_structure.sql` | 组织结构 (ADR-029): `yucer_ref.org_template` / `org_template_unit` hold the three shipped templates (集团型大公司 21 units, 中规模全国公司 15 - default, 小规模简单团队 4); `yucer_gtm.org_unit_kind` (单位类型, a workspace vocabulary), `org_unit` (the tree: locked code, kind, parent RESTRICT, leader, sibling order) and `org_unit_member` (one unit per member, CASCADE). Workspaces with members receive the kinds and the default tree, guarded on empty. |
| `0052_territory_links.sql` | 销售区域的两个关节 (ADR-030): `territory_unit` (which units work it, many-to-many) and `territory_division` (which 大区 it covers, BY ID - `territory.regions` names resolved once, then no longer written; names derived at read time). `member.scope` admits `unit` (按组织). Links CASCADE with either side; pair-only grants. |

Note that `0001` carries DATA, not structure. It ships here rather than in
`00_baseline.sql` because `local_authz.role` / `local_authz.permission` are
runtime-read-only (UPDATE revoked in `../98_column_locks.sql`), so db-init is the
only legitimate write path - and because the catalog grows as features land,
while the baseline is create-once. A new permission is a new increment here,
never an application write.
