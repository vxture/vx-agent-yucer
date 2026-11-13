import { cache } from "react";
import { resolveAppSession } from "../lib/session";
import { can } from "../../authz/decide";
import { getCatalogStore, getStrategyStore } from "../../domains/shared/registry";
import { listSolutionReferences } from "../../domains/catalog/service";
import { listPlans, listSegments, listCampaigns } from "../../domains/strategy/service";
import { listAccounts } from "../../domains/account/service";
import { listPipeline } from "../../domains/pipeline/service";
import { analysePlans } from "../../domains/strategy/lib/plan-advice";
import { analyseSegments } from "../../domains/strategy/lib/segment-advice";
import { fail, violation, type RuleResult } from "../../domains/shared/result";
import { marketViews, strategyViews } from "../lib/market-strategy";

async function read<T>(source: string, pending: Promise<RuleResult<T>>): Promise<RuleResult<T>> {
  try { return await pending; }
  catch {
    console.error("Market strategy source unavailable:", source);
    return fail(violation("source_read_failed", "Source unavailable", undefined, true));
  }
}

// All cross-domain reads use their own gates and the current scoped stores.
export const strategyWorkspaceData = cache(async () => {
  const session = await resolveAppSession();
  if (!session) return null;
  const base = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement };
  const ctx = { ...base, store: getStrategyStore() };
  const canPlan = can(session.authz, session.entitlement, "strategy.plan.view", "ui").allowed;
  const canMarkets = can(session.authz, session.entitlement, "strategy.segment.view", "ui").allowed;
  const canSeeSolutions = canPlan && can(session.authz, session.entitlement, "catalog.solution.view", "ui").allowed;
  const [plans, segments, campaigns, accounts, deals, solutions] = await Promise.all([
    read("plans", listPlans(ctx)), read("markets", listSegments(ctx)), read("campaigns", listCampaigns(ctx)),
    read("accounts", listAccounts({ ...base, store: session.stores.account() })),
    read("pipeline", listPipeline({ ...base, store: session.stores.pipeline() }, { includeClosed: true })),
    canSeeSolutions ? read("solutions", listSolutionReferences({ ...base, store: getCatalogStore() })) : null,
  ]);
  const customers = accounts.ok ? accounts.value.map(({id,name,accountNo,segmentCode,industry,region,customerSize}) => ({id,name,accountNo,segmentCode,industry,region,customerSize:customerSize ?? null})) : null;
  const markets = canMarkets && segments.ok ? marketViews(segments.value, canPlan && plans.ok ? plans.value : null, customers) : null;
  const planRows = plans.ok ? strategyViews(plans.value, markets, campaigns.ok ? campaigns.value : null, deals.ok ? deals.value : null, solutions?.ok ? solutions.value : null, customers) : null;
  const planAdvice = plans.ok ? analysePlans({ plans: plans.value,
    campaignCounts: new Map(planRows!.map(p => [p.id, p.campaigns?.length ?? 0])),
    segmentCounts: new Map(planRows!.map(p => [p.id, p.marketIds?.length ?? 0])), now: new Date(),
  }).filter(a => !(!campaigns.ok && ["active_no_campaign", "work_under_inactive_plan"].includes(a.kind)) && !(!segments.ok && a.kind === "active_no_segment")) : [];
  const segmentAdvice = markets && accounts.ok ? analyseSegments({ segments: markets,
    counts: new Map(markets.map(m => [m.segmentCode, { assigned: m.assigned!, matched: m.matched! }])),
    mismatch: new Map(markets.map(m => [m.segmentCode, {
      assignedNotMatching: m.customers!.filter(a => a.assigned && a.match === "miss").length,
      matchingNotAssigned: m.customers!.filter(a => !a.assigned && a.match === "match").length,
    }])),
  }) : [];
  return { session, plansRead: plans, marketsRead: segments, data: {
    plans: canPlan ? planRows : null, markets: canMarkets ? markets : null,
    solutionOptions: solutions?.ok ? solutions.value : null,
    planAdvice: canPlan ? planAdvice : [], segmentAdvice: canMarkets ? segmentAdvice : [], at: new Date().toISOString(),
    canPlan,
    canMarkets,
    canCreate: can(session.authz, session.entitlement, "strategy.plan.create", "ui").allowed,
    canEdit: can(session.authz, session.entitlement, "strategy.plan.update", "ui").allowed,
    canCreateCampaign: can(session.authz, session.entitlement, "campaign.upsert", "ui").allowed,
    canApprove: can(session.authz, session.entitlement, "strategy.plan.approve", "ui").allowed,
    canWriteMarket: can(session.authz, session.entitlement, "strategy.segment.upsert", "ui").allowed,
  } };
});
export type StrategyWorkspaceData = NonNullable<Awaited<ReturnType<typeof strategyWorkspaceData>>>["data"];
