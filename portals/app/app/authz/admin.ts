// Member and role administration.
//
// The port has had grantRole / revokeRole / listMembers since batch 2 and the
// only caller was the workspace-owner bootstrap in context.ts. That left the
// product usable by exactly ONE human per workspace: every other member's row
// is created lazily on first sighting with `roles: []`, permissionsOf returns
// nothing, resolveNavigation hides all eight domains, and the shell renders the
// locked-out state. The workspace had already paid; the rep simply could not be
// given a role, because the screen that grants one was never built.
//
// Two rules here are load-bearing:
//
//   1. THE LAST ADMINISTRATOR CANNOT BE REMOVED. The owner bootstrap runs on
//      the first sighting only - deliberately, so it cannot resurrect a role an
//      admin removed on purpose - which means a workspace with nobody holding
//      admin.manage has NO path back. Not through a later login, not through
//      the platform. Refusing the last revoke is the difference between a
//      recoverable mistake and a workspace that must be repaired by hand
//      against the database.
//
//   2. THE ROLE CATALOG IS CLOSED. A role code that is not in the catalog is
//      refused here rather than written and ignored: the in-memory adapter
//      silently drops an unknown code and the Prisma one would fail on a
//      foreign key, so without this check the two adapters disagree about what
//      just happened.

import { can, type PermissionHolder } from "./decide";
import { invalidateAuthz } from "./context";
import { isRoleCode, ROLE_PERMISSIONS, type RoleCode } from "./catalog";
import type { AuthzStore, MemberRecord } from "./store";
import type { Entitlement } from "../entitlement/types";
import { fail, ok, violation, type RuleResult } from "../domains/shared/result";
import type { Decision } from "./gate";

/**
 * A gate refusal. Defined here rather than imported from a domain service:
 * authz sits UNDER the domains and must not depend on one, or the lower layer
 * ends up reaching up through the higher one for a helper.
 */
function denied<T>(decision: Decision): RuleResult<T> {
  return fail(
    violation(
      decision.reason ?? "denied",
      decision.reason === "permission_denied"
        ? `missing permission ${decision.requiredPerm}`
        : `requires ${decision.requiredTier ?? "a subscription"}`,
      "authorization",
    ),
  );
}

export interface AdminContext {
  workspaceId: string;
  /** The administrator performing the change, from the session. Never a param. */
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: AuthzStore;
}

/** True when this role carries the permission that administers roles. */
function isAdminRole(role: RoleCode): boolean {
  return ROLE_PERMISSIONS[role].includes("admin.manage");
}

export async function listWorkspaceMembers(ctx: AdminContext): Promise<RuleResult<MemberRecord[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.view", "data");
  if (!gate.allowed) return denied(gate);
  const members = await ctx.store.listMembers(ctx.workspaceId);
  // Stable order so a grant does not reshuffle the table under the click that
  // caused it.
  return ok([...members].sort((a, b) => a.sub.localeCompare(b.sub)));
}

export async function assignRole(
  ctx: AdminContext,
  sub: string,
  role: string,
): Promise<RuleResult<MemberRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.role.assign", "data");
  if (!gate.allowed) return denied(gate);

  if (!isRoleCode(role)) {
    return fail(violation("unknown_role", `${role} is not a role in the catalog`, "role"));
  }
  if (!sub.trim()) {
    return fail(violation("sub_required", "a role is granted to someone", "sub"));
  }

  await ctx.store.grantRole(ctx.workspaceId, sub, role);
  // The gate reads a 45s cache. Without this, an administrator who grants a
  // role watches nothing happen for most of a minute and grants it again.
  invalidateAuthz(ctx.workspaceId, sub);

  return memberOf(ctx, sub);
}

export async function revokeRole(
  ctx: AdminContext,
  sub: string,
  role: string,
): Promise<RuleResult<MemberRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.role.revoke", "data");
  if (!gate.allowed) return denied(gate);

  if (!isRoleCode(role)) {
    return fail(violation("unknown_role", `${role} is not a role in the catalog`, "role"));
  }

  // The last-administrator guard. Computed over the whole workspace rather than
  // over the acting member, because "am I the last one" is a fact about the
  // workspace - an admin revoking a COLLEAGUE's last admin role locks everyone
  // out just as thoroughly as revoking their own.
  if (isAdminRole(role)) {
    const members = await ctx.store.listMembers(ctx.workspaceId);
    const stillAdmin = members.filter((m) => {
      const after = m.sub === sub ? m.roles.filter((r) => r !== role) : m.roles;
      return after.some(isAdminRole);
    });
    if (stillAdmin.length === 0) {
      return fail(
        violation(
          "last_admin",
          "this is the workspace's last administrator; removing the role would leave nobody able to grant one back",
          "role",
        ),
      );
    }
  }

  await ctx.store.revokeRole(ctx.workspaceId, sub, role);
  invalidateAuthz(ctx.workspaceId, sub);

  return memberOf(ctx, sub);
}

async function memberOf(ctx: AdminContext, sub: string): Promise<RuleResult<MemberRecord>> {
  const members = await ctx.store.listMembers(ctx.workspaceId);
  const record = members.find((m) => m.sub === sub);
  if (!record) {
    return fail(violation("not_found", `${sub} is not a member of this workspace`, "sub"));
  }
  return ok(record);
}
