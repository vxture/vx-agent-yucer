import type { PlanContent } from "../../domains/planning/plan-model";
import { planningDraftScope, type PlanningDraftPatch } from "../../domains/planning/plan-assist-draft";
import { updatePlanningAmount } from "./planning-autofill";

export function applyPlanningDraft(content: PlanContent, patch: PlanningDraftPatch, regionId?: string, locked: readonly string[] = []) {
  const scope = planningDraftScope(content, regionId);
  if (!scope) return content;
  let next = structuredClone(content);
  const rows = [...patch.targets].sort((a, b) => Number(b.metric === "revenue") - Number(a.metric === "revenue"));
  for (const row of rows) {
    let target = next.targets.find(t => t.scope === scope && t.period === `Y${content.year}` && t.metric === row.metric);
    if (!target) {
      const revenue = next.targets.find(t => t.scope === scope && t.period === `Y${content.year}` && t.metric === "revenue");
      if (!revenue) continue;
      target = { ...revenue, key: crypto.randomUUID(), metric: row.metric, currency: row.metric === "new_logo" ? null : revenue.currency, floor: null, target: null, stretch: null, note: "" };
      next.targets.push(target);
    }
    next = updatePlanningAmount(next, target.key, "target", row.value, locked);
  }
  for (const key of ["assumptions", "allocationNote", "capacityNote"] as const)
    if (patch[key] !== undefined) next[key] = patch[key];
  return next;
}
