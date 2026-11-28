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

## Product design and DS boundary

Owner clarification (2026-11-28): DS governs shared framework components,
foundational controls, accessibility, themes and tokens. Product-specific design
must be restored through reusable business components and scoped CSS. Do not
replace an approved layout with generic DS defaults or require every domain
composition to become an upstream DS component. Metric cards, tier progress,
customer/project compositions and business charts can own product presentation
while consuming DS tokens and respecting density/text-size preferences. Report
missing tokens; do not invent a second theme or modify global controls to fix
one business page. This clarifies the earlier thin-wrapper-only restriction in
CLAUDE.md. After reviewing the eight-page attainment correction and subsequent
customer/period/chart tooltip refinements, the owner explicitly instructed
"proceed with release" on 2026-11-28. This authorizes the reviewed correction
bundle's consolidated checks, PR/merge, tag/build and deployment preparation
(workplan 153). Production Environment approval remains owner-only. Do not
treat this authorization as covering future unreviewed corrections.

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
The owner subsequently instructed "proceed with production release" after
reviewing this bundle. This authorizes v0.1.148 from PR #829 / 755fe3e1,
including the reviewed annual commitment, strategic handoff and support-summary
changes. PR/main six required checks and CodeQL passed; PR Sonar passed with
91.2% new-code coverage and zero unresolved new issues. No DDL, configuration
or dependency changes are included. Production approval remains an owner-only
GitHub action. Future corrections still need explicit release direction.
Workplan 149 tracks image verification, approval and live acceptance.
The v0.1.148 image build succeeded (run 45922212681); actual identity
755fe3e1 / production and release/commit manifest digests were verified.
The owner personally approved production run 45922212681. Deployment succeeded
at 2026-11-27T01:32:34Z; health confirms v0.1.148 / 755fe3e1 / production.
Nineteen signed-in read-only assertions passed: annual adoption, same-currency
commitment reconciliation, supporting links, draft conflict handling, history
and evidence-count labels. No business writes or model calls were made.
Separate visual review found the new handoff-management Drawer clipped at
390px (512px wide, left -122px). Its viewport constraint is corrected in local
preview; 320/390/1440px bounds and controls passed in dark/large text. This
follow-up is NOT released or authorized for a new application tag. Workplan
149 retains the visual exception and pending patch-release acceptance.
Do not claim the 19 automated assertions prove all visual acceptance passed.
The existing 4060 preview and original production work tab are preserved.

Owner instruction (2026-11-25): business records added to the authorized
test account, including records already entered in this batch, should use normal
business names and prose, without
visible demo prefixes or data-generation labels. Keep fixture provenance and
batch tracking internally. This does not authorize inventing real identity
credentials, verified external sources, or overwriting immutable history.

Latest owner instruction (2026-11-27): "proceed with implementation and release;
plan one batch and task checklist." This authorizes the reviewed attainment V2
to move beyond HTML-only, through original AT-02 to AT-05, implementation,
consolidated checks, PR/merge and one unified application release. Workplan153
is AT-R1: R1-01 baseline/DS/contracts;02 real metrics/diagnostics;03 eight page
templates/framework;04 forecast/history/copilot business loop;05 consolidated
engineering/business acceptance;06 build/owner production approval/live checks.
Plan complete, R1-01 preparation only; no new runtime functionality or release
has been completed by writing this plan. Current authoritative states are in153;
earlier "AT-02 to05 unapproved / HTML only" notes are historical.
No repeat permission request for individual tasks or this authorized release
tag. Every production environment run still requires owner GitHub approval;
never approve on their behalf. Report large milestones and maintain checklist.
Use an isolated current-main baseline and preserve dirty150/151/other work;
include only named dependencies. Do not paste preview constants/SVG/gradient
arrangements into runtime as proof of real data/DS capability. Resolve actual
upstream component gaps and minimal source/model changes; no promise of no DDL
before audit. Real unknowns stay unknown, first-cooperation history includes
pre-system customers, formal targets/permissions/history/confirmed writes are
required. Choose the release version after checking used tags; no tag created
or production operation triggered in this planning turn.


AT-R1 implementation is in isolated worktree /private/tmp/yucer-attainment-r1,
branch feat/attainment-r1, baseline9a05b056. Eight page templates and controlled
analysis reads are implemented. Increment0142 adds append-only cooperation
history and exact-revision customer-action evidence. Fresh and upgrade DBs
passed532 each, repeated apply0, schema/grants identical; injected failure
rolled back and recovered, old-app compatibility25 passed. Local browser
checks cover navigation/scroll/chart reset, original-form writes and immutable
forecast/history loops. Preview uses fake session plus in-memory stores only;
never attach it to production DB. PR#836 is merged at c35ce924; PR/main six
required checks and CodeQL passed, PR Sonar passed. Main external Sonar retains
the baseline failure tracked in#684. The owner personally approved production
db-init46133356546; increment0142 succeeded at2026-11-28T11:55:57Z with1 applied,
142 already recorded, ledger143. No configuration changed. The authorized
application tag v0.1.149 points exactly at c35ce924. Build46143508536 succeeded;
release/commit registry digests and c35ce924 / production identity match. The
owner personally approved application deployment46143508536, which succeeded
at2026-11-28T12:40:09Z. ACR pull digest, GHCR proof, deployment health and live
/api/health agree on v0.1.149 / c35ce924 / production. Signed-in acceptance is
pending: the acceptance tab901F4E582548D55103AA56D176A7F5FC is at the actual
Accounts login form after a normal OIDC restoration attempt. The owner has
been asked to sign in; no credentials were read and the original working tab
was preserved. See153 for current evidence; deployment is complete but live
page and business acceptance must not be marked complete before it runs.

Current correction stage (2026-11-28): the owner has signed in and rejected the
runtime's fidelity to approved V2. Local repairs stay in
/private/tmp/yucer-attainment-r1, now branch fix/attainment-stable-hydration.
Preserve all existing uncommitted recovery work. Eight views use reusable
product business components and scoped CSS with DS tokens. No further release
has been authorized for the unreviewed correction bundle. Customer attainment
contains formal outcome indicators only, not visit/execution plans. Regional
and team charts share transient hover state; click selection stays separate.
The team dashboard fills the available viewport. Personal responsibility reads
"My responsibility"; acquisition cards show new customers as the main figure
and total customers alongside. Unknown cooperation history remains unknown.
The bottom cue is an unframed, noninteractive viewport-fixed indicator, 8px
above the visible bottom (plus the device safe inset), not a page-bottom button.
Review preview: /private/tmp/yucer-attainment-parity/index.html; runtime4060.
See153 and design195 for the current corrections and actual verification.

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
