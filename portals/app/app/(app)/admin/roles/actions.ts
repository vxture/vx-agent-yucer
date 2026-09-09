"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { getAuthzStore } from "../../../authz/store";
import { moveRole, removeRole, resetPresetRoles, saveRole } from "../../../authz/roles";
import type { MoveDirection } from "../../../domains/shared/ordering";

/* 角色管理 的写入路径 (incr/0046).
 *
 * Returns the violation CODE, never its sentence: the rule layer writes its
 * messages for its own reader, and the interface looks the code up in
 * ROLE_ERROR (TD-010).
 *
 * EVERY WRITE INVALIDATES THE WHOLE LAYOUT, like a member's role change does:
 * what a role holds drives the navigation of everybody holding it, and the
 * roster on /admin/members and the columns of /admin/permissions read the
 * same rows.
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
    store: getAuthzStore(),
  };
}

export async function saveRoleAction(input: {
  code: string;
  name: string;
  description: string;
  permissions: string[];
}): Promise<Result<{ code: string }>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await saveRole(c, input);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true, code: r.value.code };
}

export async function removeRoleAction(code: string): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await removeRole(c, code);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Re-order the roles; the order is global. */
export async function moveRoleAction(code: string, direction: MoveDirection): Promise<Result<object>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await moveRole(c, { code, direction });
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Put the nine presets back the way the catalogue seeds them. */
export async function resetPresetRolesAction(): Promise<Result<{ restored: number }>> {
  const c = await ctx();
  if (!c) return { ok: false, error: "not_authenticated" };
  const r = await resetPresetRoles(c);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/", "layout");
  return { ok: true, restored: r.value.restored };
}
