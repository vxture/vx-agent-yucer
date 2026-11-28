import type { AccountRecord } from "../../account/store";
import {
  customerVintage,
  type CooperationAssertion,
} from "../../account/lib/cooperation";
import type { AttainmentMetricTarget } from "../../planning/attainment-plan";
import type { OpportunityRecord } from "../store";
import { periodRange, within } from "../../shared/period";
import { sumMoney } from "../../shared/money";

export type AnalysisDeal = Pick<
  OpportunityRecord,
  | "id"
  | "opportunityNo"
  | "name"
  | "accountId"
  | "ownerSub"
  | "territoryId"
  | "status"
  | "stage"
  | "forecastCategory"
  | "amount"
  | "currency"
> & {
  expectedCloseAt: string | null;
  closedAt: string | null;
};
export type AnalysisAccount = Pick<
  AccountRecord,
  "id" | "name" | "accountNo" | "ownerSub" | "status" | "tier" | "regionId"
>;
export type DataState =
  "ready" | "unknown" | "failed" | "denied" | "currency_conflict";
export type MetricFact = {
  value: number | null;
  state: DataState;
  missing: number;
};
export type AnalysisScope = {
  key: string;
  name: string;
  accountIds?: readonly string[];
};
export type AnalysisRow = {
  key: string;
  name: string;
  scope: string;
  period: string;
  currency: string;
  target: AttainmentMetricTarget | null;
  closed: MetricFact;
  open: MetricFact;
  commit: MetricFact;
  gap: number | null;
  difference: number | null;
  rate: number | null;
  coverage: number | null;
  undated: number;
  pending: number;
};
export function serializeAnalysisDeal(d: OpportunityRecord): AnalysisDeal {
  const {
    id,
    opportunityNo,
    name,
    accountId,
    ownerSub,
    territoryId,
    status,
    stage,
    forecastCategory,
    amount,
    currency,
  } = d;
  return {
    id,
    opportunityNo,
    name,
    accountId,
    ownerSub,
    territoryId,
    status,
    stage,
    forecastCategory,
    amount,
    currency,
    expectedCloseAt: d.expectedCloseAt?.toISOString() ?? null,
    closedAt: d.closedAt?.toISOString() ?? null,
  };
}
export function dealMatches(d: AnalysisDeal, scope: string) {
  return (
    scope === "workspace" ||
    (scope.startsWith("territory:")
      ? d.territoryId === scope.slice(10)
      : scope.startsWith("owner:") && d.ownerSub === scope.slice(6))
  );
}
export function selectedDeals(
  deals: readonly AnalysisDeal[],
  scope: string,
  period: string,
) {
  const range = periodRange(period);
  if (!range) return [];
  return deals.filter(
    (d) =>
      dealMatches(d, scope) &&
      (d.status === "open" || d.status === "won") &&
      within(
        range,
        d.status === "won"
          ? d.closedAt
            ? new Date(d.closedAt)
            : null
          : d.expectedCloseAt
            ? new Date(d.expectedCloseAt)
            : null,
      ),
  );
}
function amountFact(
  deals: readonly AnalysisDeal[] | null,
  currency: string,
  unavailable: "failed" | "denied" = "failed",
): MetricFact {
  if (!deals) return { value: null, state: unavailable, missing: 0 };
  const missing = deals.filter((d) => !d.amount).length;
  const sum = sumMoney(
    deals.flatMap((d) => (d.amount ? [d.amount] : [])),
    currency,
  );
  if (!sum.ok) return { value: null, state: "currency_conflict", missing };
  // An unpriced deal is not a zero-value deal. Keep the known subtotal in evidence,
  // and withhold the aggregate/rate until the set is complete.
  return {
    value: missing ? null : sum.value.amount,
    state: missing ? "unknown" : "ready",
    missing,
  };
}
export function analysisRow(input: {
  scope: string;
  name: string;
  period: string;
  currency: string;
  targets: readonly AttainmentMetricTarget[];
  deals: readonly AnalysisDeal[] | null;
  observedAt: string;
  unavailable?: "failed" | "denied";
}): AnalysisRow {
  const { scope, name, period, targets, deals, observedAt } = input;
  const target =
    targets.find(
      (t) =>
        t.scope === scope &&
        t.period === period &&
        t.metric === "revenue" &&
        t.currency === input.currency,
    ) ?? null;
  const currency = target?.currency ?? input.currency;
  const slice = deals ? selectedDeals(deals, scope, period) : null;
  let closed = amountFact(
    slice?.filter((d) => d.status === "won") ?? null,
    currency,
    input.unavailable,
  );
  const undatedWins =
    deals?.filter(
      (d) => dealMatches(d, scope) && d.status === "won" && !d.closedAt,
    ).length ?? 0;
  if (
    undatedWins &&
    closed.state !== "failed" &&
    closed.state !== "denied" &&
    closed.state !== "currency_conflict"
  )
    closed = {
      value: null,
      state: "unknown",
      missing: closed.missing + undatedWins,
    };
  const open = amountFact(
    slice?.filter((d) => d.status === "open") ?? null,
    currency,
    input.unavailable,
  );
  const commit = amountFact(
    slice?.filter(
      (d) => d.status === "open" && d.forecastCategory === "commit",
    ) ?? null,
    currency,
    input.unavailable,
  );
  const difference =
    closed.value !== null && target
      ? round(closed.value - target.target)
      : null;
  const gap = difference === null ? null : Math.max(0, -difference);
  return {
    key: `${scope}|${period}`,
    name,
    scope,
    period,
    currency,
    target,
    closed,
    open,
    commit,
    difference,
    gap,
    rate:
      target && target.target > 0 && closed.value !== null
        ? closed.value / target.target
        : null,
    coverage:
      gap !== null && gap > 0 && open.value !== null ? open.value / gap : null,
    undated:
      deals?.filter(
        (d) =>
          dealMatches(d, scope) &&
          ((d.status === "open" && !d.expectedCloseAt) ||
            (d.status === "won" && !d.closedAt)),
      ).length ?? 0,
    pending:
      deals?.filter(
        (d) =>
          dealMatches(d, scope) &&
          d.status === "open" &&
          (!d.expectedCloseAt ||
            (slice?.some((s) => s.id === d.id) &&
              (!d.amount || d.expectedCloseAt < observedAt))),
      ).length ?? 0,
  };
}
const round = (v: number) => Math.round(v * 100) / 100;
export function tierProgress(
  actual: number | null,
  target: Pick<AttainmentMetricTarget, "floor" | "target" | "stretch"> | null,
) {
  if (actual === null || !target || target.target < 0) return null;
  const marks = (
    [
      ["floor", target.floor],
      ["target", target.target],
      ["stretch", target.stretch],
    ] as const
  ).flatMap(([key, value]) =>
    value !== null && value >= 0 ? [{ key, value }] : [],
  );
  const maximum = Math.max(actual, ...marks.map((m) => m.value), 1) * 1.08;
  const stage =
    target.stretch !== null && actual >= target.stretch
      ? "stretch"
      : actual >= target.target
        ? "target"
        : target.floor !== null && actual >= target.floor
          ? "floor"
          : "below";
  return {
    maximum,
    stage,
    marks: marks.map((m) => ({ ...m, position: (m.value / maximum) * 100 })),
  };
}
export function rollingDifferences(
  rows: readonly AnalysisRow[],
  enabled: boolean,
  observedAt: string,
) {
  let carry: number | null = 0;
  let previousEnd: string | null = null;
  return rows.map((row, index) => {
    const range = periodRange(row.period);
    const settled = !!range && range.end.toISOString() <= observedAt;
    const original = row.difference;
    if (enabled && previousEnd && range?.start.toISOString() !== previousEnd)
      carry = null;
    const incoming = enabled ? carry : 0;
    const effective =
      original === null || incoming === null
        ? null
        : round(original + incoming);
    if (enabled) carry = settled ? effective : 0;
    previousEnd = range?.end.toISOString() ?? null;
    const next = rows[index + 1],
      nextRange = next ? periodRange(next.period) : null;
    const available =
      !!nextRange &&
      nextRange.start.toISOString() === previousEnd &&
      next.difference !== null;
    const transferable =
      enabled && settled && effective !== null && effective !== 0;
    return {
      key: row.key,
      original,
      incoming,
      effective,
      settled,
      transferred: transferable && available,
      awaitingNext: transferable && !available,
    };
  });
}
export function customerComposition(input: {
  accounts: readonly AnalysisAccount[];
  history: readonly CooperationAssertion[] | null;
  year: number;
  period: string;
  observedAt: string;
  ownerSub?: string;
}) {
  const currentYear = Number(input.observedAt.slice(0, 4));
  if (input.year !== currentYear || !input.history) return null; // no historical roster snapshot
  const history = new Map(input.history.map((r) => [r.accountId, r]));
  const accounts = input.accounts.filter(
    (a) => !input.ownerSub || a.ownerSub === input.ownerSub,
  );
  const types = {
    old: 0,
    new: 0,
    unknown: 0,
    prospect: 0,
    added: 0,
    total: accounts.length,
  };
  const range = periodRange(input.period);
  for (const a of accounts) {
    const assertion = history.get(a.id);
    const type = customerVintage(assertion, input.year);
    types[type]++;
    if (
      type === "new" &&
      assertion?.firstDate &&
      range &&
      within(range, new Date(assertion.firstDate))
    )
      types.added++;
  }
  return types;
}
export function verifiedNewLogos(
  history: readonly CooperationAssertion[] | null,
  accounts: readonly AnalysisAccount[],
  scope: string,
  period: string,
  completeRoster = true,
): MetricFact {
  if (!history) return { value: null, state: "failed", missing: 0 };
  if (scope !== "workspace" && !completeRoster)
    return { value: null, state: "unknown", missing: 0 };
  const known = new Map(history.map((h) => [h.accountId, h]));
  const range = periodRange(period);
  if (!range) return { value: null, state: "unknown", missing: 0 };
  const year = range.start.getUTCFullYear();
  const missing = accounts.filter((a) => {
    const h = known.get(a.id);
    return (
      !h ||
      h.state === "unknown" ||
      (h.state === "before_year" && h.beforeYear! > year)
    );
  }).length;
  const visible = new Set(accounts.map((a) => a.id));
  const rows = [...known.values()].filter(
    (h) =>
      visible.has(h.accountId) &&
      h.state === "dated" &&
      h.firstDate &&
      within(range, new Date(h.firstDate)),
  );
  const unattributed =
    scope === "workspace"
      ? 0
      : rows.filter((h) =>
          scope.startsWith("owner:")
            ? !h.acquisitionOwnerSub
            : !h.acquisitionTerritoryId,
        ).length;
  return {
    value:
      missing || unattributed
        ? null
        : rows.filter(
            (h) =>
              scope === "workspace" ||
              (scope.startsWith("owner:")
                ? h.acquisitionOwnerSub === scope.slice(6)
                : h.acquisitionTerritoryId === scope.slice(10)),
          ).length,
    state: missing || unattributed ? "unknown" : "ready",
    missing: missing + unattributed,
  };
}
export type CustomerProjectGroup = {
  account: AnalysisAccount;
  projects: AnalysisDeal[];
  owned: AnalysisDeal[];
  other: AnalysisDeal[];
};
// ICU collation differs between server and browser. This order must hydrate
// identically, including distinct registered customers with the same name.
function compareStableText(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
export function customerProjects(
  accounts: readonly AnalysisAccount[],
  deals: readonly AnalysisDeal[],
  self: string,
  scope: string,
  period: string,
): CustomerProjectGroup[] {
  const selected = new Set(
    selectedDeals(deals, scope, period).map((d) => d.id),
  );
  // Undated active projects remain actionable but never enter a dated monetary aggregate.
  const slice = deals.filter(
    (d) =>
      selected.has(d.id) ||
      (dealMatches(d, scope) && d.status === "open" && !d.expectedCloseAt),
  );
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const groups = new Map<string, CustomerProjectGroup>();
  for (const d of slice) {
    const account = byId.get(d.accountId);
    if (!account) continue; // no unauthorized name fallback
    let g = groups.get(account.id);
    if (!g) {
      g = { account, projects: [], owned: [], other: [] };
      groups.set(account.id, g);
    }
    g.projects.push(d);
    (d.ownerSub === self ? g.owned : g.other).push(d);
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.projects.filter(
        (d) => d.status === "open" && (!d.amount || !d.expectedCloseAt),
      ).length -
        a.projects.filter(
          (d) => d.status === "open" && (!d.amount || !d.expectedCloseAt),
        ).length ||
      compareStableText(a.account.name, b.account.name) ||
      compareStableText(a.account.id, b.account.id),
  );
}
