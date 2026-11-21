import { periodRange } from "../../shared/period";
import type { OpportunityRecord, WinLossReviewRecord, WinLossReasonRecord } from "../store";

export type WinLossFilter = {
  period: string; view: "list" | "analysis"; status: "all" | "pending" | "reviewed";
  outcome: "all" | "won" | "lost" | "abandoned"; dates: "period" | "undated";
  reason: string; region: string; query: string;
};
export interface WinLossRow {
  id: string; name: string; number: string; accountId: string; accountName: string | null;
  ownerSub: string; regionId: string | null; planId: string | null; campaignId: string | null;
  outcome: "won" | "lost" | "abandoned"; amount: number | null; currency: string; closedAt: string | null;
  reviewId: string | null; reviewerSub: string | null; reviewedAt: string | null;
  reasonId: string | null; reasonName: string | null; lessons: string | null; stale: boolean;
}
export function winLossRows(deals: readonly OpportunityRecord[], reviews: readonly WinLossReviewRecord[], reasons: readonly WinLossReasonRecord[]): WinLossRow[] {
  const byDeal = new Map(reviews.map(r => [r.opportunityId, r]));
  const names = new Map(reasons.map(r => [r.id, r.name]));
  return [...new Map(deals.map(d => [d.id, d])).values()].flatMap(d => {
    if (d.status === "open") return [];
    const r = byDeal.get(d.id);
    const stale = !!r && r.outcome !== d.status;
    return [{ id: d.id, name: d.name, number: d.opportunityNo, accountId: d.accountId, accountName: d.accountName ?? null,
      ownerSub: d.ownerSub, regionId: d.territoryId, planId: d.planId, campaignId: d.campaignId,
      outcome: d.status, amount: d.amount?.amount ?? null, currency: d.amount?.currency ?? d.currency,
      closedAt: d.closedAt?.toISOString() ?? null, reviewId: r?.id ?? null, reviewerSub: r?.reviewerSub ?? null,
      reviewedAt: r?.reviewedAt.toISOString() ?? null, reasonId: r?.primaryReasonId ?? null,
      reasonName: r?.primaryReasonId ? names.get(r.primaryReasonId) ?? null : null, lessons: r?.lessons ?? null, stale }];
  });
}
export function filterWinLossRows(rows: readonly WinLossRow[], f: WinLossFilter) {
  const range = periodRange(f.period);
  const query = f.query.trim().toLocaleLowerCase();
  return rows.filter(r => {
    if (f.dates === "undated" ? r.closedAt !== null : !range || !r.closedAt || new Date(r.closedAt) < range.start || new Date(r.closedAt) >= range.end) return false;
    if (f.region && r.regionId !== f.region) return false;
    if (f.outcome !== "all" && r.outcome !== f.outcome) return false;
    if (f.status === "pending" && r.reviewId) return false;
    if (f.status === "reviewed" && !r.reviewId) return false;
    if (f.reason === "unclassified" && (!r.reviewId || r.reasonId)) return false;
    if (f.reason === "stale" && !r.stale) return false;
    if (f.reason && !["unclassified", "stale"].includes(f.reason) && (r.reasonId !== f.reason || r.stale)) return false;
    return !query || [r.name, r.number, r.accountName].some(v => v?.toLocaleLowerCase().includes(query));
  });
}
export function summarizeWinLoss(rows: readonly WinLossRow[]) {
  const won = rows.filter(r => r.outcome === "won").length;
  const lost = rows.filter(r => r.outcome === "lost").length;
  const reviewed = rows.filter(r => r.reviewId).length;
  const classified = rows.filter(r => r.reviewId && r.reasonId && !r.stale);
  const reasons = [...new Set(classified.map(r => r.reasonId!))].map(id => {
    const sample = classified.filter(r => r.reasonId === id);
    return { id, name: sample[0].reasonName, count: sample.length, won: sample.filter(r => r.outcome === "won").length, lost: sample.filter(r => r.outcome === "lost").length, abandoned: sample.filter(r => r.outcome === "abandoned").length };
  }).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  const money = [...new Set(rows.map(r => r.currency))].sort((a,b) => a.localeCompare(b)).map(currency => {
    const sample = rows.filter(r => r.currency === currency);
    const known = sample.filter(r => r.amount !== null);
    return { currency, known: known.length, missing: sample.length - known.length,
      amount: known.reduce((sum, r) => sum + BigInt(Math.round(r.amount! * 100)), 0n).toString() };
  });
  return { total: rows.length, won, lost, abandoned: rows.length - won - lost, reviewed, pending: rows.length - reviewed,
    unclassified: rows.filter(r => r.reviewId && !r.reasonId).length, stale: rows.filter(r => r.stale).length,
    winRate: won + lost ? won / (won + lost) : null, reasons, money };
}
