"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { closeAccountPlan, reopenAccountPlan } from "../../domains/account/service";

// Closing and reopening a customer's plan (owner, 2026-10-02: 可以关闭，可以
// 重开，原因选填). Its own action file so the plan codes stay apart from the
// other account actions' (see domains/account/lib/plan-lifecycle.ts).

type Result = { ok: boolean; error?: string };

function context(session: NonNullable<Awaited<ReturnType<typeof resolveAppSession>>>) {
  return {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    // The member's OWN scoped store: a customer they cannot see reads as not found.
    store: session.stores.account(),
  };
}

export async function closeAccountPlanAction(accountId: string, reason: string | null): Promise<Result> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await closeAccountPlan(context(session), accountId, reason);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath(`/account/${accountId}`);
  revalidatePath("/named");
  return { ok: true };
}

export async function reopenAccountPlanAction(accountId: string): Promise<Result> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await reopenAccountPlan(context(session), accountId);
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath(`/account/${accountId}`);
  revalidatePath("/named");
  return { ok: true };
}
