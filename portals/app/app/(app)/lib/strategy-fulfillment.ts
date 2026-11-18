import { can } from "../../authz/decide";
import type { AppSession } from "./session";
import { listPlans, listCampaigns } from "../../domains/strategy/service";
import { listPipeline } from "../../domains/pipeline/service";
import { getSalesPlanStore, getStrategyStore } from "../../domains/shared/registry";
import { planVersions } from "../../domains/planning/plan-state";
import { listStrategicResults, type StrategicResult } from "../../domains/planning/strategic-results";
import { strategicActual } from "../../domains/planning/strategic-actual";
import { periodRange } from "../../domains/shared/period";
import type { StrategyAcceptance } from "../../domains/planning/strategy-handoff";
export interface FulfillmentRow {
  acceptance: StrategyAcceptance; planId: string; revisionId: string; version: number; year: number;
  actual: string | null; target: string; evidence: StrategicResult[];
  allocations: { key: string; regionId: string; regionName: string; period: string }[];
}
export async function loadStrategyFulfillment(s: AppSession, filter: { year?: number; period?: string; strategyId?: string; regionId?: string } = {}): Promise<FulfillmentRow[] | null> {
  if (s.scope.kind !== "workspace" || !["strategy.plan.view", "planning.target.view", "planning.attainment.view"].every(permission => can(s.authz,s.entitlement,permission as "strategy.plan.view","data").allowed)) return null;
  try {
  const base = { workspaceId:s.workspaceId,sub:s.user.sub,holder:s.authz,entitlement:s.entitlement };
  const [plans, sales, campaigns, deals, evidence] = await Promise.all([
    listPlans({ ...base,store:getStrategyStore() }), getSalesPlanStore().list(s.workspaceId),
    listCampaigns({ ...base,store:getStrategyStore() }), listPipeline({ ...base,store:s.stores.pipeline() },{includeClosed:true}), listStrategicResults(s.workspaceId),
  ]);
  if (!plans.ok) return null;
  const source = plans.value.find(p => p.id === filter.strategyId);
  const rows: FulfillmentRow[] = [];
  for (const p of sales.filter(p => filter.year === undefined || p.year === filter.year)) {
    const current = planVersions(p,new Date().toISOString()).current;
    if (!current) continue;
    const range = periodRange(filter.period ?? `Y${p.year}`);
    if (!range) continue;
    const start = range.start.toISOString().slice(0,10), end = range.end.toISOString().slice(0,10);
    for (const x of current.content.strategyAcceptances ?? []) {
      if (filter.strategyId && (!source || x.lineageId !== (source.lineageId ?? source.id))) continue;
      const allocations = x.allocations.filter(a => (!filter.regionId || a.regionId === filter.regionId) && current.content.periods.some(q => q.key === a.period && q.start < end && start < q.end));
      if (filter.regionId && !allocations.length) continue;
      const annual = !filter.regionId && (filter.period === undefined || /^Y?\d{4}$/.test(filter.period));
      rows.push({ acceptance:x,planId:p.id,revisionId:current.id,version:current.version!,year:p.year,
        target: annual ? x.amount : String(allocations.reduce((n,a) => n+Number(a.amount),0)),
        actual: strategicActual(x,{start,end,regionId:filter.regionId,deals:deals.ok ? deals.value : null,campaigns:campaigns.ok ? campaigns.value : null,plans:plans.value,evidence}),
        allocations:allocations.map(a => ({key:a.key,regionId:a.regionId,regionName:current.content.regions.find(r => r.id === a.regionId)?.name ?? "-",period:a.period})),
        evidence:evidence.filter(e => e.lineageId === x.lineageId && e.objectiveId === x.expectation.id && (!filter.regionId || e.regionId === filter.regionId) && e.achievedOn >= start && e.achievedOn < end),
      });
    }
  }
  return rows;
  } catch {
    console.error("Strategic fulfillment sources unavailable");
    return null;
  }
}
