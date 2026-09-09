// 角色管理 - the workspace's own roles (incr/0046).
//
// THE RULING (owner, 2026-09-09): 角色页面，支持新建，排序，授权。按照区域设定
// 模式，有系统预置角色，可以自定义。 A role stopped being a fact of the build
// that afternoon. The nine the catalogue seeds are PRESETS now - what a
// workspace is materialised from on its first sighting and can reset to -
// and the workspace edits from there: renames one, narrows one, adds a
// 渠道经理 the catalogue never imagined, orders them the way its org chart
// reads.
//
// WHAT STAYS CLOSED: the permission catalogue. 权限当前全部为预置功能，不可增删
// 改 - a role is a SET OF PERMISSIONS the workspace composes, never a new
// permission, and PERM_CODES is still the whole vocabulary a role can hold.
//
// THE ONE RULE THAT COULD LOCK A WORKSPACE OUT is the same one admin.ts
// guards for member roles, one level up: after any change here, somebody
// active must still hold a role that carries admin.manage. Narrowing the only
// administrative role, or deleting it, is refused - not because the change is
// illegitimate but because there is no path back through a later login.
//
// Same layering as admin.ts: authz sits UNDER the domains and imports
// nothing from one. planMove lives in domains/shared/ordering.ts for exactly
// that reason.

import { can, type PermissionHolder } from "./decide";
import { invalidateAuthz } from "./context";
import { ROLE_CODE_SHAPE, isPermCode, type PermCode, type PresetRole } from "./catalog";
import type { AuthzStore, WorkspaceRole } from "./store";
import type { Entitlement } from "../entitlement/types";
import { fail, ok, violation, type RuleResult } from "../domains/shared/result";
import { planMove, type MoveDirection } from "../domains/shared/ordering";
import type { Decision } from "./gate";
import { recordAuditEvent } from "../audit/lib/record";
import type { AuditOutcome } from "../audit/lib/store";

export interface RoleContext {
  workspaceId: string;
  /** The administrator performing the change, from the session. Never a param. */
  sub: string;
  holder: PermissionHolder;
  entitlement: Entitlement;
  store: AuthzStore;
}

/** One row of /admin/roles: the role, whether it still IS its preset, and
 *  how many people hold it. */
export interface RoleView extends WorkspaceRole {
  /** True while it matches the preset of the same code exactly - name and
   *  grants. Derived, never stored: the moment a tenant renames it or moves
   *  a permission it reads as theirs. */
  readonly preset: boolean;
  readonly members: number;
}

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

function audit(ctx: RoleContext, action: string, objectId: string, outcome: AuditOutcome): Promise<void> {
  return recordAuditEvent({
    workspaceId: ctx.workspaceId,
    actorId: ctx.sub,
    objectType: "role",
    objectId,
    action,
    outcome,
  });
}

/**
 * 系统预置 or 自定义 - decided by COMPARING, the way isSystemDivision decides
 * it for a 大区: same code, same name, same grants. A preset code with one
 * permission moved is the tenant's role now, and says so.
 */
export function isPresetRole(
  presets: readonly PresetRole[],
  role: { readonly code: string; readonly name: string; readonly description: string; readonly permissions: readonly string[] },
): boolean {
  const p = presets.find((x) => x.code === role.code);
  if (!p || p.name !== role.name || p.description !== role.description) return false;
  if (p.permissions.length !== role.permissions.length) return false;
  const held = new Set(role.permissions);
  return p.permissions.every((c) => held.has(c));
}

/** Codes of the roles that carry admin.manage, out of a list. */
function adminCodes(roles: readonly WorkspaceRole[]): Set<string> {
  return new Set(roles.filter((r) => r.permissions.includes("admin.manage")).map((r) => r.code));
}

/**
 * Would somebody active still be able to administer the workspace if the
 * roles read `after`? The check admin.ts makes per member, made per role:
 * the roles change under every member at once.
 */
async function leavesAnAdministrator(ctx: RoleContext, after: readonly WorkspaceRole[]): Promise<boolean> {
  const admin = adminCodes(after);
  if (admin.size === 0) return false;
  const members = await ctx.store.listMembers(ctx.workspaceId);
  return members.some((m) => m.status === "active" && m.roles.some((r) => admin.has(r)));
}

