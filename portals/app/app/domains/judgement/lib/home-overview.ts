import type { DataScope } from "../../../authz/scope";
import type { AttainmentRow } from "../../planning/service";
import type { TargetRecord } from "../../planning/store";
import { periodRange } from "../../shared/period";
import { sumMoney } from "../../shared/money";
import type { ForecastableOpportunity } from "../../pipeline/lib/forecast";

/** A single non-overlapping scope/period; never sum company, regions and people. */
export function overviewPeriod(targets: readonly TargetRecord[], scope: DataScope, sub: string, now: Date) {
  const allowed = targets.filter(t => t.status === "committed" && (scope.kind === "workspace"
    ? t.scopeType === "workspace" : t.scopeType === "owner" && t.ownerSub === sub));
  const annual = `Y${now.getUTCFullYear()}`;
  const periods = [...new Set(allowed.map(t => t.period))].filter(p => {
    const range = periodRange(p); return range && now >= range.start && now < range.end;
  }).sort((a, b) => {
    const first = periodRange(a)!, second = periodRange(b)!;
    return (second.end.getTime() - second.start.getTime()) - (first.end.getTime() - first.start.getTime());
  });
  const period = periods.find(p => p === annual || p === String(now.getUTCFullYear())) ?? periods[0] ?? annual;
  return { period, targets: allowed.filter(t => t.period === period) };
}

export function publishedOverviewMetric(rows: readonly AttainmentRow[], targets: readonly TargetRecord[], metric: "revenue" | "new_logo") {
  const selected = targets.filter(t => t.metric === metric);
  if (selected.length !== 1) return { state: "missing" as const, amount: null, target: null, currency: null };
  const target = selected[0]!, row = rows.find(r => r.target.id === target.id);
  const currency = target.targetValue.unit === "money" ? target.targetValue.currency : null;
  if (!row || row.measurement.kind !== "measured") return { state: "unmeasured" as const, amount: null, target: target.targetValue.amount, currency };
  return { state: "ready" as const, amount: row.measurement.achieved.amount, target: target.targetValue.amount, currency };
}

/** The input is already scoped by the original pipeline service. Keep currencies separate. */
export function openOpportunityOverview(deals: readonly ForecastableOpportunity[]) {
  const open = deals.filter(d => d.status === "open" || (d.status === undefined && !["won", "lost"].includes(d.stage)));
  const currencies = [...new Set(open.flatMap(d => d.amount ? [d.amount.currency] : []))].sort();
  const amounts = currencies.map(currency => {
    const values = open.flatMap(d => d.amount?.currency === currency ? [d.amount] : []);
    const sum = sumMoney(values, currency);
    return { currency, amount: sum.ok ? sum.value.amount : null };
  });
  return { count: open.length, missingAmounts: open.filter(d => !d.amount).length, amounts };
}
