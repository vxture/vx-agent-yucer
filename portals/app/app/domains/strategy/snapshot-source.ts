import { getPrismaClient } from "../../lib/db";
import { loadSalesPlans } from "../planning/plan-prisma-store";
import { DEFAULT_PRICING_POLICY } from "../catalog/lib/pricing-policy";
import type { DiagnosticSource } from "./lib/diagnostic-snapshots";
import { readSegmentCriteria } from "./lib/market-match";

// One workspace / one repeatable-read view. A concurrent release or customer
// edit cannot splice two different database states into the same capture.
export async function readDiagnosticSource(workspaceId: string): Promise<DiagnosticSource> {
  const p = await getPrismaClient();
  return p.$transaction(async tx => {
    const [segments, accounts, industries, sizes, divisions, deals, plans, policy] = await Promise.all([
      tx.marketSegment.findMany({ where: { workspaceId, status: "active" }, select: { id: true, criteria: true } }),
      tx.account.findMany({ where: { workspaceId, deletedAt: null }, select: { id: true, segmentId: true, industryId: true, customerSizeId: true, regionId: true, region: true } }),
      tx.industry.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
      tx.customerSize.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
      tx.marketDivision.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
      tx.opportunity.findMany({ where: { workspaceId, deletedAt: null, status: { in: ["open", "won"] } }, select: { id: true, accountId: true, territoryId: true, status: true, amount: true, currency: true, closedAt: true } }),
      loadSalesPlans(tx, workspaceId),
      tx.pricingPolicy.findUnique({ where: { workspaceId } }),
    ]);
    const names = (rows: { id: string; name: string }[]) => new Map(rows.map(r => [r.id, r.name]));
    const industryNames = names(industries), sizeNames = names(sizes), regionNames = names(divisions);
    return {
      currency: policy?.defaultCurrency ?? DEFAULT_PRICING_POLICY.defaultCurrency,
      segments: segments.map(s => ({ id: s.id, criteria: readSegmentCriteria(s.criteria) })),
      accounts: accounts.map(a => ({ id: a.id, segmentId: a.segmentId,
        industry: a.industryId ? industryNames.get(a.industryId) ?? null : null,
        customerSize: a.customerSizeId ? sizeNames.get(a.customerSizeId) ?? null : null,
        region: a.regionId ? regionNames.get(a.regionId) ?? a.region : a.region })),
      deals: deals.map(d => ({ ...d, amount: d.amount?.toFixed(2) ?? null })), plans,
    };
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
}
