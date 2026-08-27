"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getPlanningStore } from "../../domains/shared/registry";
import { createTarget, updateTarget } from "../../domains/planning/service";
import {
  TARGET_METRICS,
  TARGET_STATUSES,
  type TargetMetric,
  type TargetScopeType,
  type TargetStatus,
} from "../../domains/planning/lib/target";
import { money } from "../../domains/shared/money";

// Setting and adjusting a quota.
//
// `createTarget` and `updateTarget` had no action file at all, which the table
// said out loud - planning-table.tsx carried a comment explaining there was
// nothing for a menu to call. The consequence was not a missing button: with
// `sales_target` empty, `attainment()` has no DENOMINATOR, and it has eight
// callers. Every attainment reading in the product was resting on seed data.
//
// TWO DIFFERENT GESTURES, and the table's own comment already argued for the
// split. Creating a target is a FORM - it needs a period, a scope, a metric and
// an amount, and none of those exist until you type them. Adjusting one is a
// ROW action - the number is on screen and you are changing that number. A
// three-dot menu is the wrong doorway for the first and the right one for the
// second.

export interface TargetResult {
  ok: boolean;
  error?: string;
}

function isMetric(v: string): v is TargetMetric {
  return (TARGET_METRICS as readonly string[]).includes(v);
}
function isStatus(v: string): v is TargetStatus {
  return (TARGET_STATUSES as readonly string[]).includes(v);
}

export async function createSalesTarget(input: {
  period: string;
  scopeType: TargetScopeType;
  territoryId: string | null;
  metric: string;
  amount: number;
  currency?: string;
}): Promise<TargetResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  if (!isMetric(input.metric)) return { ok: false, error: "unknown_metric" };

  const result = await createTarget(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPlanningStore(),
    },
    {
      scope: {
        period: input.period,
        scopeType: input.scopeType,
        // The scope tuple is the target's IDENTITY, and validateTargetScope
        // rejects a tuple carrying a key its type does not use. So these are
        // explicit nulls rather than omissions: a workspace target that quietly
        // kept a territory id would be a different target than it claims.
        territoryId: input.scopeType === "territory" ? input.territoryId : null,
        ownerSub: input.scopeType === "owner" ? session.user.sub : null,
        metric: input.metric,
      },
      targetAmount: money(input.amount, input.currency),
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.violations.map((v) => v.message).join("; ") };
  }
  revalidatePath("/planning");
  return { ok: true };
}

export async function updateSalesTarget(
  id: string,
  patch: { amount?: number; currency?: string; status?: string },
): Promise<TargetResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  if (patch.status !== undefined && !isStatus(patch.status)) {
    return { ok: false, error: "unknown_status" };
  }

  const result = await updateTarget(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPlanningStore(),
    },
    id,
    {
      ...(patch.amount !== undefined
        ? { targetAmount: money(patch.amount, patch.currency) }
        : {}),
      ...(patch.status !== undefined && isStatus(patch.status)
        ? { status: patch.status }
        : {}),
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.violations.map((v) => v.message).join("; ") };
  }
  revalidatePath("/planning");
  return { ok: true };
}
