"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { applyStartupPreset, type StartupPresetResult } from "../../lib/startup-preset";
import { getPlanningStore } from "../../../domains/shared/registry";
import {
  moveOrgKind,
  moveOrgUnit,
  removeOrgKind,
  removeOrgUnit,
  reparentOrgUnit,
  saveOrgKind,
  setUnitDivisions,
  upsertOrgUnit,
} from "../../../domains/planning/service";
import { listMarketDivisions } from "../../../domains/account/service";
import type { MoveDirection } from "../../../domains/shared/ordering";

/* 组织结构 的写入路径 (incr/0051).
 *
 * Returns the violation CODE, never its sentence: the rule layer writes its
 * messages for its own reader, and the interface looks the code up in
 * ORG_ERROR (TD-010).
 *
 * The tree is read by /admin/org, by the unit column on /admin/members and by
 * every form that offers a parent or a leader, so each write invalidates the
 * whole layout the way a role change does.
 */

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

async function ctx() {
  const session = await resolveAppSession();
  if (!session) return null;
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPlanningStore(),
  };
}

export async function saveOrgUnitAction(input: {
  unitCode: string;
  name: string;
  parentId: string | null;
  kindId: string;
  leaderSub: string | null;
}): Promise<Result<{ id: string }>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await upsertOrgUnit(c, input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true, id: r.value.id };
}

export async function removeOrgUnitAction(id: string): Promise<Result<{ unplaced: number; detached: number }>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await removeOrgUnit(c, id);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true, unplaced: r.value.unplaced, detached: r.value.detached };
}

/** Re-order a unit among its siblings. */
export async function moveOrgUnitAction(id: string, direction: MoveDirection): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await moveOrgUnit(c, { id, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 迁到… - a unit's own new parent, everything else about it unchanged. */
export async function reparentOrgUnitAction(id: string, parentId: string | null): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await reparentOrgUnit(c, { id, parentId });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * 关联区域 (incr/0055, owner 2026-09-11: 抽屉挂的是销售区域，跟区域设置的
 * 大区对不上 - 组织到大区应该直连，不绕销售区域) - from the UNIT's own
 * side, set exactly which 大区 it is directly linked to.
 * `desiredDivisionIds` is the complete new set, not a delta - empty means
 * 暂不关联. Unlike the territory version this used to be, `org_unit_division`
 * is its own pair table (0055), so this is one direct write instead of a
 * loop of whole-territory upserts.
 */
export async function setUnitDivisionsAction(
  unitId: string,
  desiredDivisionIds: readonly string[],
): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const accountCtx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  };
  const divisions = await listMarketDivisions(accountCtx);
  if (!divisions.ok) return { ok: false, error: divisions.violations[0]?.code ?? "denied" };
  const r = await setUnitDivisions(c, unitId, desiredDivisionIds, new Set(divisions.value.map((d) => d.id)));
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

export type ApplyStartupTemplateResult = StartupPresetResult;

/**
 * 应用模版 面板优化 (owner, 2026-09-11) - a thin session-resolving wrapper
 * around `applyStartupPreset` (`lib/startup-preset.ts`), which carries the
 * actual orchestration (组织架构 → 区域设置 → 销售区域 → org_unit_division,
 * in dependency order, cross-domain, no shared transaction - see that
 * file's own header comment for the full reasoning). Pulled out so the
 * new-workspace first-contact seed in `session.ts` can run the identical
 * sequence without resolving a second session (a Server Action always does,
 * and `session.ts` is what would be calling it).
 */
export async function applyStartupTemplateAction(input: {
  readonly orgKey: string;
  readonly divisionKey: string | null;
  readonly autoAssociate: boolean;
}): Promise<Result<ApplyStartupTemplateResult>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const accountCtx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  };

  const result = await applyStartupPreset(c, accountCtx, input);
  if (!result.ok) return result;
  revalidatePath("/", "layout");
  return result;
}

/* --- 单位类型 ---------------------------------------------------------------- */

export async function saveOrgKindAction(input: { code: string; name: string }): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await saveOrgKind(c, { kindCode: input.code, name: input.name });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function moveOrgKindAction(id: string, direction: MoveDirection): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await moveOrgKind(c, { id, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeOrgKindAction(id: string): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await removeOrgKind(c, id);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}
