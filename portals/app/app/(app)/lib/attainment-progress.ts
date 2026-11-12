import type {
  AttainmentPlan,
  AttainmentTarget,
} from "../../domains/planning/attainment-plan";
import type {
  ForecastableOpportunity,
  ForecastSnapshotPoint,
} from "../../domains/pipeline/lib/forecast";
import { parseForecastScope } from "./forecast-scope";
import { revenuePool } from "./attainment-workspace";

export type ExecutionRow = {
  id: string;
  name: string;
  subtitle?: string;
  allocationExcess?: number;
  scope: string;
  period: string;
  target: AttainmentTarget | null;
  currency: string;
  closed: number | null;
  commit: number | null;
  open: number | null;
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
    open,
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

/** Reconcile the company target and business with the displayed geographic regions. */
export function unallocatedExecutionRow(input: {
  name: string;
  period: string;
  regionIds: readonly string[];
  deals: readonly ForecastableOpportunity[] | null;
  defaultCurrency: string;
  includeEmpty?: boolean;
  companyTarget?: AttainmentTarget | null;
  regionTargets?: readonly AttainmentTarget[];
}): ExecutionRow | null {
  const regions = new Set(input.regionIds);
  const company = input.companyTarget?.period === input.period && input.companyTarget.scope === "workspace"
    ? input.companyTarget : null;
  const targets = (input.regionTargets ?? []).filter((t) =>
    t.period === input.period && t.scope.startsWith("territory:") && regions.has(t.scope.slice(10)),
  );
  const comparable = targets.every((t) => t.currency === company?.currency);
  const remaining = company && comparable
    ? company.target - targets.reduce((sum, t) => sum + t.target, 0)
    : null;
  const tierRemainder = (tier: "floor" | "stretch") => {
    if (!company || remaining === null || company[tier] === null || targets.some((t) => t[tier] === null))
      return null;
    const value = company[tier]! - targets.reduce((sum, t) => sum + t[tier]!, 0);
    return value >= 0 && (tier === "floor" ? value <= Math.max(0, remaining) : value >= Math.max(0, remaining))
      ? value : null;
  };
  const target = company && remaining !== null ? {
    ...company,
    key: `${company.key}:unallocated`,
    scope: "unallocated",
    target: Math.max(0, remaining),
    floor: tierRemainder("floor"),
    stretch: tierRemainder("stretch"),
    baseline: null,
    baselineComparable: false,
  } : null;
  const row = executionRow({
    ...input,
    scope: "workspace",
    target,
    deals: input.deals?.filter((d) => !d.territoryId || !regions.has(d.territoryId)) ?? null,
  });
  const allocationExcess = remaining !== null && remaining < 0 ? -remaining : 0;
  // Show this group only when the selected period has actual unassigned income.
  // Empty subperiods stay available when expanding an already visible card.
  if (!input.includeEmpty && !(row.closed !== null && row.closed > 0))
    return null;
  return { ...row, id: `unallocated|${input.period}`, scope: "unallocated", allocationExcess,
    error: row.error || !!company && !comparable,
    currencyConflict: row.currencyConflict || !!company && !comparable,
  };
}

export function snapshotKey(
  snapshot: Pick<ForecastSnapshotPoint, "id" | "snapshotAt">,
) {
  return snapshot.id ?? snapshot.snapshotAt.toISOString();
}

export function snapshotAttainment(snapshot: ForecastSnapshotPoint) {
  const { basis } = snapshot;
  const target = basis?.target == null ? null : Number(basis.target);
  const ratio =
    target !== null && target > 0 && basis?.currency === snapshot.currency
      ? snapshot.closedAmount.amount / target
      : null;
  return { basis, target, ratio };
}

/** A met target shows the actual surplus, rather than a misleading zero gap. */
export function attainmentBalance(
  row: Pick<ExecutionRow, "target" | "closed">,
) {
  if (!row.target || row.closed === null)
    return { kind: "unknown" as const, amount: null };
  const delta = row.closed - row.target.target;
  return delta > 0
    ? { kind: "excess" as const, amount: delta }
    : { kind: "gap" as const, amount: Math.abs(delta) };
}

/** A single scale preserves the floor / target / stretch relationship. */
export function attainmentMilestones(
  row: Pick<ExecutionRow, "target" | "closed">,
) {
  const target = row.target?.target;
  if (target == null || target <= 0 || row.closed === null) return null;
  const floor = row.target!.floor;
  const stretch = row.target!.stretch;
  const hasFloor = floor !== null && floor >= 0 && floor <= target;
  const hasStretch = stretch !== null && stretch >= target;
  const maximum = Math.max(hasStretch ? stretch : target, row.closed);
  const milestones = [
    ...(hasFloor ? [{ tier: "floor" as const, amount: floor }] : []),
    { tier: "target" as const, amount: target },
    ...(hasStretch ? [{ tier: "stretch" as const, amount: stretch }] : []),
  ].map((m) => ({ ...m, position: (m.amount / maximum) * 100 }));
  const stage: "below" | "floor" | "target" | "stretch" = hasStretch && row.closed >= stretch
    ? "stretch"
    : row.closed >= target
      ? "target"
      : hasFloor && row.closed >= floor
        ? "floor"
        : "below";
  return { maximum, stage, milestones };
}
