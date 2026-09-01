# yucer Repository Standards

Authoritative working agreement for this repo. The goal is a clean, predictable
branch and deploy flow with no direct human writes to protected branches, on top
of the governance base this repo inherits unchanged from `vxture-template`.

This is a Vxture PRODUCT repo: yucer, an enterprise sales super-agent (see
`README.md` and `docs/20-specs/`). It was instantiated from the template with
`scripts/init/instantiate.mjs yucer`, so the governance base, the platform
integration contract surface, and the engineering shell arrived unchanged, and
the product domain fills what the template left blank.

**Package manager: pnpm** (whole-stack, owner-decided 2026-07-20). CI cache keys,
the Dockerfile deps stage, and the osv `--lockfile=pnpm-lock.yaml` path are all
pnpm. Do not reintroduce npm workspaces.

Authority for the design lives in the platform repo (`D:\MyWebSite\vxture`), not
here: `140-repo-governance-standard.md` (WHAT), `product_240_repo-template.md`
(template design), `20-self-rectify-runbook.md` (HOW + machine checks),
`070-docs-taxonomy.md` (docs numbering). When a gap is not covered by an existing
standard, fix the standard in the platform repo first, then mirror it here - do
not invent a standard inside a product repo.

## Instantiated names (the cascade, already consumed)

The product code `yucer` was applied once and every downstream name is derived
from it. These are now literals in the repo, not placeholders - do not "re-run"
instantiation:

| Thing | Value |
|-------|-------|
| OIDC clients | `yucer` / `yucer-beta` |
| compose project / containers | `yucer-app` / `yucer-redis` / `yucer-db` |
| image | `yucer-app` |
| database | `vxturebiz_yucer_<env>` (env = beta \| prod) |
| service role | `yucer_svc` |
| package scope | `@yucer/*` |
| secrets | `YUCER_DB_SVC_PASSWORD`, `YUCER_PROVISION_WEBHOOK_SECRET`, `YUCER_WEBHOOK_BASE_URL` |
| domain | `yucer.vxture.com` |

`scripts/init/instantiate.mjs` is retained for reference and for regenerating the
`.env.example` skeleton (`--dry-run`), not for re-running against this repo.

## Build status (batches)

This repository is built incrementally; each batch is one PR with machine-checked
acceptance (`docs/70-workplan/`).

Inherited from the template and NOT rebuilt here: the governance shell, the
platform integration layer (C1 OIDC RP / C2 entitlement / C3 provisioning and
usage), the business-face contract schemas, and the tag-to-env deploy pipeline.

Batch 1 (this framework) delivered the product domain STRUCTURE: the product spec
and the capability partitions, the business-rule canon, the capability matrix,
the role/permission catalog and its seed, the domain schemas with
service-role grants and column locks, the Prisma lockstep mirror, and the domain
design docs plus three ADRs. It does NOT include domain services (batch 2) or any
product UI (batch 3) - both are explicit blank slots.

## Branch model

Single long-lived branch: `main` (trunk-based). Deploys are NOT tied to merges -
they are triggered only by pushing a release tag, which also selects the
environment (product repos default to two tiers):

- `main` - the only integration branch. All feature work merges here via PR.
  Merging to `main` does NOT deploy anything by itself.
- `beta-YYYYMMDD.N` tag - deploys the beta stack. No approval gate.
- `vX.Y.Z` tag - deploys the production stack. Gated by a required reviewer on
  the `production` GitHub Environment - the deploy job pauses until approved.

`dev-*` and `varda-*` tags are platform-repo-only; product repos do not build
develop/varda environments.

Always branch off `origin/main`, never off a stale local branch.

## How to make a change (the only path)

1. `git fetch origin && git switch -c <feature> origin/main`
2. Commit work on the feature branch.
3. Open a PR into `main`. Direct `git push origin main` is REFUSED by the ruleset
   for anyone without bypass (must go through a PR, and the required checks must
   pass). A repository admin is a bypass actor and is only WARNED - see the
   admin-bypass note under branch protection. Admin or not, the PR path is the
   only sanctioned one.
4. CI runs on the PR. Squash-merge once green; the branch is auto-deleted on
   merge. This does not deploy anything.
5. When ready to release, cut a tag from the commit you want deployed and push it.

Squash merge only (merge commits and rebase merges are disabled) to keep a linear
history.

### Bootstrap order (empty repo)

The branch-protection ruleset is applied LAST, not first: `git init` -> establish
`main` -> first-push `main` and let CI produce the required checks once -> THEN
apply `main-ruleset.json`. Applying a restrictive ruleset before the first code
import would block that import.

