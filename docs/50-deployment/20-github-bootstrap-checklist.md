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

- [ ] `PRODUCT_CODE` repo variable = `yucer`.
- [ ] `APP_PUBLISH_PORT` = _(assigned at platform registration - see
      `10-platform-registration-checklist.md`)_.
- [ ] `production` GitHub Environment + Required reviewer (deploy pauses until
      approved). No `beta` (prod only).
- [ ] Host secrets for worker02: `DEPLOY_HOST` = `vx-worker-02` (tailnet
      MagicDNS), `DEPLOY_USER`, `DEPLOY_PORT` = `22`.
- [ ] Domain `yucer.vxture.com` created and resolving (shared edge -> worker02
      at the assigned port).
- [ ] Org-level shared credentials shared to this repo: `NODE_AUTH_TOKEN`,
      `ALIYUN_ACR_USERNAME/PASSWORD`, `TAILSCALE_OAUTH_*`; org vars
      `ALIYUN_ACR_REGISTRY/NAMESPACE`, `VXTURE_NPM_REGISTRY`,
      `TAILSCALE_OAUTH_CLIENT_TAG`.

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

### Release

- [ ] DB structure first, via `db-init.yml` (`confirm=yes` + `expected_sha`) -
      never through the deploy chain. For yucer this applies the three-part
      baseline (34 tables across 8 schemas) plus
      `incr/0001_seed_authz_catalog.sql` (the role/permission catalog seed).
- [ ] Release: `git tag v0.1.0 && git push origin v0.1.0` -> approve the pending
      `production` deployment.
