# incr - numbered DDL increments

Structure changes to a live database ship here as idempotent, numbered SQL
increments (`0001_slug.sql`, `0002_slug.sql`, ...) applied by the db-init
workflow - never by editing `00_baseline.sql` (which is create-once) and never by
the container entrypoint.

Each increment must be idempotent: `ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, etc. Adding a writable column also requires updating
`../98_column_locks.sql`, or the service-role write fails with permission denied.

## Applied increments

| File | Purpose |
|------|---------|
| `0001_seed_authz_catalog.sql` | Seed the yucer product role/permission catalog (19 permissions, 7 roles, 67 grants). Authority: `docs/20-specs/50-role-permission-catalog.md`. |
| `0002_strategy_approve_permission.sql` | Split approving a plan from editing one: adds `strategy.approve`, granted to `sales_leader` alone (catalog becomes 20 / 7 / 68). |

Note that `0001` carries DATA, not structure. It ships here rather than in
`00_baseline.sql` because `local_authz.role` / `local_authz.permission` are
runtime-read-only (UPDATE revoked in `../98_column_locks.sql`), so db-init is the
only legitimate write path - and because the catalog grows as features land,
while the baseline is create-once. A new permission is a new increment here,
never an application write.