## Branch protection (GitHub Rulesets, not legacy protection)

Enforced via repo Rulesets (`gh api repos/vxture/<repo>/rulesets`). Legacy
`branches/*/protection` returns 404 - do not look there. The authoritative
ruleset is `docs/50-deployment/rebuild/main-ruleset.json`:

- `main` (single ruleset): require PR (0 approvals - checks gate merges, not human
  review), require the six status checks below (strict / up-to-date with base),
  block deletion, block non-fast-forward, require linear history, squash-only.
- `production` GitHub Environment: required reviewer - every `v*.*.*` tag deploy
  pauses here until approved.
- `beta` GitHub Environment: no reviewer gate.

**Admin bypass - what "protected" actually means here.** The ruleset carries
`bypass_actors: [{ actor_id: 5 (RepositoryRole = admin), bypass_mode: always }]`.
For a repository admin the rules are EVALUATED AND REPORTED but not enforced: a
direct push to `main` prints

```
remote: Bypassed rule violations for refs/heads/main:
remote: - Changes must be made through a pull request.
remote: - 5 of 5 required status checks are expected.
```

and then succeeds. This is deliberate - it is the escape hatch for repairing a
wedged trunk - but it means "direct push is blocked" is only true for
non-admins. Do not read a green ruleset as proof that nothing can reach `main`
outside a PR; verify with `gh api repos/<org>/<repo>/rules/branches/main`, which
reports the rules in effect, and remember who you are authenticated as.

**Setting up protection: the default branch is a trap.** The ruleset targets
`~DEFAULT_BRANCH`, not the literal name `main`. Pushing any branch into an EMPTY
repository makes that branch the default, so a first push of a feature branch
silently points the whole ruleset at it and leaves `main` unprotected. Confirm
`gh api repos/<org>/<repo> --jq .default_branch` returns `main` before and after
applying the ruleset.

**Required checks (authoritative set of six):** `quality-gate` / `build` /
`test-coverage` / `audit` / `gitleaks` / `db-contract`. CI job names must produce
exactly these six contexts - renaming a job breaks branch protection. A skeleton
repo with no unit tests still provides a permanently-green `test-coverage` job (it
occupies the context; zero tests passes). Never remove a check from the required
set.

`db-contract` joined on 2026-09-01 (owner decision - adding a required check
edits the ruleset). It is the only check that proves anything about the DATABASE:
a UNIQUE index, a CHECK, a REVOKE and a NULL comparison are properties of
Postgres and of nothing else, so every defect living there was invisible to a
fully green TypeScript suite - including one where a constraint the design leans
on did not hold at all. It runs the real DDL in `db-init.yml`'s own order against
`postgres:18` and then the `*.db.test.ts` files. It carries no `if:` and no path
filter, which is what makes it safe to require: a required check that does not
always run leaves every PR pending forever.

## CI/CD pipeline

`ci.yml` triggers on PRs to `main` and on `push:main` (the squash commit that
lands on main is a new SHA, so it gets its own gate run); it does NOT deploy.

- `quality-gate` aggregates the static checks: `git diff --check` and the docs
  numbering guardrail (`node scripts/guardrails/check-docs-numbering.mjs --strict`).
- `build`: type-check and production build. In the skeleton (no app yet) this is a
  placeholder step (`echo "skeleton: no app yet"`); batch 2 replaces it with a
  real build. Also its own required check.
- `test-coverage`: permanently-green no-op in the skeleton; occupies the required
  context until real tests exist.
- `audit` (separate required check): `osv-scanner` (pinned binary) scans
  `pnpm-lock.yaml` for known dependency vulnerabilities, hard-blocking on any new
  finding, with `--config .osv-scanner.toml`. Exceptions are recorded per
  package-version in `.osv-scanner.toml` with a reason - never suppressed by
  removing the check.
- `gitleaks` (separate required check, `.github/workflows/secret-scan.yml`):
  pinned gitleaks binary, full-history `detect`, rules in `.gitleaks.toml`.

None of these run on a tag push - cutting a release tag ships whatever is already
at that commit on `main`, it does not re-verify the gates.

`sca-watch.yml` is separate and is NOT a required check. Daily cron plus manual
dispatch, osv-scanner against `main` as it already stands, filing the result as
an ISSUE and closing it again when the trunk comes back clean. It exists because
`audit` triggers on change and therefore cannot see an advisory published against
an unchanged lockfile - see the SCA section. Its job is deliberately not named
`audit`; `check-sca-consistency.mjs` enforces that and the pin lockstep.

