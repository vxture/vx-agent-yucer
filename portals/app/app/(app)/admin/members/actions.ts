"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { getAuthzStore } from "../../../authz/store";
import {
  assignRole,
  deactivateMember,
  listWorkspaceMembers,
  reactivateMember,
  revokeRole,
  setMemberScope,
} from "../../../authz/admin";
import { isDataScope } from "../../../authz/scope";
import { getPlanningStore } from "../../../domains/shared/registry";
import { setMemberUnit } from "../../../domains/planning/service";

/* 成员管理 的写入路径.
 *
 * ONE SAVE FOR THE FORM (owner, 2026-09-10: 展示信息和编辑、新建混合在一个页面，
 * 大bug). The roster used to carry a grant select, a remove button per role,
 * a scope select, a territory select, a unit select and the lifecycle
 * buttons inline - six write paths on one display page. The form on
 * /admin/members/[id] is where a member is configured now, and it saves
 * through this one action: the roles as a set (grants first, then
 * revocations, so swapping one administrator role for another never trips
 * the last-administrator guard), the scope, the unit.
 *
 * The administrator is the SESSION subject, never a parameter. The target
 * is a parameter, because configuring somebody else is the point.
 *
 * Returns the violation CODE, never its sentence (TD-010).
 */

export interface RoleChangeResult {
  ok: boolean;
  error?: string;
}

function ctx(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAuthzStore(),
  };
}

export async function saveMemberAction(
  sub: string,
  input: { roles: readonly string[]; unitId: string; scope: string; territoryIds: readonly string[] },
): Promise<RoleChangeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  if (!isDataScope(input.scope)) return { ok: false, error: "unknown_scope" };
  const c = ctx(session);

  const members = await listWorkspaceMembers(c);
  if (!members.ok) return { ok: false, error: members.violations[0]?.code ?? "denied" };
  const me = members.value.find((m) => m.sub === sub);
  if (!me) return { ok: false, error: "not_found" };

  // THE ROLES AS A SET. Every write runs the service's own gate and guard.
  const want = new Set(input.roles);
  const held = new Set(me.roles);
  for (const role of want) {
    if (held.has(role)) continue;
    const r = await assignRole(c, sub, role);
    if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  }
  for (const role of held) {
    if (want.has(role)) continue;
    const r = await revokeRole(c, sub, role);
    if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  }

  // THE SCOPE. Territories kept only for the scope that reads them (0022).
  const scoped = await setMemberScope(c, sub, {
    kind: input.scope,
    territoryIds: input.scope === "territory" ? [...input.territoryIds] : [],
  });
  if (!scoped.ok) return { ok: false, error: scoped.violations[0]?.code ?? "denied" };

  // THE UNIT (0051), through the planning service and its own gate.
  const placed = await setMemberUnit(
    { ...c, store: getPlanningStore() },
    { sub, unitId: input.unitId === "" ? null : input.unitId },
  );
  if (!placed.ok) return { ok: false, error: placed.violations[0]?.code ?? "denied" };

  // Roles drive the nav and scope decides what every list returns, so the
  // whole shell is stale - including the page the member themselves holds.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Somebody left. Mark them inactive and take their roles.
 *
 * The row is never deleted - see deactivateMember. What this surface adds is
 * the revalidate: roles drive the nav, so a deactivation has to invalidate the
 * whole shell rather than this page.
 */
export async function setMemberInactive(sub: string): Promise<RoleChangeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await deactivateMember(ctx(session), sub);
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** An accidental deactivation, undone. Restores no roles - see the service. */
export async function setMemberActive(sub: string): Promise<RoleChangeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await reactivateMember(ctx(session), sub);
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

  revalidatePath("/", "layout");
  return { ok: true };
}
