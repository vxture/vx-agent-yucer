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
- The six required CI checks are a stable contract: `quality-gate` / `build` /
  `test-coverage` / `audit` / `gitleaks` / `db-contract`. Do not rename the jobs that produce them.
- Docs: numbered = formal, unnumbered = temporary. `lint:docs-numbering --strict`
  blocks unnumbered `.md`. Domain docs use `{kind}_{domain}_{NNN}_{slug}`; this
  product's domain code is `yucer`.
- Data: `lint:data-design --strict` requires DDL and Prisma to declare exactly the
  same table set. Adding a model without its DDL table fails CI.
- Keep source, config, and root meta files ASCII-only. Files under `docs/` may use
  Chinese - the product spec does.

## Product release review preference

Owner instruction (2026-11-21): batch related product feedback instead of
releasing once per question. Before an application release tag, stop at local
preview, report the changes and any unresolved issues, and wait for the owner
to confirm that the reviewed result is ready to release. A prior release request
does not authorize automatically releasing subsequent preview corrections.
Production GitHub deployment approval remains a separate owner action.

Owner reiterated (2026-11-25): do not publish without an explicit instruction.
Continue implementation, checks and previews; do not create release tags, start
deployments, or treat successful checks as release authorization.

Owner's current C01-C04 instruction: hold all releases and plan version bundles.
Track signal intelligence, launcher counts, multi-strategy sales-plan drafts and
regional examples in `docs/70-workplan/135-business-usability-batches.md`.

Owner subsequently instructed "proceed with production release" after reviewing
the completed C01-C04 report. This authorizes the unified v0.1.143 release from
2659c04e, including #807 and #808-#811. It supersedes the hold for this reviewed
bundle only. Future changes still require explicit release authorization;
production Environment approval remains an owner-only GitHub action.

v0.1.143 deployed with owner approval (run 45740803764, 2659c04e). Its live
signal resolution save failure was fixed in #813. The owner explicitly
confirmed this patch release and personally approved run 45750630815;
v0.1.144 (16f31bb1, production) is deployed and healthy. All five existing
manual signals passed live matching/scoring; one promoted lead was found by
business number, repeated promotion was refused, evidence stayed unchanged,
and the launcher agrees with the four remaining pending signals. Track the
acceptance in workplan 135. Arda external ingestion remains unconfigured and
unverified. This authorization covers the reviewed patch only; future changes
still require explicit owner release confirmation.

The owner subsequently instructed "continue this release" for the reviewed
home and strategy bundle (workplans 139, 140, 141, 142, 143 and 145; PRs
#815-#822). The owner personally approved database run 45816301415 and
application run 45817978741. Increment 0140 applied successfully (1 applied,
140 already recorded). v0.1.145 / 215f206b / production is deployed; registry
identity, deployment logs and live health agree. Real signed-in acceptance is
pending renewal of the expired browser session; do not claim it has passed.
Workplan 146 records the release checklist. Resource-readiness workplan 144
remains design-only (RR-02 through RR-05 unimplemented); planned resource
demand is not an actual-arrival fraction. This authorization covers the
reviewed v0.1.145 bundle only, not subsequent fixes or releases.

## Product button hierarchy preference

Owner clarified (2026-11-25): primary page actions use DS 14px typography;
secondary actions use DS 12px typography. Prefer one control size within an
action row, normally retaining the existing 32px height. Mixed typography or
DS control sizes in the same row are allowed when they improve hierarchy or
usability; uniform sizing is a design preference, not an absolute prohibition.
Apply this by action importance, not button appearance alone. Do not mechanically
resize existing controls. See the product workspace-layout design's operation
density section. This does not authorize a release.

## Validation cadence preference

Owner instruction (2026-11-26): implement a coherent stage before running the
full test suite. Small, reversible adjustments receive only the relevant
checks; do not rerun the entire local suite after each small step. Run broader
validation at meaningful batch boundaries or for a concrete unresolved risk.
Mandatory repository CI checks still gate each PR head and merge; do not bypass
or weaken them. Keep progressing without unnecessary stops.

## Test-account business content

Owner instruction (2026-11-25): business records added to the authorized
test account, including records already entered in this batch, should use normal
business names and prose, without
visible demo prefixes or data-generation labels. Keep fixture provenance and
batch tracking internally. This does not authorize inventing real identity
credentials, verified external sources, or overwriting immutable history.

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
