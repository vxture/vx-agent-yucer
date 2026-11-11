"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getCatalogStore, getPlanningStore } from "../../domains/shared/registry";
import { createTarget, removeTarget, updateTarget, listTerritories } from "../../domains/planning/service";
import { listMarketDivisions } from "../../domains/account/service";
import { salesRegionTerritories } from "../lib/sales-regions";
import {
  TARGET_METRICS,
  TARGET_STATUSES,
  type TargetMetric,
  type TargetScopeType,
  type TargetStatus,
} from "../../domains/planning/lib/target";

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

  if (input.scopeType === "territory") {
    const base = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement };
    const [territories, divisions] = await Promise.all([
      listTerritories({ ...base, store: getPlanningStore() }),
      listMarketDivisions({ ...base, store: session.stores.account() }),
    ]);
    if (!territories.ok) return { ok: false, error: territories.violations[0]?.code ?? "denied" };
    if (!divisions.ok) return { ok: false, error: divisions.violations[0]?.code ?? "denied" };
    if (!salesRegionTerritories(divisions.value, territories.value).some((t) => t.id === input.territoryId)) {
      return { ok: false, error: "region_unknown" };
    }
  }

  const result = await createTarget(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPlanningStore(),
      catalog: getCatalogStore(),
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
      // A number and a currency, not a Money. The service derives the unit from
      // the metric, so a count target cannot arrive carrying a currency.
      amount: input.amount,
      currency: input.currency,
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
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

  // `amount`, the key updateTarget reads (2026-09-27). This passed
  // `targetAmount: money(...)` inside an object spread - a key updateTarget
  // does not have, and a spread escapes the excess-property check - so every
  // 调整金额 returned ok and changed nothing. Written as a plain literal typed
  // against the service's own parameter, a wrong key is now a compile error.
  // The unit and currency are the stored target's; never taken from here.
  const servicePatch: Parameters<typeof updateTarget>[2] = {
    amount: patch.amount,
    status: patch.status !== undefined && isStatus(patch.status) ? patch.status : undefined,
  };
  const result = await updateTarget(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPlanningStore(),
    },
    id,
    servicePatch,
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }
  revalidatePath("/planning");
  return { ok: true };
}

export async function deleteSalesTarget(id: string): Promise<TargetResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const result = await removeTarget(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPlanningStore(),
    },
    id,
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/planning");
  return { ok: true };
}
