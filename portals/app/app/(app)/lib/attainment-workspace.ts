import {
  inPeriod,
  inScope,
  rollUp,
  type ForecastableOpportunity,
  type ForecastScope,
} from "../../domains/pipeline/lib/forecast";
import type { SalesTarget } from "../../domains/planning/lib/target";
import { periodRange } from "../../domains/shared/period";
import { forecastScopeKey, parseForecastScope } from "./forecast-scope";

export const ATTAINMENT_VIEWS = ["progress", "review", "history"] as const;
export type AttainmentView = (typeof ATTAINMENT_VIEWS)[number];
export type AttainmentQuery = {
  period?: string | string[];
  scope?: string | string[];
  view?: string | string[];
};

export function resolveAttainmentQuery(query: AttainmentQuery, sub: string) {
  const rawScope = typeof query.scope === "string" ? query.scope : "workspace";
  const personal = rawScope === "personal";
  const scope: ForecastScope = personal
    ? { scopeType: "owner", ownerSub: sub, territoryId: null }
    : parseForecastScope(rawScope);
  const period =
    typeof query.period === "string" && periodRange(query.period)
      ? query.period
      : "all";
  const view = ATTAINMENT_VIEWS.includes(query.view as AttainmentView)
    ? (query.view as AttainmentView)
    : "progress";
  return {
    period,
    view,
    scope,
    scopeKey: forecastScopeKey(scope),
    selection: personal ? "personal" : forecastScopeKey(scope),
    personal,
  };
}

export function attainmentHref({
  period = "all",
  scope = "workspace",
  view = "progress",
}: { period?: string; scope?: string; view?: AttainmentView } = {}) {
  const query = new URLSearchParams({ period, scope, view });
  return `/attainment?${query.toString()}`;
}

export function sameRevenueScope(
  target: Pick<SalesTarget, "scopeType" | "ownerSub" | "territoryId">,
  scope: ForecastScope,
) {
  return (
    target.scopeType === scope.scopeType &&
    target.ownerSub === scope.ownerSub &&
    target.territoryId === scope.territoryId
  );
}

export function revenueTarget<T extends SalesTarget>(
  targets: readonly T[],
  period: string,
  scope: ForecastScope,
): T | null {
  return (
    targets.find(
      (t) =>
        t.period === period &&
        t.status !== "draft" &&
        t.metric === "revenue" &&
        sameRevenueScope(t, scope),
    ) ?? null
  );
}

// Periods are rows, not additive amounts: a year can contain four quarters.
export function revenuePeriods(
  targets: readonly SalesTarget[],
  scope: ForecastScope,
) {
  return [
    ...new Set(
      targets
        .filter(
          (t) =>
            t.status !== "draft" &&
            t.metric === "revenue" &&
            sameRevenueScope(t, scope),
        )
        .map((t) => t.period),
    ),
  ].sort(
    (a, b) =>
      (periodRange(b)?.start.getTime() ?? 0) -
        (periodRange(a)?.start.getTime() ?? 0) || b.localeCompare(a),
  );
}

export function legacyForecastHref(
  query: AttainmentQuery,
  sub: string,
  defaultPeriod: string,
) {
  const selection = resolveAttainmentQuery(
    { ...query, period: query.period ?? defaultPeriod, view: "review" },
    sub,
  );
  return attainmentHref({
    period: selection.period,
    scope: selection.selection,
    view: "review",
  });
}

export function revenuePool<T extends ForecastableOpportunity>(
  deals: readonly T[],
  period: string,
  scope: ForecastScope,
  currency: string,
) {
  const scoped = inScope(deals, scope);
  const window = inPeriod(scoped, period);
  if (!window) return null;
  const ids = new Set(window.kept.map((d) => d.id));
  const included = deals.filter((d) => ids.has(d.id));
  return {
    included,
    open: included.filter((d) => d.status === "open"),
    undated: window.undated,
    totals: rollUp(included, currency),
  };
}
