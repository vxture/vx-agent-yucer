import { cookies } from "next/headers";
import type { Entitlement } from "../../entitlement/types";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthUser } from "../../auth/lib/session";
import type { AuthUser } from "../../auth/lib/claims";
import { resolveAuthzContext, type AuthzContext } from "../../authz/context";
import { ensureDemoData } from "../../domains/shared/registry";

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
}

export async function resolveAppSession(): Promise<AppSession | null> {
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

  return { user, workspaceId, entitlement, authz };
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
