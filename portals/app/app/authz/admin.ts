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
import { validateScopeSetting, type ScopeSetting } from "./scope";
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

/**
 * A member has left. Mark them inactive and take their roles away.
 *
 * THE ROW SURVIVES, ALWAYS. Every attribution column in the product stores a
 * sub as plain text - `agent_action.decided_by_sub`,
 * `line_discount_approval.approved_by_sub`, `opportunity_stage_event.actor_sub`
 * - so deleting the member breaks no foreign key. It breaks something quieter:
 * this row is the only thing that maps `usr_<uuid>` to a name, and without it
 * every signature in the audit trail is an unreadable string. A person who
 * leaves stops being a colleague; they do not stop having signed things.
 *
 * THE ROLES ARE DROPPED, NOT REMEMBERED, and this is the point of the verb
 * rather than a side effect. The platform decides who may sign in; when it
 * revokes somebody, they cannot reach the product and their stale roles look
 * harmless. But if the platform later grants that same sub access again - a
 * transfer back, a rehire - `seeMember` does not re-run the owner bootstrap and
 * nothing re-examines roles, so they would walk back in holding
 * `sales_leader` because nobody ever took it away. Dropping the roles here
 * means coming back is a decision somebody makes again.
 *
 * WHICH IS ALSO WHY REACTIVATION RESTORES NOTHING. See reactivateMember.
 *
 * THE LAST-ADMINISTRATOR GUARD APPLIES, for the same reason it applies to
 * revokeRole and by the same computation: deactivating the last admin leaves a
 * workspace nobody can administer, and there is no path back through a later
 * login or through the platform.
 */
export async function deactivateMember(
  ctx: AdminContext,
  sub: string,
): Promise<RuleResult<MemberRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.deactivate", "data");
  if (!gate.allowed) return denied(gate);

  const members = await ctx.store.listMembers(ctx.workspaceId);
  const target = members.find((m) => m.sub === sub);
  if (!target) {
    return fail(violation("not_found", `${sub} is not a member of this workspace`, "sub"));
  }

  const stillAdmin = members.filter((m) => m.sub !== sub && m.roles.some(isAdminRole));
  if (target.roles.some(isAdminRole) && stillAdmin.length === 0) {
    return fail(
      violation(
        "last_admin",
        "this is the workspace's last administrator; deactivating them would leave nobody able to grant the role back",
        "sub",
      ),
    );
  }

  for (const role of target.roles) {
    await ctx.store.revokeRole(ctx.workspaceId, sub, role);
  }
  await ctx.store.setMemberStatus(ctx.workspaceId, sub, "inactive");
  invalidateAuthz(ctx.workspaceId, sub);

  return memberOf(ctx, sub);
}

/**
 * Somebody who left is back. Mark them active - and give them nothing else.
 *
 * NO ROLES ARE RESTORED. deactivateMember took them away rather than
 * remembering them, so there is nothing here to put back and that is deliberate
 * - a returning member is granted their roles again by a person who decides to,
 * which is the same act as granting them the first time. Restoring a remembered
 * set would make "who may approve a discount here" a question answered by
 * something that happened before the person left.
 *
 * This verb exists so an accidental deactivation is repairable without a
 * database edit; it is not a rehire flow.
 */
export async function reactivateMember(
  ctx: AdminContext,
  sub: string,
): Promise<RuleResult<MemberRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.reactivate", "data");
  if (!gate.allowed) return denied(gate);

  const members = await ctx.store.listMembers(ctx.workspaceId);
  if (!members.some((m) => m.sub === sub)) {
    return fail(violation("not_found", `${sub} is not a member of this workspace`, "sub"));
  }

  await ctx.store.setMemberStatus(ctx.workspaceId, sub, "active");
  invalidateAuthz(ctx.workspaceId, sub);

  return memberOf(ctx, sub);
}

/**
 * Decide which rows a member may see.
 *
 * THE ADMINISTRATOR'S CALL, not the role's - the owner's ruling of 2026-09-01,
 * "不一定是总经理". Gated on `admin.manage`, which sales_leader AND sales_ops
 * both hold, so the person who runs the workspace can set it without being the
 * person who runs the sales organisation.
 *
 * NO NEW PERMISSION. Whoever may grant a role already decides what somebody can
 * DO; deciding what they can SEE is the same kind of act by the same person,
 * and inventing a stronger permission for it would be a gate guarding nothing.
 *
 * THE TERRITORY IDS ARE NOT VALIDATED AGAINST THE DOMAIN, and that is the
 * layering rather than an omission: authz sits UNDER the domains and cannot
 * read `yucer_gtm.territory`. The surface offers only real territories; an id
 * that later stops existing narrows to nothing rather than widening to
 * everything, which is the safe direction for a value that decides visibility.
 */
export async function setMemberScope(
  ctx: AdminContext,
  sub: string,
  setting: ScopeSetting,
): Promise<RuleResult<MemberRecord>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.scope", "data");
  if (!gate.allowed) return denied(gate);

  const checked = validateScopeSetting(setting);
  if (!checked.ok) return checked as RuleResult<MemberRecord>;

  const members = await ctx.store.listMembers(ctx.workspaceId);
  if (!members.some((m) => m.sub === sub)) {
    return fail(violation("not_found", `${sub} is not a member of this workspace`, "sub"));
  }

  await ctx.store.setScope(ctx.workspaceId, sub, checked.value);
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
