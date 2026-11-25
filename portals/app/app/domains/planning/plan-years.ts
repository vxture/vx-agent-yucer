import type { SalesPlan } from "./plan-model";
import { planVersions } from "./plan-state";
export type PlanningYearOption = { year: number; published: boolean; draft: boolean };
export function planningYearOption(plan: SalesPlan, at: string, includeDraft: boolean): PlanningYearOption | null {
  const state = planVersions(plan, at);
  const draft = includeDraft && !!state.draft;
  return state.current || draft ? { year: plan.year, published: !!state.current, draft } : null;
}
/** Preserve an explicit year. An unqualified entry finds an existing working year. */
export function preferredPlanningYear(options: readonly PlanningYearOption[], current = new Date().getUTCFullYear()) {
  const years = options.map(o => o.year);
  if (years.includes(current)) return current;
  return years.filter(y => y > current).sort((a,b) => a-b)[0] ?? years.sort((a,b) => b-a)[0] ?? current;
}
