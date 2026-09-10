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
import { listOrgMembers, setMemberUnits } from "../../../domains/planning/service";

/* 成员管理 的写入路径.
 *
 * ONE SAVE FOR THE FORM (owner, 2026-09-10: 展示信息和编辑、新建混合在一个页面，
 * 大bug). The roster used to carry a grant select, a remove button per role,
 * a scope select, a territory select, a unit select and the lifecycle
 * buttons inline - six write paths on one display page. The form on
 * /admin/members/[id] is where a member is configured now, and it saves
 * through this one action: the roles as a set (grants first, then
 * revocations, so swapping one administrator role for another never trips
 * the last-administrator guard), the scope, the units.
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
  input: { roles: readonly string[]; unitIds: readonly string[]; scope: string; territoryIds: readonly string[] },
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

  // THE UNITS (0051, several since 0053), through the planning service and
  // its own gate.
  const placed = await setMemberUnits({ ...c, store: getPlanningStore() }, { sub, unitIds: input.unitIds });
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

/**
 * 组织视图's row operation (owner, 2026-09-10: 在各单位内可以添加成员): put
 * these members INTO a unit, or take them OUT of it. Each person's set of
 * units is read and rewritten through the same service verb the form uses,
 * so the gate (admin.member.scope) and the unit check are the service's.
 * A person already in the unit, or already out of it, is left alone.
 */
export async function placeMembersInUnit(
  unitId: string,
  subs: readonly string[],
  mode: "add" | "remove",
): Promise<RoleChangeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const c = { ...ctx(session), store: getPlanningStore() };
  const placements = await listOrgMembers(c);
  if (!placements.ok) return { ok: false, error: placements.violations[0]?.code ?? "denied" };
  for (const sub of new Set(subs)) {
    const have = placements.value.get(sub) ?? [];
    const want = mode === "add" ? (have.includes(unitId) ? have : [...have, unitId]) : have.filter((u) => u !== unitId);
    if (want.length === have.length) continue;
    const r = await setMemberUnits(c, { sub, unitIds: want });
    if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  }
  // Placement decides what the unit scope returns, so the whole shell.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * 移动到单位: this placement, and only this one, goes to another unit. The
 * person's other units stay (0053). A no-op when from and to are the same.
 */
export async function moveMemberToUnit(sub: string, fromUnitId: string, toUnitId: string): Promise<RoleChangeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const c = { ...ctx(session), store: getPlanningStore() };
  const placements = await listOrgMembers(c);
  if (!placements.ok) return { ok: false, error: placements.violations[0]?.code ?? "denied" };
  const have = placements.value.get(sub) ?? [];
  const want = [...have.filter((u) => u !== fromUnitId), ...(have.includes(toUnitId) ? [] : [toUnitId])];
  const r = await setMemberUnits(c, { sub, unitIds: want });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * 添加到单位 (owner: 多单位意思 + 新角色): put the person into MORE units,
 * keeping the ones they are in, and grant the roles ticked alongside. The
 * roles go through the roster service's own gate and guard (assignRole);
 * a role already held is a no-op there.
 */
export async function addMemberToUnits(sub: string, unitIds: readonly string[], roles: readonly string[]): Promise<RoleChangeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const c = ctx(session);
  const planning = { ...c, store: getPlanningStore() };
  const placements = await listOrgMembers(planning);
  if (!placements.ok) return { ok: false, error: placements.violations[0]?.code ?? "denied" };
  const have = placements.value.get(sub) ?? [];
  const want = [...new Set([...have, ...unitIds])];
  if (want.length !== have.length) {
    const r = await setMemberUnits(planning, { sub, unitIds: want });
    if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  }
  for (const role of new Set(roles)) {
    const r = await assignRole(c, sub, role);
    if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * The selection's operations on 组织管理 (owner, 2026-09-10: 多选后 = 移除原
 * 单位、移动到单位、复用到单位). Each item is one selected ROW - a person
 * under a unit - so the same person selected under two units is two items.
 *   remove: the placement the row sits in ends.
 *   move:   that placement goes to `toUnitId`.
 *   copy:   the person also joins `toUnitId`; nothing ends.
 * One read of the placements, one rewrite per person, one revalidate.
 */
export async function bulkPlaceMembers(
  items: readonly { sub: string; unitId: string | null }[],
  mode: "remove" | "move" | "copy",
  toUnitId?: string,
): Promise<RoleChangeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  if (mode !== "remove" && !toUnitId) return { ok: false, error: "unit_unknown" };
  const c = { ...ctx(session), store: getPlanningStore() };
  const placements = await listOrgMembers(c);
  if (!placements.ok) return { ok: false, error: placements.violations[0]?.code ?? "denied" };
  const bySub = new Map<string, Set<string>>();
  for (const it of items) {
    const set = bySub.get(it.sub) ?? new Set(placements.value.get(it.sub) ?? []);
    if (mode !== "copy" && it.unitId !== null) set.delete(it.unitId);
    if (mode !== "remove" && toUnitId) set.add(toUnitId);
    bySub.set(it.sub, set);
  }
  for (const [sub, set] of bySub) {
    const have = placements.value.get(sub) ?? [];
    const want = [...set];
    if (want.length === have.length && want.every((u) => have.includes(u))) continue;
    const r = await setMemberUnits(c, { sub, unitIds: want });
    if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
