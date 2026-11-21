import type { PlanContent } from "./plan-model";
import type { StrategyAcceptance } from "./strategy-handoff";
import type { PlanRecord } from "../strategy/store";
import { expectationWindow, type StrategicMetric } from "../strategy/lib/expectations";
import { amount, minor } from "./plan-values";

// Only metrics with source, allocation and fulfillment support are selectable.
export const ACCEPTANCE_METRICS = ["revenue", "channels", "reference_cases"] as const satisfies readonly StrategicMetric[];
export type AcceptanceSource = Pick<PlanRecord, "id" | "lineageId" | "versionNo" | "name" | "period" | "expectations" | "ownerSub">;
export function acceptanceSources(sources: readonly AcceptanceSource[], year: number) {
  return sources.filter(p => p.versionNo && expectationWindow(p.period, year)).map(p => ({ ...p,
    expectations: (p.expectations ?? []).filter(e => ACCEPTANCE_METRICS.includes(e.metric)),
  })).filter(p => p.expectations.length);
}

export function groupAcceptances(rows: readonly StrategyAcceptance[], sources: readonly AcceptanceSource[]) {
  const order = new Map(sources.map((p, i) => [p.lineageId ?? p.id, i]));
  const groups = [...new Set(rows.map(x => x.strategyId))].map(id => rows.filter(x => x.strategyId === id));
  // Historic sources absent from the current roster retain their stored order.
  return groups.sort((a, b) => (order.get(a[0]!.lineageId) ?? sources.length) - (order.get(b[0]!.lineageId) ?? sources.length));
}

export function acceptanceSummary(rows: readonly StrategyAcceptance[], regionId?: string | null) {
  const sums = new Map<string, { metric: StrategicMetric; currency: string | null; total: bigint; pending: number }>();
  for (const x of rows) {
    if (!ACCEPTANCE_METRICS.includes(x.expectation.metric)) continue;
    const { metric, currency } = x.expectation;
    const key = `${metric}|${currency ?? ""}`;
    const sum = sums.get(key) ?? { metric, currency, total: 0n, pending: 0 };
    const allocations = x.allocations.filter(a => a.regionId === regionId);
    sum.total += regionId ? allocations.reduce((n, a) => n + minor(a.amount), 0n) : minor(x.amount);
    if (regionId && !allocations.length) sum.pending++;
    sums.set(key, sum);
  }
  return [...sums.values()].sort((a, b) => ACCEPTANCE_METRICS.indexOf(a.metric) - ACCEPTANCE_METRICS.indexOf(b.metric))
    .map(({ total, ...row }) => ({ ...row, amount: row.metric === "revenue" ? amount(total) : String(total / 100n) }));
}

export function proposeAcceptance(content: PlanContent, p: AcceptanceSource, expectation: NonNullable<AcceptanceSource["expectations"]>[number], owner: string | null, key: string): StrategyAcceptance {
  const existing = content.strategyAcceptances?.find(x => x.lineageId === (p.lineageId ?? p.id) && x.expectation.metric === expectation.metric);
  // A published source is frozen until an explicit change, even when a newer source exists.
  if (existing) return structuredClone(existing);
  const w = expectationWindow(p.period, content.year)!;
  const dates = p.period.includes("/") ? p.period.split("/") : null;
  const days = BigInt((Date.parse(w.end) - Date.parse(w.start)) / 86400000 + 1);
  const full = dates ? BigInt((Date.parse(dates[1]!) - Date.parse(dates[0]!)) / 86400000 + 1) : days;
  const proposed = (minor(expectation.amount) * days + full / 2n) / full;
  const revenue = content.targets.find(t => t.scope === "workspace" && t.period === `Y${content.year}` && t.metric === "revenue" && t.currency === expectation.currency);
  const used = (content.strategyAcceptances ?? []).filter(x => x.expectation.metric === "revenue" && x.expectation.currency === expectation.currency).reduce((n, x) => n + minor(x.amount), 0n);
  const capacity = revenue?.target == null ? 0n : minor(revenue.target) - used;
  const value = expectation.metric === "revenue" ? amount(capacity <= 0n ? 0n : proposed > capacity ? capacity : proposed) : String(proposed / 100n);
  return { key, strategyId: p.id, lineageId: p.lineageId ?? p.id, version: p.versionNo!, name: p.name, period: p.period, expectation, amount: value, ownerSub: p.ownerSub ?? owner, note: "", allocations: [] };
}

/** Company cancellation removes a whole acceptance, never changes retained allocations. */
export function retainedRegionalBasis(base: PlanContent | undefined, content: PlanContent) {
  if (!base) return undefined;
  const retained = new Set(content.strategyAcceptances?.map(x => x.key));
  return { ...base, strategyAcceptances: base.strategyAcceptances?.filter(x => retained.has(x.key)) };
}
