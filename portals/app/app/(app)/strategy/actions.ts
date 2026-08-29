"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getStrategyStore } from "../../domains/shared/registry";
import { createPlan, transitionPlan, upsertSegment } from "../../domains/strategy/service";
import {
  PLAN_STATUSES,
  SEGMENT_STATUSES,
  type PlanStatus,
  type SegmentStatus,
} from "../../domains/strategy/lib/lifecycle";

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

/**
 * Creating a plan.
 *
 * The neighbour of `movePlan` above, which shipped first and could only ever
 * move plans that db-init had put there (TD-016).
 */
export async function createStrategyPlan(input: {
  planNo: string;
  name: string;
  period: string;
  objective: string | null;
  ownerSub: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await createPlan(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
    },
    input,
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath("/strategy");
  return { ok: true };
}

/**
 * Creating or editing a market segment.
 *
 * By CODE, not by id. `campaign.segment_id` is a real foreign key, but
 * `account.segment_code` points here by plain string with nothing enforcing it -
 * so the code is the identity, and an edit finds the row by it and leaves it
 * alone. The column locks agree: segment_code carries no UPDATE grant.
 */
export async function saveSegment(input: {
  segmentCode: string;
  name: string;
  planId: string | null;
  priority: number;
  status: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  // Narrowed here rather than cast. This is the edge where a value typed only
  // as `string` by the browser becomes one the rule layer can reason about, and
  // the same check movePlan does above for the same reason.
  if (!(SEGMENT_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: "unknown_status" };
  }

  const result = await upsertSegment(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getStrategyStore(),
    },
    { ...input, status: input.status as SegmentStatus },
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath("/strategy");
  return { ok: true };
}
