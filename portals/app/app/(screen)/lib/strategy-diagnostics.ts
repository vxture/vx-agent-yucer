import { diagnosticBasis } from "../../domains/strategy/lib/diagnostic-snapshots";
import { currentPeriod } from "../../domains/shared/period";
import type { SegmentCoverageSnapshotInput, TerritoryAttainmentSnapshotInput } from "../../domains/strategy/store";
import type { SegmentTrendRow, TerritoryAttainmentRow } from "../components/strategy-diag-screen";

function comparable<T extends { snapshotedAt: Date; basis?: unknown }>(rows: T[]): T[] {
  const newest = [...rows].sort((a, b) => b.snapshotedAt.getTime() - a.snapshotedAt.getTime());
  const comparisonKey = diagnosticBasis(newest[0]?.basis)?.comparisonKey;
  // Stop at the first boundary. Switching a definition back must not bridge
  // over an intervening different definition or target publication.
  const out: T[] = [];
  for (const row of newest) {
    if (diagnosticBasis(row.basis)?.comparisonKey !== comparisonKey) break;
    out.push(row);
  }
  return out.reverse();
}

export function strategyDiagnosticView(input: {
  segments: SegmentCoverageSnapshotInput[];
  territories: TerritoryAttainmentSnapshotInput[];
  segmentNames: ReadonlyMap<string, string>;
  territoryNames: ReadonlyMap<string, string>;
  currentMarketBasis?: ReadonlyMap<string, string>;
  currentRevisions?: ReadonlySet<string>;
  currency: string;
  now: Date;
  windowDays: number;
}) {
  const since = input.now.getTime() - input.windowDays * 86_400_000;
  const inWindow = (at: Date) => at.getTime() >= since && at <= input.now;
  const segmentGroups = new Map<string, SegmentCoverageSnapshotInput[]>();
  for (const row of input.segments) {
    if (!inWindow(row.snapshotedAt) || diagnosticBasis(row.basis)?.kind !== "criteria") continue;
    const rows = segmentGroups.get(row.segmentId) ?? [];
    rows.push(row); segmentGroups.set(row.segmentId, rows);
  }
  const segments: SegmentTrendRow[] = [];
  for (const [id, rows] of segmentGroups) {
    const name = input.segmentNames.get(id);
    if (!name) continue;
    const sorted = comparable(rows), first = sorted[0]!, last = sorted.at(-1)!;
    if (last.currency !== input.currency) continue;
    if (input.currentMarketBasis && input.currentMarketBasis.get(id) !== diagnosticBasis(last.basis)?.comparisonKey) continue;
    const multiple = sorted.length > 1;
    const pipelineKnown = multiple && sorted.every(r => r.openPipelineAmount !== null);
    const pipelineDelta = pipelineKnown ? last.openPipelineAmount! - first.openPipelineAmount! : null;
    // A zero baseline has no meaningful percentage; do not invent +100%.
    const pipelinePctChange = pipelineKnown && first.openPipelineAmount! > 0 ? pipelineDelta! / first.openPipelineAmount! * 100 : null;
    const countDelta = multiple ? last.matchedAccountCount - first.matchedAccountCount : null;
    segments.push({ segmentId: id, name, currentCount: last.matchedAccountCount, countDelta,
      currentPipeline: last.openPipelineAmount, pipelineDelta, pipelinePctChange,
      series: sorted.map(s => ({ at: s.snapshotedAt.toISOString(), count: s.matchedAccountCount, pipeline: s.openPipelineAmount, won: s.wonAmount })),
      isFalseFat: pipelinePctChange !== null && pipelinePctChange > 10 && countDelta !== null && countDelta <= 0 });
  }
  const period = currentPeriod(input.now);
  const territoryGroups = new Map<string, TerritoryAttainmentSnapshotInput[]>();
  for (const row of input.territories) {
    if (row.period !== period || !inWindow(row.snapshotedAt) || row.currency !== input.currency || diagnosticBasis(row.basis)?.kind !== "published_plan") continue;
    const rows = territoryGroups.get(row.territoryId) ?? [];
    rows.push(row); territoryGroups.set(row.territoryId, rows);
  }
  const territories: TerritoryAttainmentRow[] = [];
  for (const [id, rows] of territoryGroups) {
    const name = input.territoryNames.get(id);
    if (!name) continue;
    const sorted = comparable(rows), last = sorted.at(-1)!;
    const basis = diagnosticBasis(last.basis);
    if (input.currentRevisions && (basis?.kind !== "published_plan" || !input.currentRevisions.has(basis.revisionId))) continue;
    territories.push({ territoryId: id, name, period, targetAmount: last.targetAmount, attainedAmount: last.attainedAmount,
      attainmentPct: last.targetAmount > 0 && last.attainedAmount !== null ? last.attainedAmount / last.targetAmount * 100 : null,
      series: sorted.map(s => ({ at: s.snapshotedAt.toISOString(), target: s.targetAmount, attained: s.attainedAmount })) });
  }
  segments.sort((a, b) => b.currentCount - a.currentCount);
  territories.sort((a, b) => a.attainmentPct === null ? b.attainmentPct === null ? 0 : 1 : b.attainmentPct === null ? -1 : b.attainmentPct - a.attainmentPct);
  const known = territories.flatMap(r => r.attainmentPct === null ? [] : [r.attainmentPct]);
  return { segments, territories, period,
    warningsMeasured: segments.length > 0 && segments.every(s => s.pipelinePctChange !== null),
    totals: { segments: segments.length, territories: territories.length,
      avgCoverage: segments.length ? Math.round(segments.reduce((n, r) => n + r.currentCount, 0) / segments.length) : null,
      avgAttainment: known.length === territories.length && known.length ? known.reduce((n, r) => n + r, 0) / known.length : null } };
}
