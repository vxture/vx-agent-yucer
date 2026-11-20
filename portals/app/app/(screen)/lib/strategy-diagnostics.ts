import { diagnosticBasis } from "../../domains/strategy/lib/diagnostic-snapshots";
import { currentPeriod } from "../../domains/shared/period";
import type { SegmentCoverageSnapshotInput, TerritoryAttainmentSnapshotInput } from "../../domains/strategy/store";
import type { SegmentTrendRow, TerritoryAttainmentRow } from "../components/strategy-diag-screen";

interface DiagnosticViewInput {
  segments: SegmentCoverageSnapshotInput[];
  territories: TerritoryAttainmentSnapshotInput[];
  segmentNames: ReadonlyMap<string, string>;
  territoryNames: ReadonlyMap<string, string>;
  currentMarketBasis?: ReadonlyMap<string, string>;
  currentRevisions?: ReadonlySet<string>;
  currency: string;
  now: Date;
  windowDays: number;
}

function comparable<T extends { snapshotedAt: Date; basis?: unknown }>(rows: T[]): T[] {
  const newest = [...rows].sort((a, b) => b.snapshotedAt.getTime() - a.snapshotedAt.getTime());
  const comparisonKey = diagnosticBasis(newest[0]?.basis)?.comparisonKey;
  // Stop at the first boundary. Restoring an earlier definition cannot bridge
  // over an intervening different definition or target publication.
  const out: T[] = [];
  for (const row of newest) {
    if (diagnosticBasis(row.basis)?.comparisonKey !== comparisonKey) break;
    out.push(row);
  }
  return out.reverse();
}

function groupRows<T>(rows: readonly T[], identity: (row: T) => string, accept: (row: T) => boolean): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    if (!accept(row)) continue;
    const id = identity(row), grouped = groups.get(id) ?? [];
    grouped.push(row); groups.set(id, grouped);
  }
  return groups;
}

function inWindow(at: Date, input: DiagnosticViewInput): boolean {
  const since = input.now.getTime() - input.windowDays * 86_400_000;
  return at.getTime() >= since && at <= input.now;
}

function segmentChanges(sorted: SegmentCoverageSnapshotInput[]) {
  const first = sorted[0]!, last = sorted.at(-1)!;
  const multiple = sorted.length > 1;
  const pipelineKnown = multiple && sorted.every(r => r.openPipelineAmount !== null);
  const pipelineDelta = pipelineKnown ? last.openPipelineAmount! - first.openPipelineAmount! : null;
  // A zero baseline has no meaningful percentage; do not invent +100%.
  const pipelinePctChange = pipelineKnown && first.openPipelineAmount! > 0 ? pipelineDelta! / first.openPipelineAmount! * 100 : null;
  const countDelta = multiple ? last.matchedAccountCount - first.matchedAccountCount : null;
  return { pipelineDelta, pipelinePctChange, countDelta };
}

function segmentTrend(id: string, rows: SegmentCoverageSnapshotInput[], input: DiagnosticViewInput): SegmentTrendRow | null {
  const name = input.segmentNames.get(id);
  if (!name) return null;
  const sorted = comparable(rows), last = sorted.at(-1)!;
  if (last.currency !== input.currency) return null;
  if (input.currentMarketBasis && input.currentMarketBasis.get(id) !== diagnosticBasis(last.basis)?.comparisonKey) return null;
  const change = segmentChanges(sorted);
  return {
    segmentId: id, name, currentCount: last.matchedAccountCount, currentPipeline: last.openPipelineAmount, ...change,
    series: sorted.map(s => ({ at: s.snapshotedAt.toISOString(), count: s.matchedAccountCount, pipeline: s.openPipelineAmount, won: s.wonAmount })),
    isFalseFat: change.pipelinePctChange !== null && change.pipelinePctChange > 10 && change.countDelta !== null && change.countDelta <= 0,
  };
}

function territoryTrend(id: string, rows: TerritoryAttainmentSnapshotInput[], input: DiagnosticViewInput, period: string): TerritoryAttainmentRow | null {
  const name = input.territoryNames.get(id);
  if (!name) return null;
  const sorted = comparable(rows), last = sorted.at(-1)!;
  const basis = diagnosticBasis(last.basis);
  if (input.currentRevisions && (basis?.kind !== "published_plan" || !input.currentRevisions.has(basis.revisionId))) return null;
  return {
    territoryId: id, name, period, targetAmount: last.targetAmount, attainedAmount: last.attainedAmount,
    attainmentPct: last.targetAmount > 0 && last.attainedAmount !== null ? last.attainedAmount / last.targetAmount * 100 : null,
    series: sorted.map(s => ({ at: s.snapshotedAt.toISOString(), target: s.targetAmount, attained: s.attainedAmount })),
  };
}

function attainmentOrder(a: TerritoryAttainmentRow, b: TerritoryAttainmentRow): number {
  if (a.attainmentPct === null && b.attainmentPct === null) return 0;
  if (a.attainmentPct === null) return 1;
  if (b.attainmentPct === null) return -1;
  return b.attainmentPct - a.attainmentPct;
}

function averages(segments: SegmentTrendRow[], territories: TerritoryAttainmentRow[]) {
  const known = territories.flatMap(r => r.attainmentPct === null ? [] : [r.attainmentPct]);
  return {
    segments: segments.length, territories: territories.length,
    avgCoverage: segments.length ? Math.round(segments.reduce((n, r) => n + r.currentCount, 0) / segments.length) : null,
    avgAttainment: known.length === territories.length && known.length ? known.reduce((n, r) => n + r, 0) / known.length : null,
  };
}

export function strategyDiagnosticView(input: DiagnosticViewInput) {
  const segmentGroups = groupRows(input.segments, r => r.segmentId,
    r => inWindow(r.snapshotedAt, input) && diagnosticBasis(r.basis)?.kind === "criteria");
  const segments = [...segmentGroups].flatMap(([id, rows]) => {
    const row = segmentTrend(id, rows, input); return row ? [row] : [];
  });
  const period = currentPeriod(input.now);
  const territoryGroups = groupRows(input.territories, r => r.territoryId,
    r => r.period === period && inWindow(r.snapshotedAt, input) && r.currency === input.currency && diagnosticBasis(r.basis)?.kind === "published_plan");
  const territories = [...territoryGroups].flatMap(([id, rows]) => {
    const row = territoryTrend(id, rows, input, period); return row ? [row] : [];
  });
  segments.sort((a, b) => b.currentCount - a.currentCount);
  territories.sort(attainmentOrder);
  return { segments, territories, period,
    warningsMeasured: segments.length > 0 && segments.every(s => s.pipelinePctChange !== null),
    totals: averages(segments, territories) };
}
