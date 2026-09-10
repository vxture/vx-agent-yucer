# GitHub bootstrap checklist - yucer

One-time GitHub setup for this product repo (`vxture/vx-agent-yucer`).
Code-external, owner action. Authority: `140-repo-governance-standard.md`
section 1 / section 6 and `product_240_repo-template.md` section 2.8.

## BEFORE the first push - regenerate the lockfile

- [ ] Run `pnpm install` on a host that has Node 22+ and a `NODE_AUTH_TOKEN` with
      `read:packages`, then commit the updated `pnpm-lock.yaml`.

`portals/app/package.json` declares `@vxture/design-system@^9.0.4`, but
`pnpm-lock.yaml` has not been regenerated for it - the lockfile entry needs the
registry-issued `integrity` hash and signed tarball URL, which cannot be
hand-written. Until this runs, `pnpm install --frozen-lockfile` fails, which
takes down **two of the five required checks** (`build` and `test-coverage`,
`.github/workflows/ci.yml`) and the Dockerfile deps stage.

## Repo bootstrap - do these now

- [ ] Create the repo PUBLIC (dev-phase repos are public; 140 section 2). A
      public repo defaults to all-rights-reserved - ship no LICENSE file and no
      `license` field (public != open source); clean any stray open-source marker.
- [ ] Enable GitHub secret scanning + push protection (repo Settings) - free and
      fully available on a public repo, and the primary defense now that there is
      no private fallback.
- [ ] ORDER MATTERS (empty repo): first-push `main` and let CI run once so the
      required checks are produced, THEN apply the ruleset. Applying a restrictive
      ruleset before the first import blocks that import.
  - [ ] `git push -u origin main` (establishes `main`, triggers first CI run).
  - [ ] Confirm the five checks appear and go green: `quality-gate` / `build` /
        `test-coverage` / `audit` / `gitleaks`.
  - [ ] Apply the ruleset:
        `gh api repos/vxture/vx-agent-yucer/rulesets --method POST --input docs/50-deployment/rebuild/main-ruleset.json`
  - [ ] Verify: `gh api repos/vxture/vx-agent-yucer/rulesets` shows a branch
        ruleset whose required checks include the five contexts.
- [ ] Provide `NODE_AUTH_TOKEN` with read access to GitHub Packages so CI can
      resolve the `@vxture` scope. This repo DOES have a published-package
      dependency (`@vxture/shared`, inherited from the template), so unlike a
      bare governance shell this step is REQUIRED for `build` / `test-coverage`
      to pass.

## Deployment (batch 4) - PROD ONLY on worker02

Deploys are **production only** on **worker02** (in the tailnet, non-VPC -> GHCR
primary + ACR fallback), stack root `/srv/md0/yucer`. The workflows
(`deploy`/`build`/`rollback`/`db-init` + the `tailnet-ssh-connect` action) are
inherited from the template and already infra-verified there. The deploy layer
reads the product code from the `PRODUCT_CODE` repo variable, falling back to the
literal the instantiate script wrote (`yucer`).

### Repo configuration

- [x] `PRODUCT_CODE` repo variable = `yucer` (verified 2026-09-10, `gh variable list`).
- [x] `APP_PUBLISH_PORT` repo variable = `4060` (the platform port registry
      assigned yucer the L3 block `4060-4069` on 2026-09-10: prod `4060`,
      beta `4061`). Rule R3 makes the code fallback, compose, Dockerfile and
      `.env.example` the same number; `5000/5001` were self-assigned before
      registration and are gone.
- [x] `production` GitHub Environment + Required reviewer (deploy pauses until
      approved). Verified 2026-09-10: one protection rule on `production`. No
      `beta` (prod only) - see "No beta lane" below before cutting a `beta-*` tag.
- [ ] Host secrets for worker02: `DEPLOY_HOST` = `vx-worker-02` (tailnet
      MagicDNS), `DEPLOY_USER`, `DEPLOY_PORT` = `22`. Verified 2026-09-10: the
      `production` environment holds `DEPLOY_HOST` and `DEPLOY_PORT` (values not
      readable from here); `DEPLOY_USER` is NOT there and must be added unless
      the org shares it.
