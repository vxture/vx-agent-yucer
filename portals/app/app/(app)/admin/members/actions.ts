"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../../lib/session";
import { getAuthzStore } from "../../../authz/store";
import {
  assignRole,
  deactivateMember,
  reactivateMember,
  revokeRole,
} from "../../../authz/admin";

// Granting and removing roles.
//
// The administrator is the SESSION subject, never a parameter. The target is a
// parameter, because granting someone else a role is the entire point - but the
// person doing it is not something a request gets to assert.

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

export async function grantMemberRole(sub: string, role: string): Promise<RoleChangeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await assignRole(ctx(session), sub, role);
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

  // The whole shell depends on roles - the nav itself is derived from them - so
  // a role change invalidates every page, not just this one.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeMemberRole(sub: string, role: string): Promise<RoleChangeResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await revokeRole(ctx(session), sub, role);
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

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
