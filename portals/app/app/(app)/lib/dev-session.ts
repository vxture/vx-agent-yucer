import type { Entitlement } from "../../entitlement/types";
import { getEntitlementResolver } from "../../entitlement/resolver";
import {
  permissionsForRoles,
  isRoleCode,
  type PermCode,
  type RoleCode,
} from "../../authz/catalog";
import type { AuthUser } from "../../auth/lib/claims";
import type { AuthzContext } from "../../authz/context";

// A synthetic session, for looking at the product locally.
//
// WHY IT EXISTS: every product surface resolves session -> entitlement ->
// permission, and the session half needs a real OIDC login backed by Redis.
// Locally there is neither, so all nine domain pages render the signed-out
// state and the product cannot be reviewed at all before the platform-side
// registration lands.
//
// WHY IT IS SHAPED LIKE THIS: this is a hole in the authentication path, and
// the only acceptable version of that is one which CANNOT be open in
// production. So it is guarded the same way the demo-data switch is - by
// several independent conditions rather than one flag someone can flip:
//
//   1. NODE_ENV must not be "production". A production build refuses outright,
//      whatever the environment says.
//   2. YUCER_DEV_SESSION must be the literal string "on". Absent means off;
//      "true", "1" and "yes" all mean off. A typo fails closed.
//   3. DATABASE_URL must be unset. A synthetic member must never be pointed at
//      a real database - the same reason ensureDemoData refuses.
//
// The three are independent: no single mistake turns it on. It also never
// short-circuits the GATES - the fake session carries a real role from the
// catalog and a real entitlement from the resolver, so both gates evaluate
// exactly as they would for a real member. What is faked is who you are, not
// what you may do.

const DEV_SUB = "usr_00000000-0000-0000-0000-00000000dev0";
const DEV_WORKSPACE = "00000000-0000-0000-0000-0000000000de";

export type EnvLike = Record<string, string | undefined>;

export interface DevSession {
  user: AuthUser;
  workspaceId: string;
  entitlement: Entitlement;
  authz: AuthzContext;
}

/**
 * All three conditions, independently. Exported so the guard itself is
 * testable rather than trusted.
 */
export function devSessionEnabled(env: EnvLike = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  if (env.YUCER_DEV_SESSION !== "on") return false;
  if (env.DATABASE_URL) return false;
  return true;
}

/** The role the synthetic member holds. Unknown or absent falls back to the
 * fullest one, because the point of the surface is to see everything. */
export function devRole(env: EnvLike = process.env): RoleCode {
  const requested = env.YUCER_DEV_ROLE ?? "";
  return isRoleCode(requested) ? requested : "sales_leader";
}

export async function resolveDevSession(
  env: EnvLike = process.env,
): Promise<DevSession | null> {
  if (!devSessionEnabled(env)) return null;

  const role = devRole(env);
  const workspaceId = env.YUCER_DEV_WORKSPACE || DEV_WORKSPACE;

  const user: AuthUser = {
    sub: DEV_SUB,
    activeOrg: "org_dev",
    activeOrgType: "organization",
    activeWorkspace: workspaceId,
    roles: [],
    accountStatus: "active",
    canManage: true,
    isWorkspaceOwner: true,
  };

  // The REAL resolver, not a hardcoded entitlement. Without PLATFORM_API_URL
  // that is the mock one, which reads MOCK_TIER / MOCK_STATUS / MOCK_BUNDLED -
  // so the tier can be switched from the environment and the entitlement gate
  // is exercised for real rather than bypassed.
  const entitlement = await getEntitlementResolver().resolve(workspaceId);

  const authz: AuthzContext = {
    workspaceId,
    sub: DEV_SUB,
    roles: [role],
    // Derived from the catalog, so the permission gate sees exactly what this
    // role really grants - including what it does NOT.
    permissions: new Set<PermCode>(permissionsForRoles([role])),
    isWorkspaceOwner: true,
  };

  return { user, workspaceId, entitlement, authz };
}