The tag-to-env deploy workflows (`deploy.yml`/`build.yml`/`rollback.yml`/
`db-init.yml`) and the `tailnet-ssh-connect` composite action are batch E and are
not present in batch 1.

## Secret hygiene (four layers)

Credentials never enter the repo - only environment/config injection. Leaks are
revoked at the source console, not scrubbed from history. Dev-phase repos are
PUBLIC (no private fallback), so "credentials never committed" is an absolute
rule, not a posture backed by a private boundary.

1. GitHub secret scanning + push protection (repo setting) - blocks at the push,
   before CI. On a public repo these are FREE, which is not the same as ON. This
   paragraph used to assert they were "fully enabled" and they were not: on
   2026-08-29 the API answered `404 Secret scanning is disabled on this
   repository`, so layer 1 had never existed. Enabled that day. Free means
   available at no cost; a repo setting still has to be turned on, and a document
   asserting a setting it never queried is worse than one that says nothing.
   Verify, do not assume:
   `gh api repos/vxture/<repo> --jq .security_and_analysis`
   (`secret_scanning_validity_checks` did not take from the repo-level PATCH -
   it appears to need enabling at the org level first, and is still off.)
2. `gitleaks` CI (`.github/workflows/secret-scan.yml`) - CI layer 2. This one has
   always run; it is a required check.
3. Local `.husky/pre-commit` - wire once per clone with
   `git config core.hooksPath .husky` (and install gitleaks locally, e.g.
   `brew install gitleaks` on macOS, `scoop install gitleaks` on Windows).
   TWO SEPARATE THINGS CAN BE MISSING AND NEITHER SAYS SO. An unwired
   `core.hooksPath` means the hook never runs; a wired hook with no gitleaks
   binary warns and passes, never blocks - by design, so a fresh clone is not
   bricked, which also means a developer who never installed it gets a silent
   pass forever. Both were true of the primary macOS clone on 2026-08-29.
   Check both: `git config core.hooksPath` and `command -v gitleaks`.
4. Public posture, all-rights-reserved. A public repo defaults to
   all-rights-reserved; ship NO LICENSE file and NO `license` field / `@license`
   marker - a stray open-source marker would actually grant rights (public != open
   source). `package.json` keeps `"private": true` as an npm-publish guard, which
   is unrelated to GitHub repo visibility.

Shared credentials (ACR, tailscale, npm token) are org-level: configured once and
shared to selected repos, not duplicated per repo.

## Dependency security (SCA)

`audit` = osv-scanner hard gate over `pnpm-lock.yaml`. Fix (upgrade / pnpm
override / exact pin for peer-only deps) or record a named `[[PackageOverrides]]`
exception with a reason - never widen the gate (no `continue-on-error`, never
removed from required). The template ships an empty ignore baseline; do not copy
another repo's named ignores.

**Three mechanisms, and each covers a case the others cannot.** Losing one is not
a reduction in redundancy, it is a blind spot:

| Mechanism | Answers | Blind to |
|-----------|---------|----------|
| `audit` in `ci.yml` | does THIS CHANGE bring a hole in | anything on an idle trunk |
| `sca-watch.yml` | is there a hole in what is ALREADY there | nothing lockfile-shaped, but it only reports - it cannot fix |
| Dependabot npm | is there a NEWER version, with a PR to take it | needs `registries:` to work at all |

This repo lost ten days to having only the first one running (TD-012): a high
advisory landed 98 minutes after the last push to a then-idle `main`. The gate
had not missed it. The gate had never run again.

**Dependabot's npm half needs `registries:` or it does nothing, silently.**
`@vxture/*` comes from `npm.pkg.github.com` and Dependabot holds no credential for
it unless `.github/dependabot.yml` names one. Version detection still succeeds,
so the job looks like it worked; it dies at the next step, where
`pnpm update --lockfile-only` re-resolves the whole workspace and gets
`ERR_PNPM_FETCH_401`. Two traps:

1. **`ignore: '@vxture/*'` does not avoid it.** Ignore governs what gets
   PROPOSED; the resolver governs what must be FETCHED.
2. **Dependabot secrets are a different namespace from Actions secrets.** The
   `NODE_AUTH_TOKEN` CI uses is invisible to Dependabot. `VXTURE_PACKAGES_READ_TOKEN`
   goes under Settings -> Secrets -> Dependabot, and must be a CLASSIC PAT - the
   GitHub Packages npm registry does not accept fine-grained tokens.

