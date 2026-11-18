import type { OpportunityRecord } from "../pipeline/store";
import type { PlanRecord, CampaignRecord } from "../strategy/store";
import { strategyPeriodWindow } from "../strategy/lib/plan-period";
import { minor, amount } from "./plan-values";
import type { StrategyAcceptance } from "./strategy-handoff";
import type { StrategicResult } from "./strategic-results";

export function strategicActual(x: StrategyAcceptance, input: { start: string; end: string; regionId?: string; deals: readonly OpportunityRecord[] | null; campaigns: readonly CampaignRecord[] | null; plans: readonly PlanRecord[]; evidence: readonly StrategicResult[] }): string | null {
  const w = strategyPeriodWindow(x.period);
  if (!w) return null;
  if (x.expectation.metric !== "revenue") {
    const revoked = new Set(input.evidence.filter(e => e.voidsId).map(e => e.voidsId));
    return String(input.evidence.filter(e => !e.voidsId && !revoked.has(e.id) && e.lineageId === x.lineageId && e.objectiveId === x.expectation.id &&
      e.achievedOn >= input.start && e.achievedOn < input.end && (!input.regionId || e.regionId === input.regionId) &&
      new Date(e.achievedOn) >= w.start && new Date(e.achievedOn) <= w.end).length);
  }
  if (input.deals === null) return null;
  const lineage = new Map(input.plans.map(p => [p.id, p.lineageId ?? p.id]));
  const campaigns = new Map(input.campaigns?.map(c => [c.id,c]));
  const seen = new Set<string>(); let total = 0n, unknown = false;
  for (const d of input.deals) {
    if (seen.has(d.id)) continue; seen.add(d.id);
    if (d.status !== "won" || input.regionId && d.territoryId && d.territoryId !== input.regionId) continue;
    if (d.closedAt && (d.closedAt < w.start || d.closedAt > w.end || d.closedAt < new Date(input.start) || d.closedAt >= new Date(input.end))) continue;
    const direct = d.planId ? lineage.get(d.planId) : null;
    const c = d.campaignId ? campaigns.get(d.campaignId) : null;
    if (d.campaignId && !c) { if (!direct || direct === x.lineageId) unknown = true; continue; }
    const via = c?.planId ? lineage.get(c.planId) : null;
    if (direct && via && direct !== via) { if (direct === x.lineageId || via === x.lineageId) unknown = true; continue; }
    if ((direct ?? via) !== x.lineageId) continue;
    const currency = d.amount?.currency ?? d.currency;
    if (!currency || input.regionId && !d.territoryId) { unknown = true; continue; }
    if (currency !== x.expectation.currency) continue;
    if (!d.amount || !d.closedAt) { unknown = true; continue; }
    total += minor(d.amount.amount.toFixed(2));
  }
  return unknown ? null : amount(total);
}
