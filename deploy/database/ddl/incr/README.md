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

Note that `0001` carries DATA, not structure. It ships here rather than in
`00_baseline.sql` because `local_authz.role` / `local_authz.permission` are
runtime-read-only (UPDATE revoked in `../98_column_locks.sql`), so db-init is the
only legitimate write path - and because the catalog grows as features land,
while the baseline is create-once. A new permission is a new increment here,
never an application write.