The symptom is not an error. It is `github-actions` producing PRs while `npm`
produces none, forever.

## Docs taxonomy

`docs/` follows the org docs taxonomy (`070-docs-taxonomy.md`): top-level decades
`00-meta` / `10-standards` / `20-specs` / `30-design` / `40-implementation` /
`50-deployment` / `60-operations` / `70-workplan` / `80-liaison` / `90-memory`;
map in `docs/00-meta/00-index.md`. Numbered = formal, unnumbered = temporary
(delete or number it), enforced by the docs numbering guardrail. Domain documents
use the strict underscore family `{kind}_{domain}_{NNN}_{slug}` (`kind` in
data/design/ops) - the template's `check-docs-numbering.mjs` is tightened from the
platform version and does NOT accept the arda hyphen variant. ADRs live in
`docs/30-design/decisions/` with stable append-only IDs; the tech-debt register
lives in `docs/60-operations/` (`TD-NNN`).

## Rigid zone / blank zone

**Rigid (do not deviate):** the entire governance base; CI/CD key names, job
names, workflow semantics; the three-channel module endpoints/signing/idempotency/
gating formula/cache discipline; value-domain consumption; DB governance (DDL
three-part + column locks + db-init as the sole structure-change path); docs
numbering; the data-face hard constraints.

**Blank (each product decides, template gives an empty slot only):** domain pages
and components; the N product domain schemas (naming/count product-decided; the
`vx_provision` / `local_authz` / `local_usage` names are reserved); role/permission
catalog values; the content of the capability matrix and billing model (format is
reference only); `20-specs/` product definition; domain guardrails.

### How yucer filled the blank zone (batch 1)

Filled - these are now decided, and changing them is a product decision with an
ADR, not a free edit:

| Slot | yucer's fill | Authority |
|------|--------------|-----------|
| product definition | NINE capability partitions D1-D9, split by object ownership | `docs/20-specs/20-capability-domains.md`, ADR-001, ADR-017 |
| domain schemas | seven product schemas, 44 tables total across ten | `docs/30-design/data_yucer_200_domain-schemas.md`, ADR-002, ADR-006, ADR-014 |
| capability matrix | 19 feature keys across five tiers, cumulative. **FROZEN at 19** (owner, 2026-08-26) | `portals/app/app/entitlement/capability.ts`, `docs/20-specs/40-capability-matrix.md` |
| role/permission catalog | 24 permissions, 7 roles, 84 grants | `deploy/database/ddl/incr/*.sql`, `docs/20-specs/50-role-permission-catalog.md` |
| domain guardrails | append-only tables, frozen attribution keys, agent proposals immutable | `deploy/database/ddl/98_column_locks.sql`, ADR-003 |

Still blank (batches 2-3): domain pages and components, the permission-gate module
(`authz/`), and the domain rule functions (`domains/<d>/lib/`).

### Product domain rules that are now rigid here

These are yucer's own hard constraints. They are enforced at the database level,
so violating them fails at runtime rather than at review:

- One object, one owning domain. Other domains reference it read-only.
- Attribution keys (`lead.signal_id`, `lead.campaign_id`,
  `opportunity.campaign_id`, `opportunity.account_id`, and every evidence column
  on `signal`) are immutable after creation. Fixing attribution is a data
  correction through `db-init`, never an application write.
- Append-only tables (`account_relation`, `opportunity_stage_event`,
  `forecast_snapshot`, `agent_message`) have no UPDATE grant at all. A correction
  is a new row.
- The copilot proposes, a human decides. `agent_action.payload` / `rationale` /
  `confidence` are immutable; `accepted` requires `decided_by_sub`. See ADR-003.
- Both gates always apply, entitlement first then permission. Never widen the
  gating formula locally (UI `tier != null`, data `tier != null || bundled`).
- Adding a writable domain column REQUIRES updating `98_column_locks.sql`, or the
  service-role write fails with permission denied. That failure is the design.
- Product UI is built from `@vxture/design-system` (^9.0.4) only. Do not hand-roll
  components, copy DS source into the repo, or fork it locally to tweak styling.
  A missing element is a request to the DS, not a local build; if a stopgap is
  genuinely unavoidable, register it as a TD entry (missing element, stopgap
  location, recovery condition) - silent deviation fails self-rectify acceptance.
  The only sanctioned local wrapper is a thin one that binds a DS element to this
  product's domain semantics; it must not restyle the DS. Theme and design tokens
  come from the DS - `@yucer/shared`'s `brand.ts` carries product identity only,
  never colours, spacing, or type.
