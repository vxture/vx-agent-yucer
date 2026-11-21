import type { PlanContent } from "./plan-model";

/** Validate the editable stage; regional history is preserved by the workflow guard. */
export function planningValidationContent(content: PlanContent): PlanContent {
  if (content.releaseScope !== "company") return content;
  return {
    ...content,
    targets: content.targets.filter((t) => t.scope === "workspace"),
    regions: [],
    budgets: [],
    contributions: [],
    team: [],
    actions: [],
    strategyAcceptances: content.strategyAcceptances?.map((x) => ({
      ...x,
      allocations: [],
    })),
  };
}
