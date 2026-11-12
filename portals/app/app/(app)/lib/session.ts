import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { Entitlement } from "../../entitlement/types";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthSession } from "../../auth/lib/session";
import type { AuthUser } from "../../auth/lib/claims";
import { resolveAuthzContext, type AuthzContext } from "../../authz/context";
import {
  ensureDemoData,
  getAccountStore,
  getPipelineStore,
  getPlanningStore,
  getSignalStore,
} from "../../domains/shared/registry";
import { applyStartupPreset, ensureSalesTerritories } from "./startup-preset";
import { getAuthzStore } from "../../authz/store";
import type { DataScope } from "../../authz/scope";
import {
  scopeAccountStore,
  scopePipelineStore,
  scopeSignalStore,
} from "../../authz/scoped-stores";
import type { AccountStore } from "../../domains/account/store";
import type { PipelineStore } from "../../domains/pipeline/store";
import type { SignalStore } from "../../domains/signal/store";
import { resolveDataScope } from "./resolve-scope";
import { resolveDevSession } from "./dev-session";
import { DEFAULT_DIVISION_CARVE_KEY } from "../../domains/account/service";

// Per-request resolution of everything a product surface needs, in the order
// design_yucer_100 section 5 mandates:
//
//   session (C1) -> entitlement (C2) -> permission (local_authz)
//
// SERVER-ONLY. Reaches cookies, Redis and the database.
//
// Every failure returns null rather than throwing or substituting a default. A
// page with no session must render a sign-in prompt, and a page whose token
// carries no active workspace must not guess one - workspace_id is the
// authoritative isolation key and inventing it is the worst available bug.

export interface AppSession {
  user: AuthUser;
  workspaceId: string;
  entitlement: Entitlement;
  authz: AuthzContext;
  /**
   * The member's own access token, for OBO S2S calls (platform/s2s.ts) -
   * server-only, never serialize it into a client component prop or a JSON
   * response. FETCHED ON DEMAND (auth/lib/login-state.ts): knowing who is here
   * never needs a token, so a page that makes no platform call never touches
   * one. Resolves to null on the dev-session bypass (no real OIDC token exists
   * there) or when no token can be had right now; a caller with no subject
   * token falls back to service mode, same as a background job - and the
   * member stays signed in either way.
   */
  accessToken: () => Promise<string | null>;
  /**
   * Which rows this member may see, resolved once for the request.
   *
   * `workspace` for everyone until an administrator narrows them, and at that
   * value nothing is wrapped and nothing costs anything.
   */
  scope: DataScope;
  /**
   * The three owner-bearing stores, ALREADY SCOPED.
   *
   * THE POINT OF PUTTING THEM HERE is that a surface cannot get an unscoped one
   * by accident. `getPipelineStore()` still exists - the resolver itself needs
   * it, and so does every domain-internal caller - but a page reaching for it
   * would be reaching past the scope, so scoped-acquisition.test.ts refuses the
   * raw getters anywhere under (app). The stores a page can reach are the ones
   * on the session.
   *
   * Functions rather than values so the wrapping is paid only by a surface that
   * actually reads that domain.
   */
  stores: {
    pipeline(): PipelineStore;
    account(): AccountStore;
    signal(): SignalStore;
  };
}

/**
 * A new real workspace gets the shared organization/market/territory preset.
 * Existing workspaces keep their organization and current market carve. If
 * an earlier partial initialization left their automatic territory roster
 * incomplete, repair only that roster through the gated domain services.
 * Never reapply the destructive org template to an existing organization.
 * Geographic scope mirrors are independent of custom team territories.
 * The development/demo branch below bypasses this real-workspace initializer.
 */
async function ensureStartupPreset(workspaceId: string, sub: string, authz: AuthzContext, entitlement: Entitlement) {
  const planningStore = getPlanningStore();
  const planningCtx = { workspaceId, sub, holder: authz, entitlement, store: planningStore };
  const accountCtx = { workspaceId, sub, holder: authz, entitlement, store: getAccountStore() };
  if ((await planningStore.listOrgKinds(workspaceId)).length > 0) {
    await ensureSalesTerritories(planningCtx, accountCtx);
    return;
  }
  await applyStartupPreset(planningCtx, accountCtx, {
    orgKey: "national_medium",
    divisionKey: DEFAULT_DIVISION_CARVE_KEY,
    autoAssociate: true,
  });
}