- `@vxture/design-ui` is declared at an EXACT version matching the umbrella's own
  pin (`"6.0.4"`, no caret). It has to be declared at all because components here
  import it directly and pnpm does not resolve phantom dependencies; it has to be
  exact because a caret range lets the two diverge silently. Verified 2026-08-26:
  design-system 9.0.4 pins design-ui 6.0.4 while our `^6.0.0` stayed on 6.0.0,
  putting TWO design-ui copies in one tree - two `Button`s and two Popover /
  Tooltip / Fullscreen React contexts, with no error. When the umbrella moves,
  move this pin in the same commit.

## Product vocabulary (2026-08-26)

Three words that look interchangeable and are not. Getting them wrong in a
document is how the eight-vs-five confusion started.

| Word | Chinese | Count | What it is |
|------|---------|-------|------------|
| capability PARTITION | neng-li fen-qu | 9, D1-D9 | object ownership. The namespace both catalogs prefix with. Renamed from the older "capability domain" wording on 2026-08-26 - see ADR-001's rename note |
| functional DOMAIN | gong-neng yu | 5 | a grouping of ROUTES for navigation only. Owns no data, appears in no key, gates nothing |
| PLANE | mian | - | a platform surface: Atlas is the model plane, Runos the capability plane (ADR-004). Never use this word for a partition |

The Chinese word for "capability plane" is Runos's and cannot be reused; the
Chinese word for "domain" now belongs to the five functional ones. When adding a
classifying concept, CHECK THE WORD IS NOT ALREADY TAKEN before writing it down -
the vocabulary needs a uniqueness constraint the same way the data model does.
Two collisions were caught this way on 2026-08-26; the second was one edit from
being applied.

## Two gates, and what may not be added

- FEATURE KEYS ARE FROZEN AT 19 (owner, 2026-08-26). They are the complete
  commercial surface. A new capability that is not separately sellable does not
  get a key - it gets `feature: null` and lives behind a permission. ADR-017 (the
  catalogue) and ADR-018 (the evidence plane) are both worked examples.
- PERMISSIONS ARE NOT FROZEN. "Who inside a workspace may do this" is a product
  design question and the answer grows with the product. Both recent increments
  were permission-side: `catalog.price` (the floor price decides which discounts
  need a signature) and `account.record` (recording what happened is not editing
  the customer master record).
- Changing either one means changing THREE things together: the seed increment,
  the TS mirror, and `docs/20-specs/50-role-permission-catalog.md`. The mirror
  tests parse the seed and fail on any drift, in both directions.

## Two guards worth knowing before you write code

- `domains/shared/wired.test.ts` - EVERY exported domain verb must have a caller
  outside its own domain. This repo shipped the same defect five times: a
  service with a full gate, rule function, port and green tests that no
  interface ever called. An unwired verb is allowed, but it has to be NAMED in
  KNOWN_UNWIRED with the reason and the batch that removes it. That turns "we
  forgot" into "we decided, and here is when it ends".
- `domains/shared/column-locks.test.ts` - the mirror tests prove mirror == DDL,
  which is NOT the same as DDL == the schema. A grant naming a column that does
  not exist passed both directions on 2026-08-26 and would have killed db-init
  at deploy time, so a third reference point was added: the CREATE TABLE
  statements. Two mirrors agreeing says nothing about whether either is true.

## Violation messages are keys, not copy

A `RuleResult` violation carries a `message` written for the rule layer's own
reader, in English. Server actions return `violations[0].code`; the sentence
lives in the message dictionary (`*_ERROR` maps). Passing the message straight
to the interface is TD-010 and it has recurred in new code twice - most recently
rendering "a floor above list price would make every sale need approval" inside
a Chinese page.

## Repository hygiene

- Keep the working tree clean; do not commit local runtime artifacts (`.env`,
  generated data, certs, caches) - they are git-ignored on purpose.
- After a merge, prune stale remotes: `git fetch --prune`.
- Squash merges make `git branch -d` report merged branches as "not fully merged";
  use `-D` after confirming the PR is MERGED via `gh pr view`.
- Keep source, config, and root meta files (`.gitignore`, `.editorconfig`,
  `.gitattributes`, `.npmrc`, `.gitleaks.toml`, `CLAUDE.md`, `README.md`)
  ASCII-only - no em-dashes, smart quotes, or non-ASCII characters.
