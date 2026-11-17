import { canonical, demand, minor } from "./plan-values";
import type { PlanContent } from "./plan-model";
import { expectationWindow, validExpectations, uuid, type StrategicExpectation } from "../strategy/lib/expectations";
import type { PlanRecord } from "../strategy/store";

export interface StrategyAcceptance {
  key: string;
  strategyId: string;
  lineageId: string;
  version: number;
  name: string;
  period: string;
  expectation: StrategicExpectation;
  amount: string;
  ownerSub: string | null;
  note: string;
  allocations: { key: string; regionId: string; period: string; amount: string; ownerSub: string | null }[];
}
export function companyAcceptances(c: PlanContent) {
  return (c.strategyAcceptances ?? []).map(({ allocations: _allocations, ...x }) => x);
}
export function regionalAcceptances(c?: PlanContent) {
  return (c?.strategyAcceptances ?? []).filter(x => x.allocations.length).map(x => ({ key: x.key, allocations: x.allocations }));
}
export function validateStrategyAcceptances(c: PlanContent, publish: boolean) {
  const rows = c.strategyAcceptances ?? [];
  demand(Array.isArray(rows) && rows.length <= 300, "strategy_acceptance_invalid");
  const keys = new Set<string>(), identities = new Set<string>();
  for (const x of rows) {
    demand(x && uuid(x.key) && uuid(x.strategyId) && uuid(x.lineageId) && Number.isSafeInteger(x.version) && x.version > 0 &&
      typeof x.name === "string" && x.name.length > 0 && x.name.length <= 255 && validExpectations([x.expectation]) &&
      typeof x.note === "string" && x.note.length <= 1000 && Array.isArray(x.allocations) && x.allocations.length <= 500 &&
      (x.ownerSub === null || typeof x.ownerSub === "string" && x.ownerSub.length > 0 && x.ownerSub.length <= 128), "strategy_acceptance_invalid");
    demand(!keys.has(x.key) && !identities.has(`${x.lineageId}|${x.expectation.metric}`), "strategy_duplicate");
    keys.add(x.key); identities.add(`${x.lineageId}|${x.expectation.metric}`);
    const window = expectationWindow(x.period, c.year);
    demand(window, "strategy_period_mismatch");
    minor(x.amount);
    if (x.expectation.metric !== "revenue") demand(minor(x.amount) % 100n === 0n, "count_integer");
    if (publish) demand(x.ownerSub && (x.expectation.metric === "revenue" || x.expectation.criterion.trim()), "strategy_owner_required");
    const cells = new Set<string>(), allocationKeys = new Set<string>();
    for (const a of x.allocations) {
      const p = c.periods.find(p => p.key === a.period);
      demand(uuid(a.key) && !allocationKeys.has(a.key) && !cells.has(`${a.regionId}|${a.period}`) &&
        c.regions.some(r => r.id === a.regionId && r.included) && p?.parent === `Y${c.year}` && p.start <= window.end && window.start < p.end &&
        (a.ownerSub === null || typeof a.ownerSub === "string" && a.ownerSub.length > 0 && a.ownerSub.length <= 128), "strategy_allocation_invalid");
      allocationKeys.add(a.key); cells.add(`${a.regionId}|${a.period}`); minor(a.amount);
      if (x.expectation.metric !== "revenue") demand(minor(a.amount) % 100n === 0n, "count_integer");
      if (publish) demand(a.ownerSub, "strategy_owner_required");
      if (x.expectation.metric === "revenue") {
        const t = c.targets.find(t => t.scope === `territory:${a.regionId}` && t.period === a.period && t.metric === "revenue" && t.currency === x.expectation.currency);
        demand(t?.target != null && minor(a.amount) <= minor(t.target), "strategy_overallocated");
      }
    }
    demand(x.allocations.reduce((n, a) => n + minor(a.amount), 0n) <= minor(x.amount), "strategy_overallocated");
  }
  for (const currency of new Set(rows.filter(x => x.expectation.metric === "revenue").map(x => x.expectation.currency))) {
    const revenue = rows.filter(x => x.expectation.metric === "revenue" && x.expectation.currency === currency);
    const company = c.targets.find(t => t.scope === "workspace" && t.period === `Y${c.year}` && t.metric === "revenue" && t.currency === currency);
    demand(company?.target != null && revenue.reduce((n,x) => n + minor(x.amount), 0n) <= minor(company.target), "strategy_overallocated");
    for (const t of c.targets.filter(t => t.scope !== "workspace" && t.metric === "revenue" && t.currency === currency)) {
      const allocations = revenue.flatMap(x => x.allocations).filter(a => t.scope === `territory:${a.regionId}` &&
        (a.period === t.period || c.periods.find(p => p.key === a.period)?.parent === t.period));
      demand(!allocations.length || t.target != null && allocations.reduce((n,a) => n + minor(a.amount), 0n) <= minor(t.target), "strategy_overallocated");
    }
  }
}
/** Re-read the exact publication, never accept client-supplied source facts. */
export function verifyStrategyAcceptance(x: StrategyAcceptance, plan: PlanRecord | null, year: number) {
  const source = plan?.publishedSnapshot;
  const objective = source?.expectations?.find(e => e.id === x.expectation.id);
  demand(plan && plan.versionNo && source && objective && plan.id === x.strategyId && (plan.lineageId ?? plan.id) === x.lineageId &&
    plan.versionNo === x.version && source.name === x.name && source.period === x.period &&
    canonical(objective) === canonical(x.expectation) && expectationWindow(source.period, year), "strategy_source_changed");
}
