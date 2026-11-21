import { can } from "../../authz/decide";
import type { AppSession } from "./session";
import { listPlans, listCampaigns } from "../../domains/strategy/service";
import { listPipeline } from "../../domains/pipeline/service";
import { getSalesPlanStore, getStrategyStore } from "../../domains/shared/registry";
import { activeReleases, planVersions } from "../../domains/planning/plan-state";
import { listStrategicResults, type StrategicResult } from "../../domains/planning/strategic-results";
import { strategicActual } from "../../domains/planning/strategic-actual";
import { periodRange } from "../../domains/shared/period";
import type { StrategyAcceptance } from "../../domains/planning/strategy-handoff";
import type { SalesPlan, PlanRevision } from "../../domains/planning/plan-model";
export interface FulfillmentRow {
  acceptance: StrategyAcceptance; planId: string; revisionId: string; version: number; year: number;
  actual: string | null; target: string; evidence: StrategicResult[];
  allocations: { key: string; regionId: string; regionName: string; period: string }[];
}
type FulfillmentFilter = { year?: number; period?: string; strategyId?: string; regionId?: string; revisionId?: string };
type FulfillmentSources = Pick<Parameters<typeof strategicActual>[1], "deals" | "campaigns" | "plans"> & { evidence: StrategicResult[] };

function fulfillmentRevision(plan: SalesPlan, revisionId: string | undefined, at: string): PlanRevision | null {
  if (!revisionId) return planVersions(plan, at).current;
  if (!activeReleases(plan, at).some(e => e.revisionId === revisionId && e.effectiveAt <= at)) return null;
  return plan.revisions.find(r => r.id === revisionId && r.state === "sealed") ?? null;
}

function fulfillmentRow(plan: SalesPlan, revision: PlanRevision, acceptance: StrategyAcceptance, filter: FulfillmentFilter, window: { start: string; end: string }, sources: FulfillmentSources): FulfillmentRow | null {
  const { start, end } = window;
  const allocations = acceptance.allocations.filter(a => (!filter.regionId || a.regionId === filter.regionId) && revision.content.periods.some(q => q.key === a.period && q.start < end && start < q.end));
  if (filter.regionId && !allocations.length) return null;
  const annual = !filter.regionId && (filter.period === undefined || /^Y?\d{4}$/.test(filter.period));
  return {
    acceptance, planId: plan.id, revisionId: revision.id, version: revision.version!, year: plan.year,
    target: annual ? acceptance.amount : String(allocations.reduce((n, a) => n + Number(a.amount), 0)),
    actual: strategicActual(acceptance, { ...window, regionId: filter.regionId, ...sources }),
    allocations: allocations.map(a => ({ key: a.key, regionId: a.regionId, regionName: revision.content.regions.find(r => r.id === a.regionId)?.name ?? "-", period: a.period })),
    evidence: sources.evidence.filter(e => e.lineageId === acceptance.lineageId && e.objectiveId === acceptance.expectation.id && (!filter.regionId || e.regionId === filter.regionId) && e.achievedOn >= start && e.achievedOn < end),
  };
}

function fulfillmentPlanRows(plan: SalesPlan, filter: FulfillmentFilter, sourceLineage: string | undefined, sources: FulfillmentSources, at: string): FulfillmentRow[] {
  const current = fulfillmentRevision(plan, filter.revisionId, at);
  if (!current) return [];
  const range = periodRange(filter.period ?? `Y${plan.year}`);
  if (!range) return [];
  const window = { start: range.start.toISOString().slice(0, 10), end: range.end.toISOString().slice(0, 10) };
  const acceptances = (current.content.strategyAcceptances ?? []).filter(x => !filter.strategyId || x.lineageId === sourceLineage);
  const rows: FulfillmentRow[] = [];
  for (const x of acceptances) {
    const row = fulfillmentRow(plan, current, x, filter, window, sources);
    if (row) rows.push(row);
  }
  return rows;
}

export async function loadStrategyFulfillment(s: AppSession, filter: FulfillmentFilter = {}): Promise<FulfillmentRow[] | null> {
  if (s.scope.kind !== "workspace" || !["strategy.plan.view", "planning.target.view", "planning.attainment.view"].every(permission => can(s.authz,s.entitlement,permission as "strategy.plan.view","data").allowed)) return null;
  try {
  const base = { workspaceId:s.workspaceId,sub:s.user.sub,holder:s.authz,entitlement:s.entitlement };
  const [plans, sales, campaigns, deals, evidence] = await Promise.all([
    listPlans({ ...base,store:getStrategyStore() }), getSalesPlanStore().list(s.workspaceId),
    listCampaigns({ ...base,store:getStrategyStore() }), listPipeline({ ...base,store:s.stores.pipeline() },{includeClosed:true}), listStrategicResults(s.workspaceId),
  ]);
  if (!plans.ok) return null;
  const source = plans.value.find(p => p.id === filter.strategyId);
  const sourceLineage = source?.lineageId ?? source?.id;
  const sources = { deals: deals.ok ? deals.value : null, campaigns: campaigns.ok ? campaigns.value : null, plans: plans.value, evidence };
  const at = new Date().toISOString();
  return sales.filter(p => filter.year === undefined || p.year === filter.year)
    .flatMap(p => fulfillmentPlanRows(p, filter, sourceLineage, sources, at));
  } catch {
    console.error("Strategic fulfillment sources unavailable");
    return null;
  }
}