/** Attach the scoped stores to a resolved session. */
function withStores(
  base: Omit<AppSession, "stores">,
): AppSession {
  return {
    ...base,
    stores: {
      pipeline: () => scopePipelineStore(getPipelineStore(), base.scope, base.user.sub),
      account: () => scopeAccountStore(getAccountStore(), base.scope),
      signal: () => scopeSignalStore(getSignalStore(), base.scope),
    },
  };
}

/**
 * ONE RESOLUTION PER RENDER. The layout, the page and the @deck slot all ask;
 * React's cache() makes them share a single answer, so a render reads the
 * login state once instead of three times. (Server actions are their own
 * request and resolve once each.)
 */
export const resolveAppSession = cache(resolveAppSessionUncached);

/**
 * A request the member made - as opposed to Next prefetching a link they
 * have not clicked. Only the former may ask accounts and so renew the login
 * (auth/lib/login-state.ts: asked on activity only).
 */
async function isMemberActivity(): Promise<boolean> {
  const h = await headers();
  return !(h.has("next-router-prefetch") || h.get("purpose") === "prefetch" || h.get("sec-purpose")?.includes("prefetch"));
}

async function resolveAppSessionUncached(): Promise<AppSession | null> {
  // Local review only, and refused three independent ways - see dev-session.ts.
  // Placed FIRST so it is obvious that it short-circuits the real chain, rather
  // than hidden as a fallback where a reader would have to reason about when it
  // fires. It still carries a real role and a real entitlement, so both gates
  // below it evaluate normally.
  const dev = await resolveDevSession();
  if (dev) {
    ensureDemoData(dev.workspaceId);
    await ensureSalesTerritories(
      { workspaceId: dev.workspaceId, sub: dev.user.sub, holder: dev.authz, entitlement: dev.entitlement, store: getPlanningStore() },
      { workspaceId: dev.workspaceId, sub: dev.user.sub, holder: dev.authz, entitlement: dev.entitlement, store: getAccountStore() },
    );
    // The demo seed must exist before the scope is resolved: `own` reads the
    // member's book, and an empty store would resolve to seeing nothing on the
    // first render and everything on the second.
    const scope = await resolveDataScope(dev.workspaceId, dev.user.sub, getAuthzStore());
    // No real OIDC token on this bypass; OBO callers fall back to service mode.
    return withStores({ ...dev, scope, accessToken: async () => null });
  }

  const cfg = getOidcConfig();
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  if (!rpsid) return null;

  const authSession = await getAuthSession(cfg, rpsid, { activity: await isMemberActivity() });
  if (!authSession) return null;
  const { user, accessToken } = authSession;

  // No active workspace means no isolation key, which means no product surface.
  const workspaceId = user.activeWorkspace;
  if (!workspaceId) return null;

  // Entitlement and membership resolve independently; both are needed before a
  // single gate can be evaluated, so they run together rather than in series.
  const [entitlement, authz] = await Promise.all([
    getEntitlementResolver().resolve(workspaceId),
    resolveAuthzContext(user),
  ]);
  if (!authz) return null;

  // Offline demo path only. No-op unless YUCER_DEMO_DATA is explicitly "on" AND
  // there is no DATABASE_URL; see ensureDemoData for why it is guarded twice.
  ensureDemoData(workspaceId);

  // REAL WORKSPACES ONLY - never the `dev` branch above. `demo-members.ts`'s
  // DEMO_PLACEMENTS hardcodes bare unit codes ("east") matching the STATIC
  // default template; this 5-region preset generates prefixed ones
  // ("headquarters_east", `planning/lib/org.ts`'s `regionUnits`) and
  // `applyOrgTemplate` is destructive (wipes existing units first) - running
  // it against the dev-session workspace would rebuild the demo org tree
  // with codes `seedDemoPlacements()` can no longer find. See
  // `ensureStartupPreset`'s own comment for the rest of the reasoning.
  await ensureStartupPreset(workspaceId, user.sub, authz, entitlement);

  const scope = await resolveDataScope(workspaceId, user.sub, getAuthzStore());
  return withStores({ user, workspaceId, entitlement, authz, scope, accessToken });
}

/**
 * The tenant id for the agent planes.
 *
 * Atlas hard-fails a call with no tenant, and both planes meter against the
 * tenant x workspace pair. The platform issues it as `active_org` on the token.
 */
export function tenantIdOf(session: AppSession): string | null {
  return session.user.activeOrg;
}
