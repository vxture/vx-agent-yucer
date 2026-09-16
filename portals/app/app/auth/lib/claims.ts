// Access-token claim parsing and the governance-role gate (080-rp section 2.6).
//
// CRITICAL - this is where two CONFIRMED integration bugs live in arda
// (product_240 section 6 #27/#28); the template must NOT repeat them:
//   1. The platform NEVER issues `admin`. The governance value domain is exactly
//      owner / manager / member / readonly / guest (data_identity_200 section
//      6.4 seed). Treating `admin` as a manage role, or expecting it, is wrong.
//   2. roles[] is a SCOPE-PREFIXED string array, e.g. ["org:owner",
//      "workspace:owner"] - not bare role codes. A consumer that compares a bare
//      `owner` misses `workspace:owner` and mis-gates the admin surface. So the
//      manage check compares against the scope-prefixed set, never a bare code.

export const GOVERNANCE_ROLE_CODES = [
  "owner",
  "manager",
  "member",
  "readonly",
  "guest",
] as const;
export type GovernanceRoleCode = (typeof GOVERNANCE_ROLE_CODES)[number];

// "Can manage this org/workspace" = role in this scope-prefixed set (080-rp
// section 2.6). owner is full authority; manager manages members/roles/settings
// (not billing/ownership). member/readonly/guest have no governance authority.
const MANAGE_ROLES = new Set(["org:owner", "workspace:owner", "workspace:manager"]);

export interface ScopedRole {
  scope: string; // e.g. "org" | "workspace"
  role: string; // e.g. "owner" | "manager" | ...
}

export function parseRoles(roles: readonly string[]): ScopedRole[] {
  return roles.map((raw) => {
    const r = raw.trim().toLowerCase();
    const idx = r.indexOf(":");
    return idx === -1
      ? { scope: "", role: r }
      : { scope: r.slice(0, idx), role: r.slice(idx + 1) };
  });
}

export function canManageWorkspace(roles: readonly string[]): boolean {
  return roles.some((r) => MANAGE_ROLES.has(r.trim().toLowerCase()));
}

// workspace:owner = owner baseline for EVERY product subscribed under that
// workspace (080-rp section 2.6 / product_240 section 8): first-login super-admin,
// which resolves the product-bootstrap "who is the first admin" problem. Product
// authorization = isWorkspaceOwner(token) || product-local authz grant.
export function isWorkspaceOwner(roles: readonly string[]): boolean {
  return roles.some((r) => r.trim().toLowerCase() === "workspace:owner");
}

// Verified access-token claims we consume. entitlement is NOT here (D12: never in
// token, always fetched via C2). Business/product-function roles are NOT here
// (resolved from the product's own DB by (active_workspace, sub)).
//
// name / preferred_username / picture / email / phone / active_org_name /
// active_workspace_name (2026-09-16 rules revision, artifact v24): the
// platform releases these as APP-CONTEXT claims on the access_token
// specifically so a cross-domain RP - one with no IdP database access, which
// is every RP - can render a person and a tenant without a second call. Before
// this, the product read none of them and showed the bare sub (`usr_<uuid>`)
// and a static fallback string instead - silently: sign-in, authorization and
// tenant filtering all still worked, because none of them touch these fields.
// id_token stays verification/sub/nonce/auth_time only - it is not where these
// live (auth-bff issues them only into the access_token's extra claims,
// oidc.service.ts's buildTenantIdentityClaims).
export interface AccessClaims {
  sub: string;
  active_org?: string;
  active_org_type?: string;
  active_org_name?: string;
  active_workspace?: string;
  active_workspace_name?: string;
  roles?: string[];
  account_status?: string;
  name?: string;
  preferred_username?: string;
  picture?: string;
  email?: string;
  phone?: string;
}

export interface AuthUser {
  sub: string; // full "usr_<uuid>" - stored verbatim by the product DB
  activeOrg: string | null;
  activeOrgType: string | null; // "personal" | "organization"
  activeOrgName: string | null;
  activeWorkspace: string | null;
  activeWorkspaceName: string | null;
  roles: string[]; // raw scope-prefixed, as issued
  accountStatus: string | null; // read per-request from token, never stored
  canManage: boolean;
  isWorkspaceOwner: boolean;
  /**
   * What a human reads as this person's name - never the bare sub. `name`
   * carries the platform's own fallback (account handle) whenever a display
   * name was never set (buildTenantIdentityClaims: `user.name ?? user.account`),
   * so `preferred_username` only matters for a token minted with no `profile`
   * scope; `sub` is the last resort so a caller never has to null-check this.
   */
  displayName: string;
  /** Only present when the platform has a custom avatar on file - rare. Never
   *  guess a URL when absent; render the product's own default face instead. */
  picture: string | null;
  email: string | null;
  phone: string | null;
}

export function toAuthUser(claims: AccessClaims): AuthUser {
  const roles = Array.isArray(claims.roles) ? claims.roles : [];
  return {
    sub: claims.sub,
    activeOrg: claims.active_org ?? null,
    activeOrgType: claims.active_org_type ?? null,
    activeOrgName: claims.active_org_name ?? null,
    activeWorkspace: claims.active_workspace ?? null,
    activeWorkspaceName: claims.active_workspace_name ?? null,
    roles,
    accountStatus: claims.account_status ?? null,
    canManage: canManageWorkspace(roles),
    isWorkspaceOwner: isWorkspaceOwner(roles),
    displayName: claims.name ?? claims.preferred_username ?? claims.sub,
    picture: claims.picture ?? null,
    email: claims.email ?? null,
    phone: claims.phone ?? null,
  };
}
