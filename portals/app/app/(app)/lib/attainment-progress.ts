import type {
  AttainmentPlan,
  AttainmentTarget,
} from "../../domains/planning/attainment-plan";
import type {
  ForecastableOpportunity,
  AttainmentReportPoint,
} from "../../domains/pipeline/lib/forecast";
import { parseForecastScope } from "./forecast-scope";
import { revenuePool } from "./attainment-workspace";

export type ExecutionRow = {
  id: string;
  name: string;
  scope: string;
  period: string;
  target: AttainmentTarget | null;
  currency: string;
  closed: number | null;
  commit: number | null;
  gap: number | null;
  ratio: number | null;
  coverage: number | null;
  undated: number;
  currencyConflict: boolean;
  error: boolean;
};

export type SupportDeal = Pick<
  ForecastableOpportunity,
  "id" | "accountId" | "ownerSub" | "territoryId" | "amount" | "closedAt"
>;

// The page can read the company projection to build its chooser; a personal
// or regional response carries only the selected view's support payload.
export function scopePlanSupport(
  plan: AttainmentPlan,
  scope: string,
  includeSupport = true,
): AttainmentPlan {
  const personal = scope.startsWith("owner:") ? scope.slice(6) : null;
  const region = scope.startsWith("territory:") ? scope.slice(10) : null;
  const contributions =
    includeSupport && !personal
      ? plan.support.contributions.filter(
          (c) => !region || c.regionId === region,
        )
      : [];
  const keys = new Set(contributions.map((c) => c.budgetKey));
  return {
    ...plan,
    historical: [],
    targets: plan.targets.filter(
      (t) => scope === "workspace" || t.scope === scope,
    ),
    regions: personal
      ? []
      : plan.regions.filter((r) => !region || r.id === region),
    support: {
      contributions,
      budgets: plan.support.budgets.filter((b) => keys.has(b.key)),
      team: includeSupport
        ? plan.support.team.filter(
            (t) =>
              (!region || t.regionId === region) &&
              (!personal || t.memberSub === personal),
          )
        : [],
      actions: includeSupport
        ? plan.support.actions.filter(
            (a) =>
              (!region || a.regionId === region) &&
              (!personal || a.ownerSub === personal),
          )
        : [],
    },
  };
}

export function executionRow(input: {
  name: string;
  scope: string;
  period: string;
  target: AttainmentTarget | null;
  deals: readonly ForecastableOpportunity[] | null;
  defaultCurrency: string;
}): ExecutionRow {
  const { name, scope, period, target, deals } = input;
  const currency = target?.currency ?? input.defaultCurrency;
  const slice = deals
    ? revenuePool(deals, period, parseForecastScope(scope), currency)
    : null;
  const totals = slice?.totals.ok ? slice.totals.value : null;
  const closed = totals?.closedAmount.amount ?? null;
  const gap =
    target && closed !== null ? Math.max(0, target.target - closed) : null;
  const open = totals
    ? totals.commitAmount.amount +
      totals.bestCaseAmount.amount +
      totals.pipelineAmount.amount
    : null;
  return {
    id: `${scope}|${period}`,
    name,
    scope,
    period,
    target,
    currency,
    closed,
    commit: totals?.commitAmount.amount ?? null,
    gap,
    ratio:
      target && target.target > 0 && closed !== null
        ? closed / target.target
        : null,
    coverage: gap !== null && gap > 0 && open !== null ? open / gap : null,
    undated: slice?.undated ?? 0,
    currencyConflict:
      !!slice &&
      !slice.totals.ok &&
      slice.totals.violations.some((v) => v.code === "currency_mismatch"),
    error: !totals,
  };
}

export function snapshotKey(
  snapshot: Pick<AttainmentReportPoint, "id" | "snapshotAt">,
) {
  return snapshot.id ?? snapshot.snapshotAt.toISOString();
}

export function reportedAttainment(snapshot: AttainmentReportPoint) {
  const { basis } = snapshot;
  const target = basis?.target == null ? null : Number(basis.target);
  const ratio =
    target !== null && target > 0 && basis?.currency === snapshot.currency
      ? snapshot.closedAmount.amount / target
      : null;
  return { basis, target, ratio };
}