- [ ] Domain `yucer.vxture.com` created and resolving (shared edge -> worker02
      at the assigned port). 2026-09-10: resolves to `198.18.0.5` (a benchmark
      range address, not a public edge) - confirm that is the intended tailnet
      / edge mapping before relying on it.
- [ ] Org-level shared credentials shared to this repo: `NODE_AUTH_TOKEN`,
      `ALIYUN_ACR_USERNAME/PASSWORD`, `TAILSCALE_OAUTH_*`; org vars
      `ALIYUN_ACR_REGISTRY/NAMESPACE`, `VXTURE_NPM_REGISTRY`,
      `TAILSCALE_OAUTH_CLIENT_TAG`. Not verifiable without `admin:org`; the repo
      level holds none of them, and `build.yml` fails fast on an empty
      `ALIYUN_ACR_REGISTRY` (`test -n`). An org admin checks with
      `gh api orgs/vxture/actions/variables` / `.../secrets` and the
      `selected_repositories` of each.
- [x] `ALIYUN_ACR_NAMESPACE` REPO variable = `vx-agentstudio` (owner,
      2026-09-09). A repo variable shadows the org one of the same name, and
      this product's images live in the 阿里云容器镜像服务 namespace
      `vx-agentstudio`, not the org default. It was `vx-foundation` from the
      2026-08-29 bootstrap until the owner corrected it; nothing had deployed
      in between. Verify with `gh variable list`.

### Secret values the owner must supply

- [ ] `DEPLOY_SSH_KEY` - a private key authorized on `vx-worker-02`
      (+ optional `DEPLOY_KEY_PASSPHRASE`).
- [ ] `DEPLOY_KNOWN_HOSTS` - `ssh-keyscan -p 22 vx-worker-02` from a trusted
      network (fail-closed; no TOFU).
- [ ] `ENV_FILE_BASE64` - base64 of the yucer `.env` (domain `yucer.vxture.com`,
      DB `vxturebiz_yucer_prod` / role `yucer_svc`, plus the OIDC/webhook/job
      secrets). The skeleton with every supported key is `.env.example`, produced
      by `node scripts/init/instantiate.mjs yucer` (regenerate with `--dry-run`).
- [ ] SSH `vx-worker-02` once: create `/srv/md0/yucer`, confirm GHCR/ACR login.
      2026-09-10: no `yucer-app` package exists on GHCR yet - nothing has ever
      been built, which is consistent with no deploy having run.

### Verification, 2026-09-10 (owner: 首先需要确认发布规划、目录、产品代码、主机是否符合预期)

What the workflows will do on a `v*.*.*` tag, read off `deploy.yml` /
`build.yml` / `db-init.yml` / `docker-compose.yml` rather than assumed:

| Item | Value | State |
|------|-------|-------|
| product code | `yucer` (`PRODUCT_CODE`, fallback literal) | verified |
| host | `vx-worker-02` via `tailnet-ssh-connect` (action present) | secret set, value unverified |
| directory | `/srv/md0/yucer` (`stack_root` in deploy.yml) | fixed in workflow; host bootstrap unticked |
| compose project / containers | `yucer` / `yucer-app`, `yucer-redis`, `yucer-db` | from compose |
| image | `ghcr.io/vxture/yucer-app` primary, `<ACR>/vx-agentstudio/yucer-app` fallback | namespace verified; registry var org-level, unverified |
| port | `4060:4060` (`APP_PUBLISH_PORT=4060`) | verified |
| database | `vxturebiz_yucer_prod`, role `yucer_svc`, structure via `db-init.yml` only | workflow verified; never run |
| domain | `yucer.vxture.com` | resolves to `198.18.0.5`; mapping unconfirmed |
| trigger | `v*.*.*` -> `production`, paused on the reviewer; `beta-*` -> refused | verified |

Still missing before a `v*` tag can succeed: `DEPLOY_USER`, `DEPLOY_SSH_KEY`,
`DEPLOY_KNOWN_HOSTS`, `ENV_FILE_BASE64` on the `production` environment; the
org-shared credentials and vars; the host directory; the domain mapping.

### Beta lane (wired 2026-09-10; owner: 接通 beta 通道, /srv/md1 on worker02)

