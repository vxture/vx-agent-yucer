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
import { hasProductAccess, type Entitlement } from "../entitlement/types";
import { DEFAULT_MEMBER_ROLE, OWNER_BOOTSTRAP_ROLE, type PermCode } from "./catalog";
import { getAuthzStore, type AuthzStore } from "./store";

// Re-exported so a server caller holding a context keeps one import site. The
// implementations live in decide.ts precisely so they are reachable without this
// module's database dependencies.
export { can, decisionsFor, type PermissionHolder } from "./decide";

export interface AuthzContext {
  workspaceId: string;
  sub: string;
  /** Codes of the workspace's own roles (incr/0046). */
  roles: string[];
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
  defaultEligible: boolean;
}

const cache = new Map<string, Entry>();
let invalidationGeneration = 0;

function cacheKey(workspaceId: string, sub: string): string {
  return `${workspaceId} ${sub}`;
}

export function invalidateAuthz(workspaceId: string, sub?: string): void {
  invalidationGeneration++;
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
  invalidationGeneration++;
  cache.clear();
}

/**
 * Resolve the member for the active workspace, creating the local_authz row on
 * first sighting and initializing the appropriate product role.
 *
 * Returns null when the token carries no active workspace: there is no such
 * thing as a permission outside a workspace, and defaulting to "some workspace"
 * would be inventing an isolation key, which the data-boundary rule forbids.
 */
export async function resolveAuthzContext(
  user: AuthUser,
  store: AuthzStore = getAuthzStore(),
  entitlement?: Entitlement,
): Promise<AuthzContext | null> {
  const workspaceId = user.activeWorkspace;
  if (!workspaceId) return null;

  const defaultEligible = entitlement?.workspace_id === workspaceId && entitlement.product === "yucer" && hasProductAccess(entitlement);
  const k = cacheKey(workspaceId, user.sub);
  const generation = invalidationGeneration;
  const now = Date.now();
  const hit = cache.get(k);
  if (hit && hit.expiresAt > now && hit.defaultEligible === defaultEligible
    && hit.value.isWorkspaceOwner === user.isWorkspaceOwner) return hit.value;

  // THE ROSTER'S NAMES COME FROM HERE (2026-09-29). Every "who" outside the
  // header reads local_authz.member.display_name (lib/member-names.tsx), and
  // this login sighting originally never passed it, so in
  // production every member rendered as their bare sub. The platform releases
  // the name on the access token; the platform product roster now also updates
  // names when an authorized manager reads it. Each member's own sign-in still
  // refreshes the complete profile. A token with no name
  // (displayName fell back to the sub) leaves a good cached value alone.
  //
  // The rest of the display cache (incr/0103) rides along. phone, email and
  // picture are released whenever the member has one, so an absent claim
  // means "has none" and clears a stale value. user_no is not on the token
  // yet: absent means "not told", and a cached value is kept.
  const name = user.displayName !== user.sub ? user.displayName : undefined;
  const { created, status } = await store.seeMember({
    workspaceId,
    sub: user.sub,
    displayName: name,
    phone: user.phone,
    email: user.email,
    pictureUrl: user.picture,
    userNo: user.userNo ?? undefined,
  });

  // A WORKSPACE'S ROLES ARE ITS OWN (incr/0046), and it starts from the
  // presets: the first member the workspace ever sees brings the nine in,
  // so the owner bootstrap below finds sales_leader, and /admin/roles has a
  // list before anybody configures one. A workspace that already has roles
  // is left exactly as it is - the store's own rule.
  if (created) await store.seedPresetRoles(workspaceId);

  // Owner recovery remains a separate platform contract. Ordinary defaults run
  // only after product access is confirmed and never undo an admin decision.
  if (status === "active" && (user.isWorkspaceOwner || defaultEligible)) {
    await store.initializeMemberRole(workspaceId, user.sub,
      user.isWorkspaceOwner ? OWNER_BOOTSTRAP_ROLE : DEFAULT_MEMBER_ROLE, user.isWorkspaceOwner);
  }
  const [roles, permissions] = status === "active" ? await Promise.all([
    store.rolesOf(workspaceId, user.sub),
    store.permissionsOf(workspaceId, user.sub),
  ]) : [[], []];

  const value: AuthzContext = {
    workspaceId,
    sub: user.sub,
    roles,
    permissions: new Set(permissions),
    isWorkspaceOwner: user.isWorkspaceOwner,
  };
  // A member at the role gate must see a new grant on their next recheck,
  // including grants made on another instance. Never retain a roleless result.
  if (invalidationGeneration === generation) {
    if (roles.length > 0) cache.set(k, { value, defaultEligible, expiresAt: now + TTL_MS });
    else cache.delete(k);
  }
  return value;
}