export async function listRoles(ctx: RoleContext): Promise<RuleResult<RoleView[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.view", "data");
  if (!gate.allowed) return denied(gate);
  const [roles, presets, members] = await Promise.all([
    ctx.store.listRoles(ctx.workspaceId),
    ctx.store.listPresetRoles(),
    ctx.store.listMembers(ctx.workspaceId),
  ]);
  const held = new Map<string, number>();
  for (const m of members) for (const r of m.roles) held.set(r, (held.get(r) ?? 0) + 1);
  return ok(roles.map((r) => ({ ...r, preset: isPresetRole(presets, r), members: held.get(r.code) ?? 0 })));
}

/** The presets, for the form's 应用预置 / 重置预置 and the roster's reset. */
export async function listPresetRoles(ctx: RoleContext): Promise<RuleResult<PresetRole[]>> {
  const gate = can(ctx.holder, ctx.entitlement, "admin.member.view", "data");
  if (!gate.allowed) return denied(gate);
  return ok(await ctx.store.listPresetRoles());
}

/**
 * Create a role, or rename one and set what it may do.
 *
 * THE CODE IS THE ANCHOR: an existing code is edited, a new one created, and
 * the form disables the field once a role exists - every member link keys on
 * it (0046 locks the column the same way). The grants are stated whole.
 */
export async function saveRole(
  ctx: RoleContext,
  input: { code: string; name: string; description: string; permissions: readonly string[] },
): Promise<RuleResult<WorkspaceRole>> {
  const action = "admin.role.upsert";
  const gate = can(ctx.holder, ctx.entitlement, action, "data");
  if (!gate.allowed) {
    await audit(ctx, action, input.code, "denied");
    return denied(gate);
  }
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) return fail(violation("code_required", "a role needs a code", "code"));
  if (!ROLE_CODE_SHAPE.test(code)) {
    return fail(violation(
      "code_shape",
      `${code}: a role code is lower-case letters, digits and underscores, starting with a letter`,
      "code",
    ));
  }
  if (!name) return fail(violation("name_required", "a role needs a name", "name"));
  const description = input.description.trim();
  if (description.length > 500) {
    return fail(violation("description_too_long", "a role's description is one sentence, at most 500 characters", "description"));
  }
  /* THE PERMISSION CATALOGUE IS CLOSED: a code outside it is refused here in
     the product's words, before the foreign key refuses it in Postgres's. */
  const permissions: PermCode[] = [];
  for (const p of new Set(input.permissions)) {
    if (!isPermCode(p)) {
      return fail(violation("permission_unknown", `${p} is not a permission in the catalogue`, "permissions"));
    }
    permissions.push(p);
  }

  const before = await ctx.store.listRoles(ctx.workspaceId);
  const after = before.map((r) => (r.code === code ? { ...r, name, description, permissions } : r));
  if (!after.some((r) => r.code === code)) {
    after.push({ id: "", code, name, description, sortOrder: before.length + 1, permissions });
  }
  /* THE LAST-ADMINISTRATOR GUARD, on the role rather than the member: taking
     admin.manage off the only role the workspace's administrators hold locks
     everybody out just as surely as revoking it from each of them. */
  if (!(await leavesAnAdministrator(ctx, after))) {
    await audit(ctx, action, code, "error");
    return fail(violation(
      "last_admin",
      "this is the only role the workspace's administrators hold; taking administration off it would leave nobody able to put it back",
      "permissions",
    ));
  }

  const row = await ctx.store.upsertRole(ctx.workspaceId, { code, name, description, permissions });
  // Every member holding it reads a different permission set now, and the
  // gate caches for 45s: the whole workspace is invalidated, not one sub.
  invalidateAuthz(ctx.workspaceId);
  await audit(ctx, action, code, "success");
  return ok(row);
}

/**
 * Remove a role.
 *
 * REFUSED WHILE SOMEBODY HOLDS IT - the foreign key's rule (ON DELETE
 * RESTRICT) said in the product's terms, with the count. Cascading would
 * silently strip every holder of what the role let them do, and the roster
 * would show nothing to say why they lost their modules.
 */
