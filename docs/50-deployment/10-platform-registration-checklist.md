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

- [x] Register the OIDC client pair: `yucer` (prod) and `yucer-beta` (beta) -
      double client is canonical (back-channel logout is a single-URI hard
      constraint). Realm = customer. **`yucer` (stable) handed over
      2026-09-14** as a confidential client (secret transported separately);
      `yucer-beta` not yet handed over - the beta stack is not deployed.
- [x] Set each client's `redirect_uri`, `post_logout_redirect_uri`, and
      `back_channel_logout_uri`. **Registered for `yucer` (2026-09-14):**
      `redirect_uri` = `https://yucer.vxture.com/api/auth/oidc/callback`,
      `post_logout_redirect_uri` = `https://yucer.vxture.com/`. The handoff
      named no back-channel logout URI - the app serves it at
      `https://yucer.vxture.com/auth/backchannel-logout`; confirm it is set on
      the client or IdP-initiated logout will not reach the RP.

  The registered `redirect_uri` is NOT the contract path this checklist used to
  name (`/auth/callback`, 080-rp). The product adapted rather than asking for a
  re-registration: `app/api/auth/oidc/callback/route.ts` re-exports the
  canonical handler, both paths answer, and `OIDC_REDIRECT_URI` carries the
  registered value byte for byte (the IdP compares, it does not match). Should
  the platform later re-register to `/auth/callback`, only the env value moves;
  the alias can then be dropped.
- [x] Set allowed scopes to `openid profile email phone` (retired product-code and
      commercial scopes are not registered). Confirmed in the handoff.

## Provisioning webhook (C3)

- [x] Register the product in `product_webhooks` with its delivery address.
      **Registered (2026-09-14): `https://yucer.vxture.com/api/webhooks/vxture`**
      - the public edge, not a tailnet address; the edge proxies every path but
      `/api/usage/flush` to the app. As with the callback, the registered path
      is not the contract path (`/provisioning/webhook`, product_200 section
      4): `app/api/webhooks/vxture/route.ts` re-exports the canonical handler.
- [x] Add `YUCER_PROVISION_WEBHOOK_SECRET` to the platform env; the owner
      hand-transports the secret value to this repo's GitHub secrets.
      Transported 2026-09-14; it goes into the production stack's `.env` as
      `PROVISION_WEBHOOK_SECRET` (and into `ENV_FILE_BASE64`), never into the
      repo.

## Not in the 2026-09-14 handoff (still open)

- [ ] C2 entitlement: `PLATFORM_API_URL` (internal-network base) and
      `PLATFORM_INTERNAL_AUTH_TOKEN`. Without both the resolver stays `mock`,
      every workspace resolves to no tier, and a signed-in member sees the
      "not subscribed" lockout on every page - login alone does not make the
      product usable.
- [ ] Atlas / Runos / arda base URLs and the Atlas product-grants (separate
      planes, separate liaison).
- [ ] The `yucer-beta` client, for when the beta stack is cut.

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
