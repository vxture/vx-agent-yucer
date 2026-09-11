# ADR-032: db-init 记账：每个 DDL 文件只应用一次

- Status: accepted
- Date: 2026-09-10
- Deciders: owner (方案三选一：增量账本 / since 参数 / 逐个补幂等守卫 → 账本)
- Amends: the db-init design inherited from the template (batch E): "re-apply
  00 / 97 / 98 and every increment on every run"

## The failure

The second production db-init ever run (2026-09-10, run 34517329962, the first
re-run on a database that already had everything) died in three places, two of
them reached:

1. `00_baseline.sql` re-created `yucer_core.contact` - incr/0026 had renamed
   it to `person`, so `CREATE TABLE IF NOT EXISTS contact` found nothing and
   made a second, empty table.
2. `98_column_locks.sql` granted UPDATE on `account.industry`, a column
   incr/0040 had dropped. The run stopped here.
3. Rehearsed locally past that: incr/0007 grants on `product.category`, which
   incr/0029 dropped. Every early increment carries statements written against
   the schema as it was when the increment was new.

CI's `db-contract` applies the set once on a fresh database and had never
replayed it; the property production depended on was the one nothing tested.

## The ruling

db-init keeps a ledger, `yucer_meta.applied_ddl` (`deploy/database/ddl/ledger.sql`),
one row per file: `baseline` for the 00 / 97 / 98 trio and the file name for
each increment. A file is applied only if it is not in the ledger, and recorded
when it is. The trio runs on a fresh database only.

A database that predates the ledger (nothing recorded, yet the baseline is
there) is not guessed at: db-init refuses unless the operator passes
`bootstrap_through=NNNN`, then records the trio and every increment up to that
number as applied - once - and carries on from there. Production is bootstrapped
through 0052 on the first run after this ADR.

The remote half of db-init is a file in the repo (`deploy/db-init-remote.sh`)
rather than a heredoc in the workflow, so it can be rehearsed against a local
database with `DB_URL=...` - which is how the production run was rehearsed on a
twin (old DDL through 0052, the stray `contact`, then bootstrap: 0053 and 0054
applied, nothing else; a second run a no-op).

## What stays true

- `db-init` is still the sole structure-change path; the ledger is its
  bookkeeping, not a product table - it lives outside 00 / 97 / 98 / incr, is not
  mirrored into Prisma, gets no service-role grant, and no domain reads it.
- Increments are still append-only and still written idempotently for a fresh
  database; the guardrails still check them. What changes is that an increment
  is no longer expected to be a no-op against a schema three increments newer
  than itself.
- The baseline and the locks keep the guards added in the same batch (contact
  only while `person` is absent; three lock statements only in baseline shape)
  and incr/0054 removes the stray `contact` production already has. Belt and
  braces: with the ledger, the trio does not run on a migrated database at all.

## What this does NOT do

- No per-file checksum. A recorded file that is later edited is not re-run and
  not flagged; increments are append-only by rule, and editing an applied one
  is already forbidden.
- No down-migrations. Rolling a structure change back is a new increment.
- The template's db-init is still the old design; this is mirrored to
  vx-agent-vxtpl as a separate PR.
