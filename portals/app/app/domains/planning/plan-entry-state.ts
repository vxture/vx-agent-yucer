import type { PlanAction, PlanContent, PlanTarget, TeamAllocation } from "./plan-model";

export function prunePlanningBudgets(
  content: PlanContent,
  previous: PlanContent,
): PlanContent {
  return {
    ...content,
    budgets: content.budgets.filter(
      (budget) =>
        !previous.contributions.some((line) => line.budgetKey === budget.key) ||
        content.contributions.some((line) => line.budgetKey === budget.key),
    ),
  };
}

export function planningEntryLocked(
  content: PlanContent,
  locked: readonly string[],
  line: PlanTarget | TeamAllocation | PlanAction,
) {
  return content.periods.some((period) => {
    if (!locked.includes(period.key)) return false;
    if ("period" in line) return content.periods.some(
      child => child.key === line.period && period.start <= child.start && child.end <= period.end,
    );
    if ("due" in line) return period.start <= line.due && line.due < period.end;
    return line.start < period.end && period.start < line.end;
  });
}
