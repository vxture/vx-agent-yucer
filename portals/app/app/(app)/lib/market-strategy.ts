import type { PlanRecord, SegmentRecord, CampaignRecord } from "../../domains/strategy/store";
import type { SegmentCriteria, TargetMarket } from "../../domains/strategy/lib/lifecycle";
import type { OpportunityRecord } from "../../domains/pipeline/store";
import type { SolutionReference } from "../../domains/catalog/service";

export type MarketMatch = "match" | "miss" | "missing" | "undefined";
export interface MarketAccount {
  id: string; name: string; accountNo: string; segmentCode: string | null;
  industry: string | null; region: string | null; customerSize: string | null;
}
// A known mismatch wins over missing information in another dimension.
export function marketMatch(a: MarketAccount, c: SegmentCriteria): MarketMatch {
  const pairs = [[c.industries, a.industry], [c.regions, a.region], [c.sizes ?? [], a.customerSize]] as const;
  const limited = pairs.filter(([values]) => values.length > 0);
  if (!limited.length) return "undefined";
  if (limited.some(([values, value]) => value != null && value !== "" && !values.includes(value))) return "miss";
  return limited.some(([, value]) => value == null || value === "") ? "missing" : "match";
}
export interface MarketView extends Omit<SegmentRecord, "workspaceId"> {
  plans: { id: string; name: string; period: string }[] | null;
  customers: (MarketAccount & { match: MarketMatch; assigned: boolean })[] | null;
  matched: number | null; missing: number | null; assigned: number | null;
}
export interface StrategyResult {
  currency: string; open: number; won: number;
  openCount: number; wonCount: number; lostCount: number; unpriced: number;
}
export interface StrategyView extends Omit<PlanRecord, "workspaceId" | "approvedAt" | "solutionIds" | "targetMarkets"> {
  approvedAt: string | null;
  marketIds: string[] | null; customerCount: number | null;
  campaigns: Pick<CampaignRecord, "id" | "name" | "campaignNo" | "status">[] | null;
  solutions: SolutionReference[] | null;
  sharedSolutions: SolutionReference[] | null;
  targetMarkets: (Omit<TargetMarket, "solutionIds"> & {
    solutions: SolutionReference[] | null;
    matched: number | null;
    missing: number | null;
    status: SegmentRecord["status"];
  })[] | null;
  results: StrategyResult[] | null; conflicts: number | null; attributionIncomplete: boolean;
}
/** Explicit plan or campaign references only. A conflicting chain credits neither. */
export function strategyResults(planId: string, deals: readonly OpportunityRecord[], campaigns: readonly CampaignRecord[] | null) {
  const byCampaign = new Map(campaigns?.map(c => [c.id, c.planId]));
  const results = new Map<string, StrategyResult>();
  let conflicts = 0;
  let attributionIncomplete = campaigns === null;
  const seen = new Set<string>();
  for (const d of deals) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    const via = d.campaignId ? byCampaign.get(d.campaignId) : null;
    if (d.planId && via && d.planId !== via) {
      if (d.planId === planId || via === planId) conflicts++;
      continue;
    }
    // If the campaign chain cannot be read, it cannot validate or contradict attribution.
    if (d.campaignId && (!campaigns || !byCampaign.has(d.campaignId))) {
      if (!d.planId || d.planId === planId) attributionIncomplete = true;
      continue;
    }
    if ((d.planId ?? via) !== planId) continue;
    const currency = d.amount?.currency ?? d.currency;
    const row = results.get(currency) ?? { currency, open: 0, won: 0, openCount: 0, wonCount: 0, lostCount: 0, unpriced: 0 };
    if (d.status === "open") { row.openCount++; row.open += d.amount?.amount ?? 0; }
    if (d.status === "won") { row.wonCount++; row.won += d.amount?.amount ?? 0; }
    if (d.status === "lost") row.lostCount++;
    if ((d.status === "open" || d.status === "won") && !d.amount) row.unpriced++;
    results.set(currency, row);
  }
  return { results: [...results.values()].sort((a,b) => a.currency.localeCompare(b.currency)), conflicts, attributionIncomplete };
}
export function marketViews(segments: readonly SegmentRecord[], plans: readonly PlanRecord[] | null, accounts: readonly MarketAccount[] | null): MarketView[] {
  const adoption = new Map<string, NonNullable<MarketView["plans"]>>();
  for (const { id, name, period, targetMarkets } of plans ?? []) {
    for (const { segmentId } of targetMarkets ?? []) {
      const rows = adoption.get(segmentId) ?? [];
      rows.push({ id, name, period });
      adoption.set(segmentId, rows);
    }
  }
  return segments.map(({ workspaceId: _workspace, ...s }) => {
    const customers = accounts?.map(a => ({ ...a, match: marketMatch(a, s.criteria), assigned: a.segmentCode === s.segmentCode }))
      .filter(a => a.match === "match" || a.match === "missing" || a.assigned) ?? null;
    return { ...s, plans: plans === null ? null : adoption.get(s.id) ?? [], customers,
      matched: customers?.filter(a => a.match === "match").length ?? null,
      missing: customers?.filter(a => a.match === "missing").length ?? null,
      assigned: customers?.filter(a => a.assigned).length ?? null };
  });
}
export function strategyViews(plans: readonly PlanRecord[], markets: readonly MarketView[] | null, campaigns: readonly CampaignRecord[] | null, deals: readonly OpportunityRecord[] | null, solutions: readonly SolutionReference[] | null = null, accounts: readonly MarketAccount[] | null = null): StrategyView[] {
  const byMarket = new Map(markets?.map(m => [m.id, m]));
  const bySolution = new Map(solutions?.map(s => [s.id, s]));
  const references = (ids: readonly string[]) => {
    if (solutions === null) return null;
    const unique = [...new Set(ids)];
    const rows = unique.map(id => bySolution.get(id)).filter((s): s is SolutionReference => s !== undefined);
    return rows.length === unique.length ? rows : null;
  };
  return plans.map(({ workspaceId: _workspace, approvedAt, solutionIds, targetMarkets = [], ...p }) => {
    const matched = new Set<string>();
    let knownCustomers = markets !== null && accounts !== null;
    const targets = markets === null ? null : targetMarkets.flatMap(({ solutionIds: targetSolutionIds, ...t }) => {
      const market = byMarket.get(t.segmentId);
      if (!market) { knownCustomers = false; return []; }
      let count = 0, missing = 0;
      if (accounts !== null) {
        // Preview against the selection's saved criteria, not a library edit.
        // market.customers includes only current matches, so use the full input
        // passed by the gated account read below.
        for (const a of accounts) {
          const match = marketMatch(a, t.criteria);
          if (match === "match") { matched.add(a.id); count++; }
          else if (match === "missing") missing++;
        }
      }
      return [{ ...t, status: market.status, solutions: references(targetSolutionIds),
        matched: accounts === null ? null : count, missing: accounts === null ? null : missing }];
    });
    const credited = deals ? strategyResults(p.id, deals, campaigns) : null;
    return { ...p, approvedAt: approvedAt?.toISOString() ?? null,
      sharedSolutions: references(solutionIds),
      solutions: markets === null && targetMarkets.length ? null : references([...solutionIds, ...targetMarkets.flatMap(m => m.solutionIds)]),
      targetMarkets: targets,
      marketIds: targets?.map(m => m.segmentId) ?? null,
      customerCount: knownCustomers || (markets !== null && !targetMarkets.length) ? matched.size : null,
      campaigns: campaigns?.filter(c => c.planId === p.id).map(({id,name,campaignNo,status}) => ({id,name,campaignNo,status})) ?? null,
      results: credited?.results ?? null, conflicts: credited?.conflicts ?? null, attributionIncomplete: credited?.attributionIncomplete ?? false };
  });
}
