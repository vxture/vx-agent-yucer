# Platform-side registration checklist - yucer

Owner / platform-line actions taken on the PLATFORM side for this product repo.
These are code-external and are performed in the platform repo and platform
consoles, not here. Authority: `product_240_repo-template.md` section 2.8.

Concrete values below are the ones derived at instantiation
(`scripts/init/instantiate.mjs yucer`): product code `yucer`, upper `YUCER`.

## Directory and plan

- [ ] Add the product row to the platform product directory: `code` = `yucer` /
      `layer` (L1/L2/L3) / `type`.
- [ ] Seed the plan structure (subscription tiers) for the product. The five
      tiers are platform values; which yucer capability each tier unlocks is
      product knowledge and lives in `docs/20-specs/40-capability-matrix.md` -
      the platform never configures feature keys.

## OIDC (customer realm)

- [ ] Register the OIDC client pair: `yucer` (prod) and `yucer-beta` (beta) -
      double client is canonical (back-channel logout is a single-URI hard
      constraint). Realm = customer.
- [ ] Set each client's `redirect_uri` (`https://yucer.vxture.com/auth/callback`),
      `post_logout_redirect_uri`, and `back_channel_logout_uri`.
- [ ] Set allowed scopes to `openid profile email phone` (retired product-code and
      commercial scopes are not registered).

## Provisioning webhook (C3)

- [ ] Register the product in `product_webhooks` with its tailnet delivery
      address (`YUCER_WEBHOOK_BASE_URL`).
- [ ] Add `YUCER_PROVISION_WEBHOOK_SECRET` to the platform env; the owner
      hand-transports the secret value to this repo's GitHub secrets.

## Edge and ports

- [ ] Create `yucer.vxture.com` on the shared edge, pointing at the assigned
      worker host and `APP_PUBLISH_PORT`.

  **The port comes from the platform port registry, which is the only source.**
  It lives outside this repo and needs a login, so neither a coding agent nor CI
  can read it - that is deliberate, not an omission. Registry rule R1 is
  register-then-code: taking an unregistered number is forbidden even when it is
  free. Rule R3 makes the local dev fallback, the registry entry and the
  production container-internal port one number, and
  `scripts/guardrails/check-port-consistency.mjs` fails the build when this
  repo's eight carriers of that number stop agreeing. It cannot tell you whether
  the number is the REGISTERED one - only a human reading the registry can.

  yucer is an L3 industry agent, so its number comes from the `4000-5999` band.
- [ ] Record the assigned port; the vhost config in
      `configs/edge/yucer.vxture.com.conf` must match it.

## Secrets transport

- [ ] All secret values are owner-transported (never committed, never sent over
      insecure channels). Org-level shared credentials (ACR / tailscale / npm
      token) are configured once at the org and shared to this repo - not
      duplicated per repo.

## Note on batch scope

Everything above belongs to **batch 4** of this repo's plan
(`docs/70-workplan/00-index.md`). Batches 1-3 (product domain framework, domain
services, product UI) run entirely offline against the Mock resolver and need no
platform registration.
