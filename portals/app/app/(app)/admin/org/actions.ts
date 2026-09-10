"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { getPlanningStore } from "../../../domains/shared/registry";
import {
  applyOrgTemplate,
  moveOrgKind,
  moveOrgUnit,
  removeOrgKind,
  removeOrgUnit,
  saveOrgKind,
  upsertOrgUnit,
} from "../../../domains/planning/service";
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

/** Replace the tree with a shipped template. */
export async function applyOrgTemplateAction(key: string): Promise<Result<{ units: number; unplaced: number; detached: number }>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await applyOrgTemplate(c, key);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true, units: r.value.units, unplaced: r.value.unplaced, detached: r.value.detached };
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
