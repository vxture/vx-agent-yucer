import { cookies } from "next/headers";
import type { Entitlement } from "../../entitlement/types";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthUser } from "../../auth/lib/session";
import type { AuthUser } from "../../auth/lib/claims";
import { resolveAuthzContext, type AuthzContext } from "../../authz/context";
import {
  ensureDemoData,
  getAccountStore,
  getPipelineStore,
  getSignalStore,
} from "../../domains/shared/registry";
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

/** Attach the scoped stores to a resolved session. */
function withStores(
  base: Omit<AppSession, "stores">,
): AppSession {
  return {
    ...base,
    stores: {
      pipeline: () => scopePipelineStore(getPipelineStore(), base.scope),
      account: () => scopeAccountStore(getAccountStore(), base.scope),
      signal: () => scopeSignalStore(getSignalStore(), base.scope),
    },
  };
}

export async function resolveAppSession(): Promise<AppSession | null> {
  // Local review only, and refused three independent ways - see dev-session.ts.
  // Placed FIRST so it is obvious that it short-circuits the real chain, rather
  // than hidden as a fallback where a reader would have to reason about when it
  // fires. It still carries a real role and a real entitlement, so both gates
  // below it evaluate normally.
  const dev = await resolveDevSession();
  if (dev) {
    ensureDemoData(dev.workspaceId);
    // The demo seed must exist before the scope is resolved: `own` reads the
    // member's book, and an empty store would resolve to seeing nothing on the
    // first render and everything on the second.
    const scope = await resolveDataScope(dev.workspaceId, dev.user.sub, getAuthzStore());
    return withStores({ ...dev, scope });
  }

  const cfg = getOidcConfig();
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  if (!rpsid) return null;

  const user = await getAuthUser(cfg, rpsid);
  if (!user) return null;

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

  const scope = await resolveDataScope(workspaceId, user.sub, getAuthzStore());
  return withStores({ user, workspaceId, entitlement, authz, scope });
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
