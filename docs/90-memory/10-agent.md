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
identity, deployment logs and live health agree. After the owner renewed the
session, 37 read-only live checks passed: home goals/links, exact recent-task
restoration, STR and legacy-number resolution, version-correct adoption,
four module counts/tooltips and narrow dark/large-text layouts. The five
connected cases use a custom date range, not the Y2027 display period.
No business writes or model calls were made. Workplan 146 records the release
checklist. Resource-readiness workplan 144
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

Owner instruction (2026-11-26, workplan 148): continue DO-02 through DO-08
without intermediate stops. This authorizes consolidated implementation,
validation, PR/merge and the unified release for this deployment-domain bundle.
It supersedes the earlier preview-only hold for this bundle. Report meaningful
milestones and update the checklist. Production Environment approval remains
owner-only; never approve it on the owner's behalf.

Workplan 148 / PR #827 is merged at d1754efb. DO-00 through DO-07 are
complete: 50 local browser checks, 3,623 offline tests and 529 real database
tests; PR/main six required checks and CodeQL passed, PR Sonar gate passed.
The main external Sonar gate retains the prior E/C baseline, tracked in #684;
this merge adds one maintainability item and no bug/vulnerability. The owner
personally approved production run 45870636983, which completed successfully.
v0.1.147 / d1754efb / production is deployed; verified image, deployment logs
and live health agree. Twenty-nine signed-in read-only checks passed across
all four modules, copilot widths, mobile dark/large text, customer details,
versioned evidence, historical read-only views, domain year links and the
legacy forecast entry. No business writes, model calls or DDL/config changes
were made. Display preferences were restored and the original working tab
preserved. Workplan 148 records DO-00 through DO-08 as complete, separating
local, CI and live evidence. This authorization covers the reviewed bundle
only; subsequent application releases still require explicit owner direction.

Owner instruction (2026-11-26): implement a coherent stage before running the
full test suite. Small, reversible adjustments receive only the relevant
checks; do not rerun the entire local suite after each small step. Run broader
validation at meaningful batch boundaries or for a concrete unresolved risk.
Mandatory repository CI checks still gate each PR head and merge; do not bypass
or weaken them. Keep progressing without unnecessary stops.

For the current three-library visual iteration, the owner further instructed:
finish the typography, icon placement and information layout first and show the
local preview. Wait for visual confirmation before tests or checks; several
design rounds are expected. Do not open a PR (which automatically runs CI)
before that confirmation. Rendering the local preview and capturing it for
review are part of the design work. This does not authorize a release.

The owner approved the subsequent business-link visual rule for the four
planning modules: neutral text, primary-text icons softened by opacity-muted
in light mode, opaque primary-text icons in dark mode, and link-hover for
both on hover or keyboard focus. Keep icon and title in one click target;
text-only references retain a link cue. This remains part of the same local
visual review, not authorization for tests, PR CI or release.

The owner subsequently instructed "continue build and release" for workplan
147's reviewed visuals and first-publication metadata. This authorizes the
remaining implementation, consolidated validation, PR and unified release.
The following correction is part of this bundle: all four card headers have
two information rows, then a dashed divider; product type and list price
both belong below that divider. Do not ask again for release confirmation
for this authorized bundle. Production Environment approval stays owner-only.

PR #825 is merged at e0d57a7c. All six required checks and CodeQL passed on
both the PR and main. The PR external Sonar gate remains ERROR at 79.5%:
all uncovered lines are PostgreSQL trigger code without imported SQL runtime
coverage; new TS store/Prisma code is 100%, and real twin DB suites passed
529 each. No gates or exclusions were changed; do not claim Sonar passed.
The owner personally approved db-init 45847722290 (0141: 1 applied,
141 recorded) and deploy 45849193192. v0.1.146 / e0d57a7c / production
is deployed and healthy; registry tag/commit digests, deployment logs and
live identity agree. Twenty-one real logged-in read-only checks passed:
four card layouts/links, solution price alignment, product type and all
prices below the divider, publication metadata, detail/history panels and
390px dark/large-text reading with the dock closed. All 18 visible legacy
products show Not recorded. No business writes or model calls were made;
first-publication writes are proved by real twin DB tests, not a production
fixture. Temporary display preferences were restored, twin databases dropped,
and the existing 4060 preview retained. Workplan 147 records the checklist and
Sonar limitations. Resource-readiness workplan 144 remains unimplemented.
This authorization covers the reviewed v0.1.146 bundle only; subsequent
product changes still require explicit owner release confirmation.

## Test-account business content

Owner clarified (2026-11-26, workplan 149): strategy provides macro direction
at any scale or duration. The company sales plan commits annual executable
targets, with time and region as independent allocation axes. Named customers,
pipeline, new customers, channels and reference cases support those targets.
Deduplicate registered objects by identity only: two distinct registrations
with the same name remain two objects. Credit-code matching, intelligent
duplicate detection and record merging are future work outside this batch.
Implement and preview this bundle; no new application release is authorized.

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
