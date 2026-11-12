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
import type { DataScope } from "../../authz/scope";
import { canReadReportingScope } from "../../authz/forecast-scope";

export const ATTAINMENT_VIEWS = ["progress", "review", "history"] as const;
export type AttainmentView = (typeof ATTAINMENT_VIEWS)[number];
export type AttainmentQuery = {
  period?: string | string[];
  scope?: string | string[];
  view?: string | string[];
  snapshot?: string | string[];
  planRevision?: string | string[];
};

export function resolveAttainmentQuery(
  query: AttainmentQuery,
  sub: string,
  access: DataScope = { kind: "workspace" },
) {
  const rawScope =
    typeof query.scope === "string"
      ? query.scope
      : access.kind === "workspace"
        ? "workspace"
        : (!query.view || query.view === "progress") &&
            access.kind !== "own" &&
            access.territoryIds.length
          ? "team"
          : "personal";
  const personal = rawScope === "personal";
  const scope: ForecastScope = personal
    ? { scopeType: "owner", ownerSub: sub, territoryId: null }
    : parseForecastScope(rawScope);
  const period =
    typeof query.period === "string" && periodRange(query.period)
      ? normalizeAttainmentPeriod(query.period)
      : "all";
  const view = ATTAINMENT_VIEWS.includes(query.view as AttainmentView)
    ? (query.view as AttainmentView)
    : "progress";
  const teamOverview =
    view === "progress" && (rawScope === "team" || rawScope === "workspace");
  // A restricted team overview is a collection of authorized regional rows,
  // never a new reporting scope or permission to submit a company snapshot.
  const visibleTeam =
    access.kind !== "own" &&
    (access.kind === "workspace" || access.territoryIds.length > 0);
  return {
    period,
    view,
    teamOverview,
    scope,
    scopeKey: forecastScopeKey(scope),
    selection: personal
      ? "personal"
      : rawScope === "team" && teamOverview && access.kind !== "workspace"
        ? "team"
        : forecastScopeKey(scope),
    personal,
    snapshot: typeof query.snapshot === "string" ? query.snapshot : null,
    planRevision:
      typeof query.planRevision === "string" ? query.planRevision : null,
    invalid:
      (!(teamOverview && rawScope === "team" && visibleTeam) &&
        !canReadReportingScope(access, scope, sub)) ||
      Array.isArray(query.scope) ||
      (typeof query.scope === "string" &&
        !personal &&
        rawScope !== "team" &&
        query.scope !== forecastScopeKey(scope)) ||
      Array.isArray(query.snapshot) ||
      Array.isArray(query.planRevision),
  };
}

export function attainmentHref({
  period = "all",
  scope = "workspace",
  view = "progress",
  snapshot,
  planRevision,
}: {
  period?: string;
  scope?: string;
  view?: AttainmentView;
  snapshot?: string | null;
  planRevision?: string | null;
} = {}) {
  const query = new URLSearchParams({ period, scope, view });
  if (snapshot) query.set("snapshot", snapshot);
  if (planRevision) query.set("planRevision", planRevision);
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
        normalizeAttainmentPeriod(t.period) ===
          normalizeAttainmentPeriod(period) &&
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
        .map((t) => normalizeAttainmentPeriod(t.period)),
    ),
  ].sort(
    (a, b) =>
      (periodRange(b)?.start.getTime() ?? 0) -
        (periodRange(a)?.start.getTime() ?? 0) || b.localeCompare(a),
  );
}

export function normalizeAttainmentPeriod(period: string) {
  const label = period.trim().toUpperCase();
  return /^Y?\d{4}$/.test(label) ? `Y${label.replace(/^Y/, "")}` : label;
}

export function compareAttainmentPeriods(a: string, b: string) {
  const yearA = Number(a.replace(/^Y/, "").slice(0, 4));
  const yearB = Number(b.replace(/^Y/, "").slice(0, 4));
  if (yearA !== yearB) return yearB - yearA;
  if (/^Y?\d{4}$/.test(a) !== /^Y?\d{4}$/.test(b))
    return /^Y?\d{4}$/.test(a) ? -1 : 1;
  return a.localeCompare(b);
}

export function planningHref(
  year: number,
  region?: string | null,
  revision?: string | null,
  period?: string | null,
) {
  const query = new URLSearchParams({ year: String(year) });
  if (region) query.set("region", region);
  if (revision) query.set("revision", revision);
  if (period) query.set("period", period);
  return `/planning?${query}`;
}

export function legacyForecastHref(
  query: AttainmentQuery,
  sub: string,
  defaultPeriod: string,
  access?: DataScope,
) {
  const selection = resolveAttainmentQuery(
    { ...query, period: query.period ?? defaultPeriod, view: "review" },
    sub,
    access,
  );
  return attainmentHref({
    period: selection.period,
    scope: selection.invalid ? "personal" : selection.selection,
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
