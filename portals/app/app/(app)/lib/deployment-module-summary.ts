import type { PlanContent } from "../../domains/planning/plan-model";
import type { FocusRow } from "../../domains/planning/focus-model";
import { focusNeedsAttention } from "../../domains/planning/focus-attention";

export function salesPlanningModuleSummary(content: PlanContent) {
  const annual = `Y${content.year}`;
  const revenues = content.targets.filter(target => target.scope === "workspace" && target.period === annual && target.metric === "revenue");
  const revenue = revenues.length === 1 ? revenues[0] : null;
  const regions = content.regions.filter(region => region.included);
  return { revenue: revenue?.target ?? null, currency: revenue?.currency ?? null, ambiguous: revenues.length > 1,
    regions: regions.length, withoutOwner: regions.filter(region => !region.ownerSub).length };
}

export function focusModuleSummary(rows: readonly FocusRow[]) {
  const customers = [...new Map(rows.map(row => [row.id, row])).values()];
  return {
    total: customers.length,
    missingRevenue: customers.filter(row => !row.revenue.length).length,
    attention: customers.filter(focusNeedsAttention).length,
    unknown: customers.filter(row => row.coverage.state !== "ready").length,
  };
}
