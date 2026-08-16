"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getStrategyStore } from "../../domains/shared/registry";
import { transitionPlan } from "../../domains/strategy/service";
import { PLAN_STATUSES, type PlanStatus } from "../../domains/strategy/lib/lifecycle";

// Moving a plan through its lifecycle.
//
// The gate is chosen by the DESTINATION inside the service: approving checks
// strategy.plan.approve, every other move checks strategy.plan.update.
//
// Worth knowing rather than assuming: both action ids resolve to the same
// permission (strategy.write) in today's catalog, so the split is nominal - a
// member who may edit a plan may also approve it. Making approval a real
// separation of duties is a role-catalog change, not a change here.

export interface TransitionResult {
  ok: boolean;
  error?: string;
}

export async function movePlan(id: string, to: string): Promise<TransitionResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  if (!(PLAN_STATUSES as readonly string[]).includes(to)) {
    return { ok: false, error: "unknown_status" };
  }

  const result = await transitionPlan(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
    },
    id,
    to as PlanStatus,
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/strategy");
  return { ok: true };
}
