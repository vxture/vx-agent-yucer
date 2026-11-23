import type { AuthUser } from "./lib/claims";
import { createHash } from "node:crypto";
import { getEntitlementResolver, type EntitlementResolver } from "../entitlement/resolver";
import { hasDataAccess, hasProductAccess, type Entitlement } from "../entitlement/types";
import { invalidateAuthz, resolveAuthzContext, type AuthzContext } from "../authz/context";
import { getAuthzStore, type AuthzStore } from "../authz/store";
import { readProductRoster, type ProductRosterItem } from "../platform/product-roster";

export type ProductEntryState = "ready" | "no-subscription" | "unassigned" | "no-roles" | "unavailable";
export interface ProductEntryAccess {
  state: ProductEntryState;
  entitlement: Entitlement | null;
  authz: AuthzContext | null;
}

/** An opaque change marker, never role or permission details in the probe. */
export function productAccessRevision(access: ProductEntryAccess): string {
  return createHash("sha256").update(JSON.stringify([
    access.state, access.entitlement && [access.entitlement.tier, access.entitlement.status, access.entitlement.bundled, Object.entries(access.entitlement.limits).sort(([a], [b]) => a.localeCompare(b))],
    access.state === "ready" ? [...(access.authz?.roles ?? [])].sort((a, b) => a.localeCompare(b)) : [], [...(access.authz?.permissions ?? [])].sort((a, b) => a.localeCompare(b)),
  ])).digest("hex");
}
interface Dependencies {
  resolver: EntitlementResolver;
  store: AuthzStore;
  roster: (workspaceId: string, orgId: string) => Promise<ProductRosterItem[] | null>;
}

/** Current platform assignment precedes every local role/store access. Never
 * cache an allow between requests, infer seats from limits, or exempt owners.
 * A failed/partial roster is unknown, never an empty successful directory. */
export async function resolveProductEntryAccess(
  user: AuthUser, fresh = false, dependencies?: Dependencies, options: { initialize?: boolean } = {},
): Promise<ProductEntryAccess> {
  const unavailable: ProductEntryAccess = { state: "unavailable", entitlement: null, authz: null };
  if (!user.activeWorkspace || !user.activeOrg) return unavailable;
  const workspaceId = user.activeWorkspace;
  try {
    const { resolver, store, roster } = dependencies ?? {
      resolver: getEntitlementResolver(), store: getAuthzStore(), roster: readProductRoster,
    };
    if (fresh) resolver.invalidate(workspaceId);
    const entitlement = await resolver.resolve(workspaceId);
    if (entitlement.workspace_id !== workspaceId || entitlement.product !== "yucer") return unavailable;
    if (!hasDataAccess(entitlement)) return { state: "no-subscription", entitlement, authz: null };
    const members = await roster(workspaceId, user.activeOrg);
    if (members === null) return unavailable;
    if (!members.some(member => member.subject === user.sub)) {
      invalidateAuthz(workspaceId, user.sub);
      return { state: "unassigned", entitlement, authz: null };
    }
    // Only a currently assigned member can initialize the default sales role.
    const authz = options.initialize === false ? await readProductAuthz(user, store) : await resolveAuthzContext(user, store, entitlement, { fresh });
    if (!authz) return unavailable;
    let state: ProductEntryState = "no-subscription";
    if (hasProductAccess(entitlement)) state = authz.permissions.size ? "ready" : "no-roles";
    return { state, entitlement, authz };
  } catch {
    invalidateAuthz(workspaceId, user.sub);
    return unavailable;
  }
}

/** Background probes do not sight profiles, seed presets or initialize roles. */
async function readProductAuthz(user: AuthUser, store: AuthzStore): Promise<AuthzContext> {
  const workspaceId = user.activeWorkspace!;
  const [roles, permissions] = await Promise.all([store.rolesOf(workspaceId, user.sub), store.permissionsOf(workspaceId, user.sub)]);
  return { workspaceId, sub: user.sub, roles, permissions: new Set(permissions), isWorkspaceOwner: user.isWorkspaceOwner };
}
