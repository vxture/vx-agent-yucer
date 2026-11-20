import { createHash } from "node:crypto";
import { canonical, planVersions, type SalesPlan } from "../../planning/plan-model";
import { periodRange, within } from "../../shared/period";
import { marketMatch, type MarketClassification } from "./market-match";
import type { SegmentCriteria } from "./lifecycle";
import type { SegmentCoverageSnapshotInput, TerritoryAttainmentSnapshotInput } from "../store";

export interface SegmentSnapshotBasis {
  version: 2;
  kind: "criteria";
  comparisonKey: string;
  assignedAccounts: number;
  incompleteAccounts: number;
  unpricedOpen: number;
  unpricedWon: number;
  undatedWon: number;
  excludedCurrencyDeals: number;
}
export interface TerritorySnapshotBasis {
  version: 2;
  kind: "published_plan";
  comparisonKey: string;
  planId: string;
  revisionId: string;
  revisionVersion: number;
  lineKey: string;
  periodStart: string;
  periodEnd: string;
  incompleteDeals: number;
  excludedCurrencyDeals: number;
}
export type DiagnosticBasis = SegmentSnapshotBasis | TerritorySnapshotBasis;

export function diagnosticBasis(value: unknown): DiagnosticBasis | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 2 || typeof v.comparisonKey !== "string" || !/^[a-f0-9]{64}$/.test(v.comparisonKey)) return null;
  if (v.kind === "criteria") return value as SegmentSnapshotBasis;
  if (v.kind === "published_plan" && typeof v.revisionId === "string" && typeof v.lineKey === "string") return value as TerritorySnapshotBasis;
  return null;
}

export interface DiagnosticDeal {
  id: string;
  accountId: string;
  territoryId: string | null;
  status: string;
  amount: string | null;
  currency: string;
  closedAt: Date | null;
}
export interface DiagnosticSource {
  currency: string;
  segments: { id: string; criteria: SegmentCriteria }[];
  accounts: (MarketClassification & { id: string; segmentId: string | null })[];
  deals: DiagnosticDeal[];
  plans: SalesPlan[];
}

const key = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
export const marketComparisonKey = (criteria: SegmentCriteria, currency: string) => key({
  currency, industries: [...criteria.industries].sort(), regions: [...criteria.regions].sort(), sizes: [...(criteria.sizes ?? [])].sort(),
});
// NUMERIC(18,2), kept as integer cents until the port's existing number boundary.
function cents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function total(values: readonly string[]): number | null {
  const minor = values.reduce((n, v) => n + cents(v), 0n);
  const value = Number(minor);
  return Number.isSafeInteger(value) ? value / 100 : null;
}
const unique = <T extends { id: string }>(rows: readonly T[]): T[] => [...new Map(rows.map(r => [r.id, r])).values()];

function segmentSnapshot(source: DiagnosticSource, segment: DiagnosticSource["segments"][number], now: Date): SegmentCoverageSnapshotInput {
  const accounts = unique(source.accounts);
  const matches = new Set(accounts.filter(a => marketMatch(a, segment.criteria) === "match").map(a => a.id));
  const scoped = unique(source.deals).filter(d => matches.has(d.accountId) && (d.status === "open" || d.status === "won"));
  const relevant = scoped.filter(d => d.currency === source.currency);
  const open = relevant.filter(d => d.status === "open");
  const won = relevant.filter(d => d.status === "won" && (!d.closedAt || d.closedAt <= now));
  const unpricedOpen = open.filter(d => d.amount === null).length;
  const unpricedWon = won.filter(d => d.amount === null).length;
  const undatedWon = won.filter(d => d.closedAt === null).length;
  return {
    segmentId: segment.id, snapshotedAt: now, matchedAccountCount: matches.size,
    openPipelineAmount: unpricedOpen ? null : total(open.map(d => d.amount!)),
    wonAmount: unpricedWon || undatedWon ? null : total(won.map(d => d.amount!)), currency: source.currency,
    basis: {
      version: 2, kind: "criteria",
      comparisonKey: marketComparisonKey(segment.criteria, source.currency),
      assignedAccounts: accounts.filter(a => a.segmentId === segment.id).length,
      incompleteAccounts: accounts.filter(a => marketMatch(a, segment.criteria) === "missing").length,
      unpricedOpen, unpricedWon, undatedWon,
      excludedCurrencyDeals: scoped.filter(d => d.currency !== source.currency).length,
    },
  };
}

function territorySnapshots(source: DiagnosticSource, now: Date): TerritoryAttainmentSnapshotInput[] {
  const rows: TerritoryAttainmentSnapshotInput[] = [];
  for (const plan of source.plans) {
    const revision = planVersions(plan, now.toISOString()).current;
    if (!revision || revision.state !== "sealed" || revision.version === null) continue;
    for (const line of revision.content.targets) {
      if (line.metric !== "revenue" || line.target === null || !line.currency || !line.scope.startsWith("territory:")) continue;
      const territoryId = line.scope.slice(10);
      const region = revision.content.regions.find(r => r.id === territoryId && r.included);
      const range = periodRange(line.period);
      // Capture present facts only. Do not reconstruct past points from today's
      // mutable deals or create forecasts for periods that have not started.
      if (!region || !range || !within(range, now)) continue;
      const scoped = unique(source.deals).filter(d => d.status === "won" &&
        (d.territoryId === territoryId || d.territoryId === null) &&
        (!d.closedAt || within(range, d.closedAt) && d.closedAt <= now));
      const relevant = scoped.filter(d => d.currency === line.currency);
      const incompleteDeals = relevant.filter(d => !d.territoryId || !d.closedAt || d.amount === null).length;
      rows.push({
        territoryId, period: line.period, snapshotedAt: now,
        targetAmount: Number(line.target), attainedAmount: incompleteDeals ? null : total(relevant.map(d => d.amount!)), currency: line.currency,
        basis: {
          version: 2, kind: "published_plan",
          comparisonKey: key({ revisionId: revision.id, lineKey: line.key, currency: line.currency, target: line.target, start: range.start.toISOString(), end: range.end.toISOString() }),
          planId: plan.id, revisionId: revision.id, revisionVersion: revision.version,
          lineKey: line.key, periodStart: range.start.toISOString(), periodEnd: range.end.toISOString(),
          incompleteDeals, excludedCurrencyDeals: scoped.filter(d => d.currency !== line.currency).length,
        },
      });
    }
  }
  return rows;
}

export function computeDiagnosticSnapshots(source: DiagnosticSource, now: Date) {
  return { segments: source.segments.map(s => segmentSnapshot(source, s, now)), territories: territorySnapshots(source, now) };
}