Two tiers on ONE host, told apart by the compose project name and the stack
root; the same image serves both.

| | production | beta |
|---|---|---|
| tag | `v*.*.*` | `beta-*` |
| GitHub Environment | `production` (required reviewer) | `beta` (no reviewer) |
| stack root | `/srv/md0/yucer` | `/srv/md1/yucer` (second array) |
| where that is set | Environment variable `STACK_ROOT` on `production` | Environment variable `STACK_ROOT` on `beta` |
| compose project / containers | `yucer` / `yucer-app`, `-redis`, `-db`, net `yucer-net` | `yucer-beta` / `yucer-beta-app`, `-redis`, `-db`, net `yucer-beta-net` |
| published port | `4060` | `4061` (from the stack's own `etc/.env`) |
| database | `vxturebiz_yucer_prod` | `vxturebiz_yucer_beta` |
| OIDC client | `yucer` | `yucer-beta` |
| db-init / rollback | `-f environment=production` | `-f environment=beta` |

The route lives in `deploy.yml`'s detect job (tag -> environment); WHERE a
stack lives and what it is called are the Environment's own VARIABLES,
`STACK_ROOT` and `PROJECT_NAME` (owner, 2026-09-10: 目录是配置，不是写死), visible
under Settings -> Environments; the tier defaults above apply only until they
are set. `db-init.yml` and `rollback.yml` take `environment` as an input and
read the same variables. The deploy directory is always `<STACK_ROOT>/deploy`
and is rsync --delete'd on every deploy - there is no `DEPLOY_DIR` override,
because one pointed at the stack root would wipe `etc/` and `data/`. `deploy/deploy.sh` reads `PROJECT_NAME` from CI
(default: the product code) so the two stacks never share a container name,
and its health check now curls the port the container actually listens on
(`4060`; it was `3000` since the template and could never have passed).

- [x] `beta` GitHub Environment, no reviewer (created 2026-09-10 by API).
- [x] Environment variables (2026-09-10): `STACK_ROOT` = `/srv/md1/yucer` and
      `PROJECT_NAME` = `yucer-beta` on `beta`; `STACK_ROOT` = `/srv/md0/yucer` on
      `production`. `gh variable list --env <name>` shows them.
- [ ] Secrets on the `beta` Environment: `DEPLOY_HOST` = `vx-worker-02`,
      `DEPLOY_USER`, `DEPLOY_PORT` = `22`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`
      (same host as production - GitHub cannot share environment secrets, so
      they are entered twice), and `ENV_FILE_BASE64` for the BETA `.env`:
      `NEXT_PUBLIC_APP_ENV=beta`, `APP_PUBLISH_PORT=4061`,
      `POSTGRES_DB=vxturebiz_yucer_beta`, `DATABASE_URL=...@yucer-beta-db:5432/vxturebiz_yucer_beta`,
      `OIDC_CLIENT_ID=yucer-beta`, and the beta app URL - the beta DOMAIN is
      not decided in this repo; `.env.example` carries the prod one only.
- [ ] Register the `yucer-beta` OIDC client on the platform (10-platform-registration-checklist).
- [ ] SSH `vx-worker-02` once: create `/srv/md1/yucer`, confirm the array is
      mounted there and writable by `DEPLOY_USER`.
- [ ] First beta release: `git tag beta-YYYYMMDD.1 <sha> && git push origin beta-YYYYMMDD.1`
      (builds, deploys, no approval), then
      `gh workflow run db-init.yml -f environment=beta -f action=apply -f confirm=yes -f expected_sha=<sha>`
      for the structure. Order for a fresh stack: deploy first (it creates the
      db container the DDL runs in), db-init second, then the app reconnects.
- [ ] Liaison: the template (`vx-agent-vxtpl`) is prod-only; carry this route
      back to it, or the next instantiated product loses it.

### Release

- [ ] DB structure first, via `db-init.yml` (`confirm=yes` + `expected_sha`) -
      never through the deploy chain. For yucer this applies the three-part
      baseline (34 tables across 8 schemas) plus
      `incr/0001_seed_authz_catalog.sql` (the role/permission catalog seed).
- [ ] Release: `git tag v0.1.0 && git push origin v0.1.0` -> approve the pending
      `production` deployment.
