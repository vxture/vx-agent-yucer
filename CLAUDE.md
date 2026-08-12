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

Batch 1 (this framework) delivers the product domain STRUCTURE: the product spec
and the eight capability domains, the business-rule canon, the capability matrix,
the role/permission catalog and its seed, the five domain schemas (24 tables) with
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
3. Open a PR into `main`. Direct `git push origin main` is BLOCKED by the ruleset
   (must go through a PR, and the required checks must pass).
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
  review), require the five status checks below (strict / up-to-date with base),
  block deletion, block non-fast-forward, require linear history, squash-only.
- `production` GitHub Environment: required reviewer - every `v*.*.*` tag deploy
  pauses here until approved.
- `beta` GitHub Environment: no reviewer gate.

**Required checks (authoritative set of five):** `quality-gate` / `build` /
`test-coverage` / `audit` / `gitleaks`. CI job names must produce exactly these
five contexts - renaming a job breaks branch protection. A skeleton repo with no
unit tests still provides a permanently-green `test-coverage` job (it occupies the
context; zero tests passes). Never remove a check from the required set.

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

The tag-to-env deploy workflows (`deploy.yml`/`build.yml`/`rollback.yml`/
`db-init.yml`) and the `tailnet-ssh-connect` composite action are batch E and are
not present in batch 1.

## Secret hygiene (four layers)

Credentials never enter the repo - only environment/config injection. Leaks are
revoked at the source console, not scrubbed from history. Dev-phase repos are
PUBLIC (no private fallback), so "credentials never committed" is an absolute
rule, not a posture backed by a private boundary.

1. GitHub secret scanning + push protection (repo setting) - blocks on push. On a
   public repo these are free and fully enabled (a private repo would need GHAS),
   so this layer is actually stronger here.
2. `gitleaks` CI (`.github/workflows/secret-scan.yml`) - CI layer 2.
3. Local `.husky/pre-commit` - wire once per clone with
   `git config core.hooksPath .husky` (and install gitleaks locally, e.g.
   `scoop install gitleaks`). Missing binary warns and passes, never blocks.
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
| product definition | eight capability domains D1-D8, split by object ownership | `docs/20-specs/20-capability-domains.md`, ADR-001 |
| domain schemas | five: `yucer_core` / `yucer_gtm` / `yucer_pipeline` / `yucer_delivery` / `yucer_agent` (24 tables) | `docs/30-design/data_yucer_200_domain-schemas.md`, ADR-002 |
| capability matrix | 19 feature keys across five tiers, cumulative | `portals/app/app/entitlement/capability.ts`, `docs/20-specs/40-capability-matrix.md` |
| role/permission catalog | 19 permissions, 7 roles, 67 grants | `deploy/database/ddl/incr/0001_seed_authz_catalog.sql`, `docs/20-specs/50-role-permission-catalog.md` |
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

## Repository hygiene

- Keep the working tree clean; do not commit local runtime artifacts (`.env`,
  generated data, certs, caches) - they are git-ignored on purpose.
- After a merge, prune stale remotes: `git fetch --prune`.
- Squash merges make `git branch -d` report merged branches as "not fully merged";
  use `-D` after confirming the PR is MERGED via `gh pr view`.
- Keep source, config, and root meta files (`.gitignore`, `.editorconfig`,
  `.gitattributes`, `.npmrc`, `.gitleaks.toml`, `CLAUDE.md`, `README.md`)
  ASCII-only - no em-dashes, smart quotes, or non-ASCII characters.
