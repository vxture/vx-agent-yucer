# Agent entry point

Start here if you are an AI agent working in this repo.

## What this repo is

`yucer` - a Vxture product repository for an enterprise sales super-agent. It
chains market strategy, sales planning, market execution, account management,
opportunity detection, opportunity management and delivery into one traceable
pipeline, with a sales copilot across all of it. See `README.md` for the product,
`docs/20-specs/` for the definitive product spec.

It was instantiated from `vxture-template` (`scripts/init/instantiate.mjs yucer`),
so the org governance base, the platform integration contract surface, and the
deploy pipeline are inherited unchanged. The product code cascade is already
consumed - `yucer` is a literal everywhere, not a placeholder. Do not re-run
instantiation.

## Where authority lives

Not in this repo, for governance. The governing standards are in the platform
repo (`D:\MyWebSite\vxture`): `140-repo-governance-standard.md` (WHAT),
`product_240_repo-template.md` (template design), `20-self-rectify-runbook.md`
(HOW + machine checks), `070-docs-taxonomy.md` (docs numbering). When you hit a
gap not covered by an existing standard, fix the standard in the platform repo
first, then mirror it here - do not invent a standard inside a product repo.

For the PRODUCT, authority is here and is layered:

- `docs/20-specs/` - what the product is, its domain boundaries, its business
  rules. This wins over everything below it.
- `docs/30-design/` - how it is built. Conflicts with `20-specs/` resolve in
  favour of `20-specs/`.
- `deploy/database/ddl/` - the single structure authority for data. Prisma is a
  client-generation source only and must stay in lockstep.

## Working rules

- Trunk-based: feature branch -> PR -> squash-merge -> delete branch. Never push
  `main` directly.
- The five required CI checks are a stable contract: `quality-gate` / `build` /
  `test-coverage` / `audit` / `gitleaks`. Do not rename the jobs that produce them.
- Docs: numbered = formal, unnumbered = temporary. `lint:docs-numbering --strict`
  blocks unnumbered `.md`. Domain docs use `{kind}_{domain}_{NNN}_{slug}`; this
  product's domain code is `yucer`.
- Data: `lint:data-design --strict` requires DDL and Prisma to declare exactly the
  same table set. Adding a model without its DDL table fails CI.
- Keep source, config, and root meta files ASCII-only. Files under `docs/` may use
  Chinese - the product spec does.

## Product rules that bite

Read `CLAUDE.md` section "Product domain rules that are now rigid here" before
touching domain code. The three that most often surprise:

1. **Adding a writable domain column requires updating
   `deploy/database/ddl/98_column_locks.sql`**, or the service-role write fails
   with permission denied at runtime. This is deliberate.
2. **Attribution keys and evidence columns are immutable.** If your code needs to
   "just update" `signal.payload` or `opportunity.campaign_id`, the design has
   been misread - see `docs/20-specs/30-business-rules.md` section 4.
3. **The copilot proposes, it does not write.** Domain writes originating from the
   agent go through `agent_action` with a human decision recorded. See ADR-003.

## Where to look next

- `docs/70-workplan/00-index.md` - batch tracker, what is done and what is next.
- `docs/60-operations/00-index.md` - tech-debt register (TD-001 is open: the
  business rules exist as documented canon and DB constraints, but have no
  application-layer implementation yet).
