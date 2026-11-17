import { amount, minor } from "./plan-values";
import type { PlanContent } from "./plan-model";
import type { StrategyAcceptance } from "./strategy-handoff";
import { expectationWindow } from "../strategy/lib/expectations";

/** Largest remainders preserve cents/items and never exceed financial capacity. */
export function allocateStrategicTarget(c: PlanContent, x: StrategyAcceptance, key: () => string): StrategyAcceptance {
  const w = expectationWindow(x.period, c.year);
  if (!w) return x;
  const count = x.expectation.metric !== "revenue";
  const cells = c.targets.filter(t => t.metric === "revenue" && t.scope.startsWith("territory:") && t.target !== null &&
    c.regions.some(r => `territory:${r.id}` === t.scope && r.included) &&
    c.periods.some(p => p.key === t.period && p.parent === `Y${c.year}` && p.start <= w.end && w.start < p.end) &&
    (count || t.currency === x.expectation.currency));
  // A count metric uses just the company's configured revenue currency.
  const currency = count ? c.targets.find(t => t.scope === "workspace" && t.metric === "revenue")?.currency : x.expectation.currency;
  const candidates = cells.filter(t => t.currency === currency).map(t => {
    const used = (c.strategyAcceptances ?? []).filter(y => y.key !== x.key && y.expectation.metric === "revenue" && y.expectation.currency === currency)
      .flatMap(y => y.allocations).filter(a => t.scope === `territory:${a.regionId}` && a.period === t.period).reduce((n,a) => n + minor(a.amount), 0n);
    const capacity = count ? minor(t.target!) : minor(t.target!) - used;
    return { t, capacity: capacity > 0n ? capacity : 0n, n: 0n, remainder: 0n };
  }).filter(row => row.capacity > 0n);
  const total = candidates.reduce((n,row) => n + row.capacity, 0n);
  if (!total) return { ...x, allocations: [] };
  let desired = count ? minor(x.amount) / 100n : minor(x.amount);
  if (!count && desired > total) desired = total;
  for (const row of candidates) { row.n = desired * row.capacity / total; row.remainder = desired * row.capacity % total; }
  let rest = desired - candidates.reduce((n,row) => n + row.n, 0n);
  for (const row of [...candidates].sort((a,b) => a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 : a.t.key.localeCompare(b.t.key))) {
    if (rest > 0n) { row.n++; rest--; }
  }
  return { ...x, allocations: candidates.filter(row => row.n > 0n).map(({t,n}) => {
    const regionId = t.scope.slice(10);
    return { key: x.allocations.find(a => a.regionId === regionId && a.period === t.period)?.key ?? key(), regionId, period: t.period,
      amount: count ? String(n) : amount(n), ownerSub: c.regions.find(r => r.id === regionId)?.ownerSub ?? x.ownerSub };
  }) };
}