export async function removeRole(ctx: RoleContext, code: string): Promise<RuleResult<{ code: string }>> {
  const action = "admin.role.remove";
  const gate = can(ctx.holder, ctx.entitlement, action, "data");
  if (!gate.allowed) {
    await audit(ctx, action, code, "denied");
    return denied(gate);
  }
  const roles = await ctx.store.listRoles(ctx.workspaceId);
  const target = roles.find((r) => r.code === code);
  if (!target) return fail(violation("role_unknown", `${code} is not a role of this workspace`, "code"));
  const members = await ctx.store.listMembers(ctx.workspaceId);
  const holders = members.filter((m) => m.roles.includes(code)).length;
  if (holders > 0) {
    return fail(violation("role_in_use", `${code} is still held by ${holders} member(s)`, "code"));
  }
  // Nobody holds it, so removing it cannot strip an administrator - the
  // last-admin guard is satisfied by construction and not re-run.
  await ctx.store.removeRole(ctx.workspaceId, code);
  await audit(ctx, action, code, "success");
  return ok({ code });
}

/**
 * Re-order the roles - up, down, to the top, to the bottom.
 *
 * THE ORDER IS GLOBAL, as it is for the 大区: sort_order is what every reader
 * of the list follows - the roster, the assignment menu on /admin/members,
 * the columns of 权限管理 - so the roster is not re-sorted for display; it IS
 * the order, and this is the one verb that changes it.
 */
export async function moveRole(
  ctx: RoleContext,
  input: { code: string; direction: MoveDirection },
): Promise<RuleResult<true>> {
  const action = "admin.role.upsert";
  const gate = can(ctx.holder, ctx.entitlement, action, "data");
  if (!gate.allowed) return denied(gate);

  const rows = await ctx.store.listRoles(ctx.workspaceId);
  const plan = planMove(rows.map((r) => ({ id: r.code, movable: true })), input.code, input.direction);
  if (!plan.ok) return plan as RuleResult<true>;

  const by = new Map(rows.map((r) => [r.code, r]));
  for (const o of plan.value) {
    const row = by.get(o.id)!;
    if (row.sortOrder === o.sortOrder) continue;
    await ctx.store.upsertRole(ctx.workspaceId, {
      code: row.code, name: row.name, description: row.description, sortOrder: o.sortOrder, permissions: row.permissions,
    });
  }
  return ok(true);
}

/**
 * 重置预置 - put the nine presets back the way the catalogue seeds them.
 *
 * RESTORES AND OVERWRITES, NEVER DELETES: a preset the workspace removed
 * comes back; one it renamed or narrowed is set back to the seed, name and
 * grants; a role of the workspace's own is not touched. The order the
 * presets are seeded in is restored too, and the tenant's own roles keep
 * their places after them. Reports how many rows changed hands, so the
 * confirmation can say what it cost.
 */
export async function resetPresetRoles(
  ctx: RoleContext,
): Promise<RuleResult<{ restored: number; unchanged: number }>> {
  const action = "admin.role.upsert";
  const gate = can(ctx.holder, ctx.entitlement, action, "data");
  if (!gate.allowed) {
    await audit(ctx, action, "presets", "denied");
    return denied(gate);
  }
  const [presets, before] = await Promise.all([
    ctx.store.listPresetRoles(),
    ctx.store.listRoles(ctx.workspaceId),
  ]);
  let restored = 0;
  let unchanged = 0;
  for (const p of presets) {
    const mine = before.find((r) => r.code === p.code);
    /* RESTORED counts what the roster calls 自定义 or missing - a preset
       whose name, sentence or grants differ, or one that was deleted. A
       preset merely out of ORDER is put back in its place but not counted:
       the dialog's own figures come from the same comparison, and a number
       the reader was not shown must not appear in the toast. */
    const same = mine !== undefined && isPresetRole(presets, mine);
    if (same && mine.sortOrder === p.sortOrder) {
      unchanged += 1;
      continue;
    }
    await ctx.store.upsertRole(ctx.workspaceId, {
      code: p.code, name: p.name, description: p.description, sortOrder: p.sortOrder, permissions: p.permissions,
    });
    if (same) unchanged += 1;
    else restored += 1;
  }
  // The tenant's own roles follow the presets, in the order they had.
  let next = presets.length + 1;
  for (const r of before) {
    if (presets.some((p) => p.code === r.code)) continue;
    if (r.sortOrder !== next) {
      await ctx.store.upsertRole(ctx.workspaceId, {
        code: r.code, name: r.name, description: r.description, sortOrder: next, permissions: r.permissions,
      });
    }
    next += 1;
  }
  invalidateAuthz(ctx.workspaceId);
  await audit(ctx, action, "presets", "success");
  return ok({ restored, unchanged });
}
