import type {
  CustomerContribution,
  PlanAction,
  PlanContent,
  PlanTarget,
  TeamAllocation,
} from "../../domains/planning/plan-model";
import { demand, minor } from "../../domains/planning/plan-values";

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

// Removing an annual auxiliary metric also removes its time breakdown. Actions
// survive with their optional target link cleared; dangling references cannot save.
export function removePlanningTarget(content: PlanContent, target: PlanTarget) {
  const periods = new Set([target.period]);
  if (target.period === `Y${content.year}`) {
    for (let count = -1; count !== periods.size; ) {
      count = periods.size;
      for (const period of content.periods)
        if (period.parent && periods.has(period.parent))
          periods.add(period.key);
    }
  }
  const keys = new Set(
    content.targets
      .filter(
        (line) =>
          line.scope === target.scope &&
          line.metric === target.metric &&
          line.currency === target.currency &&
          periods.has(line.period),
      )
      .map((line) => line.key),
  );
  return prunePlanningBudgets(
    {
      ...content,
      targets: content.targets.filter((line) => !keys.has(line.key)),
      contributions: content.contributions.filter(
        (line) => !keys.has(line.targetKey),
      ),
      actions: content.actions.map((line) =>
        keys.has(line.targetKey ?? "") ? { ...line, targetKey: null } : line,
      ),
    },
    content,
  );
}

export function missingPlanningQuarters(
  content: PlanContent,
  scope: string,
  locked: readonly string[] = [],
) {
  const annual = content.targets.filter(
    (line) => line.scope === scope && line.period === `Y${content.year}`,
  );
  return annual.flatMap((base) =>
    content.periods
      .filter(
        (period) =>
          period.parent === base.period &&
          /^\d{4}Q[1-4]$/.test(period.key) &&
          !locked.includes(period.key) &&
          !content.targets.some(
            (line) =>
              line.scope === scope &&
              line.period === period.key &&
              line.metric === base.metric &&
              line.currency === base.currency,
          ),
      )
      .map((period) => ({
        ...base,
        period: period.key,
        floor: null,
        target: null,
        stretch: null,
        note: "",
      })),
  );
}

export function excludePlanningRegion(content: PlanContent, regionId: string) {
  const removed = new Set(
    content.targets
      .filter((line) => line.scope === `territory:${regionId}`)
      .map((line) => line.key),
  );
  return prunePlanningBudgets(
    {
      ...content,
      regions: content.regions.map((region) =>
        region.id === regionId
          ? { ...region, included: false, ownerSub: null }
          : region,
      ),
      targets: content.targets.filter((line) => !removed.has(line.key)),
      contributions: content.contributions.filter(
        (line) => line.regionId !== regionId,
      ),
      team: content.team.filter((line) => line.regionId !== regionId),
      actions: content.actions.filter((line) => line.regionId !== regionId),
    },
    content,
  );
}

export function validPlanningDate(value: string) {
  const time = Date.parse(value);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value
  );
}

export function validatePlanningContribution(
  content: PlanContent,
  line: CustomerContribution,
) {
  const budget = content.budgets.find((item) => item.key === line.budgetKey);
  const target = content.targets.find((item) => item.key === line.targetKey);
  demand(
    budget &&
      target &&
      target.scope === `territory:${line.regionId}` &&
      budget.period === target.period &&
      budget.metric === target.metric &&
      budget.currency === target.currency,
    "invalid_contribution",
  );
  demand(
    !content.contributions.some(
      (item) =>
        item.key !== line.key &&
        item.budgetKey === line.budgetKey &&
        item.targetKey === line.targetKey,
    ),
    "duplicate_line",
  );
  const siblings = content.contributions.filter(
    (item) => item.key !== line.key,
  );
  const sum = (rows: CustomerContribution[]) =>
    rows.reduce(
      (total, item) => total + minor(item.amount),
      minor(line.amount),
    );
  demand(
    sum(siblings.filter((item) => item.budgetKey === budget.key)) <=
      minor(budget.amount),
    "budget_overallocated",
  );
  if (target.target !== null)
    demand(
      sum(siblings.filter((item) => item.targetKey === target.key)) <=
        minor(target.target),
      "contribution_overallocated",
    );
}

export function validatePlanningTeam(
  content: PlanContent,
  line: TeamAllocation,
) {
  demand(
    line.role.trim() &&
      validPlanningDate(line.start) &&
      validPlanningDate(line.end) &&
      `${content.year}-01-01` <= line.start &&
      line.start < line.end &&
      line.end <= `${content.year + 1}-01-01` &&
      Number.isFinite(line.percent) &&
      line.percent >= 0 &&
      line.percent <= 100,
    "invalid_resource",
  );
  demand(
    line.memberSub
      ? line.requestedFte === null
      : line.requestedFte !== null && minor(line.requestedFte) > 0n,
    "invalid_resource",
  );
}

export function validatePlanningAction(content: PlanContent, line: PlanAction) {
  demand(
    line.objective.trim() &&
      line.ownerSub &&
      validPlanningDate(line.due) &&
      `${content.year}-01-01` <= line.due &&
      line.due < `${content.year + 1}-01-01`,
    "invalid_action",
  );
}

export function planningEntryLocked(
  content: PlanContent,
  locked: readonly string[],
  line: PlanTarget | TeamAllocation | PlanAction,
) {
  return content.periods.some(
    (period) =>
      locked.includes(period.key) &&
      ("period" in line
        ? content.periods.some(
            (child) =>
              child.key === line.period &&
              period.start <= child.start &&
              child.end <= period.end,
          )
        : "due" in line
          ? period.start <= line.due && line.due < period.end
          : line.start < period.end && period.start < line.end),
  );
}

export function planningReleaseTimeError(
  value: string,
  year: number,
  now: number,
) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "invalid_period";
  if (time <= now) return "retroactive_release";
  if (time >= Date.UTC(year + 1, 0, 1)) return "effective_outside_period";
  return null;
}
