# yucer

An enterprise sales super-agent. yucer chains market strategy, sales planning,
market execution, account management, opportunity detection, opportunity
management and delivery into one traceable pipeline, with a sales copilot running
across every stage of it.

The product thesis is that the usual failure of a B2B sales organisation is not a
missing feature, it is a broken chain: strategy lives in slides, planning in
spreadsheets, deals in a CRM, delivery somewhere else, and post-mortems nowhere.
When the chain breaks you cannot answer "how much of this quarter's pipeline
actually came from the segment we decided to attack". yucer keeps the whole chain
on one data model and one agent, so attribution is a join rather than a manual
tally.

Product code: `yucer`. Instantiated from `vxture-template`, so the org governance
base, the platform integration contract surface (C1 OIDC RP / C2 entitlement /
C3 provisioning and usage) and the deploy pipeline are inherited unchanged.

---

## The eight capability domains

| Domain | Name | Owns | Schema |
|--------|------|------|--------|
| D1 | market and sales strategy | strategy plans, market segments | `yucer_gtm` |
| D2 | sales planning | territories, targets and quota | `yucer_gtm` |
| D3 | market execution | campaigns, campaign executions | `yucer_gtm` |
| D4 | account management | accounts, contacts, relationship graph, offerings | `yucer_core` |
| D5 | opportunity detection | signals, leads | `yucer_pipeline` |
| D6 | opportunity management | opportunities, stage events, forecasts, win/loss | `yucer_pipeline` |
| D7 | delivery | projects, milestones, tasks, revenue schedule | `yucer_delivery` |
| D8 | sales copilot | sessions, messages, proposed actions, playbooks | `yucer_agent` |

Domains are split by **object ownership**: one object has exactly one owning
domain that may write it; every other domain references it read-only. Eight
domains map onto five schemas by transaction boundary - see
`docs/30-design/decisions/`.

Full definitions: `docs/20-specs/20-capability-domains.md`.

## Two independent gates

Every action passes two gates, in this order, and neither substitutes for the
other:

1. **Entitlement** (did this workspace buy it) - the C2 envelope from the
   platform decides which feature keys the tier unlocks. Read-only consumption;
   the product never re-derives a commercial decision.
   See `docs/20-specs/40-capability-matrix.md`.
2. **Permission** (may this member do it) - the product's own `local_authz`
   roles. See `docs/20-specs/50-role-permission-catalog.md`.

Buying `copilot.autopilot` at the enterprise tier does not let a read-only member
turn on autonomous execution.

## The agent is a proposer, not a writer

Every write the copilot wants to make is an `agent_action` proposal:
`proposed -> accepted | rejected -> executed`. Accepting requires a human on the
record (`decided_by_sub`), and the proposal itself (`payload`, `rationale`,
`confidence`) is immutable at the database level, so "what did the agent actually
recommend at the time" is always answerable. Autonomous execution exists, but
only as an explicit enterprise-tier authorisation, and it still writes the full
record. Rationale: `docs/30-design/decisions/ADR-003-agent-actions-are-proposals.md`.

---

## Repository layout

```
portals/app/            Next.js app (standalone). auth/ entitlement/
                        provisioning/ usage/ are the platform contract surface
                        and are rigid - product domain code does not touch them.
deploy/database/ddl/    Single DDL authority: three-part baseline + incr/
docs/                   Numbered docs taxonomy (see docs/00-meta/00-index.md)
scripts/guardrails/     Machine-checked repo invariants
```

## Local development

```bash
pnpm install
pnpm type-check:all
pnpm lint
pnpm lint:docs-numbering
pnpm lint:data-design
```

A `NODE_AUTH_TOKEN` with read access to GitHub Packages must be set so
`pnpm install` can resolve the `@vxture` scope (see root `.npmrc`).

## Database

The DDL under `deploy/database/ddl/` is the single structure authority
(create-once); `portals/app/prisma/schema.prisma` is a client-generation source
only and is held in lockstep by `pnpm lint:data-design`. Current baseline is 34
tables: 10 contract-schema tables inherited from the template plus 24 product
domain tables.

Structure changes ship as numbered idempotent increments under `ddl/incr/`,
applied by the `db-init` workflow - never by editing the baseline, never by the
container entrypoint, and never through Prisma migrate.

## What runs today

Batches 1-3 are delivered. Batch tracker: `docs/70-workplan/00-index.md`.

```
portals/app/app/
  (app)/            eight domain pages, the copilot conversation and the
                    proposal queue. Server components resolve session ->
                    entitlement -> permission; the client receives conclusions,
                    never the inputs to compute them.
  authz/            the permission gate. catalog.ts is a typed mirror of the
                    seeded role/permission catalog, held in lockstep by a test
                    that parses the seed SQL.
  agent/atlas/      the model plane - the only LLM exit. Routes by endpointCode.
  agent/runos/      the capability plane - four MCP tools. Skills are
                    distributed, never executed by the gateway.
  agent/orchestrator/  one copilot turn: model + tools -> agent_action proposals.
  domains/<d>/      rules (pure), service (both gates), store (port +
                    in-memory + Prisma). All eight domains.
```

609 unit tests. The five required CI checks are green.

### Three things enforced by machine rather than by convention

1. **The permission catalog cannot drift from the database.** `catalog.test.ts`
   parses `incr/0001_seed_authz_catalog.sql` and asserts 19 permissions, 7 roles
   and 67 grants match in both directions.
2. **A write cannot touch a locked column.** `column-locks.ts` mirrors
   `98_column_locks.sql`, its test parses the DDL for parity, and every Prisma
   adapter checks a patch before it reaches the driver - so an illegal write
   fails with a named violation at the call site rather than as
   `permission denied for column ...` in production.
3. **A navigation entry cannot point at a route that does not exist.**
   `routes.test.ts` asserts every nav href has a page behind it.

### Seeing it without a platform

- `/product-preview` - the surfaces with fixtures, no session required. Role and
  tier pickers show both gates behaving side by side.
- `YUCER_DEMO_DATA=on` (offline only, refused when `DATABASE_URL` is set) seeds
  one complete traceable chain: strategy -> campaign -> signal -> lead ->
  opportunity -> project -> revenue.

## Working agreement

See [CLAUDE.md](CLAUDE.md) for the full repository working agreement: branch
model, tag-triggered release flow, the five required CI checks, secret hygiene,
SCA policy, docs taxonomy, and the rigid-zone / blank-zone boundary.
