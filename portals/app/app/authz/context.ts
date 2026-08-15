// Request-scoped authorization context: resolve who the member is inside the
// active workspace and what they may do.
//
// This is the only place that knows how the four layers of design_yucer_100
// section 5 connect:
//   session (auth/) -> entitlement (entitlement/) -> permission (authz/) -> rules
// Domain code takes an AuthzContext and never reaches back into the session.
//
// SERVER-ONLY. Resolving a member reads the database, so this module pulls in
// the Prisma adapter and the pg driver. A client component that needs a gate
// decision imports authz/decide.ts instead, which has neither - see the note at
// the top of that file for what happens if the two are conflated.

import type { AuthUser } from "../auth/lib/claims";
import { OWNER_BOOTSTRAP_ROLE, type PermCode, type RoleCode } from "./catalog";
import { getAuthzStore, type AuthzStore } from "./store";

// Re-exported so a server caller holding a context keeps one import site. The
// implementations live in decide.ts precisely so they are reachable without this
// module's database dependencies.
export { can, decisionsFor, type PermissionHolder } from "./decide";

export interface AuthzContext {
  workspaceId: string;
  sub: string;
  roles: RoleCode[];
  permissions: ReadonlySet<PermCode>;
  /** Platform workspace:owner - the first-login super-admin baseline. */
  isWorkspaceOwner: boolean;
}

// Short TTL, mirroring the entitlement resolver's 45s. Role changes are rare and
// administrative; paying a three-query join on every gate check is not worth
// making them instantaneous. invalidate() is called on grant/revoke so an
// administrator sees their own change immediately.
const TTL_MS = 45_000;

interface Entry {
  value: AuthzContext;
  expiresAt: number;
}

const cache = new Map<string, Entry>();

function cacheKey(workspaceId: string, sub: string): string {
  return `${workspaceId} ${sub}`;
}

export function invalidateAuthz(workspaceId: string, sub?: string): void {
  if (sub) {
    cache.delete(cacheKey(workspaceId, sub));
    return;
  }
  for (const k of [...cache.keys()]) {
    if (k.startsWith(`${workspaceId} `)) cache.delete(k);
  }
}

/** Tests and the offline path: drop everything. */
export function resetAuthzCache(): void {
  cache.clear();
}

/**
 * Resolve the member for the active workspace, creating the local_authz row on
 * first sighting and applying the workspace-owner bootstrap exactly once.
 *
 * Returns null when the token carries no active workspace: there is no such
 * thing as a permission outside a workspace, and defaulting to "some workspace"
 * would be inventing an isolation key, which the data-boundary rule forbids.
 */
export async function resolveAuthzContext(
  user: AuthUser,
  store: AuthzStore = getAuthzStore(),
): Promise<AuthzContext | null> {
  const workspaceId = user.activeWorkspace;
  if (!workspaceId) return null;

  const k = cacheKey(workspaceId, user.sub);
  const now = Date.now();
  const hit = cache.get(k);
  if (hit && hit.expiresAt > now) return hit.value;

  const { created } = await store.seeMember({ workspaceId, sub: user.sub });

  // Bootstrap runs on the FIRST sighting only. Re-applying it on every login
  // would resurrect a role an administrator deliberately revoked, and the
  // catalog doc is explicit that this is an initialization default, not a
  // standing mirror of the platform governance role.
  if (created && user.isWorkspaceOwner) {
    await store.grantRole(workspaceId, user.sub, OWNER_BOOTSTRAP_ROLE);
  }

  const [roles, permissions] = await Promise.all([
    store.rolesOf(workspaceId, user.sub),
    store.permissionsOf(workspaceId, user.sub),
  ]);

  const value: AuthzContext = {
    workspaceId,
    sub: user.sub,
    roles,
    permissions: new Set(permissions),
    isWorkspaceOwner: user.isWorkspaceOwner,
  };
  cache.set(k, { value, expiresAt: now + TTL_MS });
  return value;
}

