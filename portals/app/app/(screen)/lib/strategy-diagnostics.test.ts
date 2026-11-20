import { test } from "node:test";
import assert from "node:assert/strict";
import { strategyDiagnosticView } from "./strategy-diagnostics";
import type { SegmentCoverageSnapshotInput, TerritoryAttainmentSnapshotInput } from "../../domains/strategy/store";
const NOW = new Date("2026-11-19T12:00:00Z");
const basis = { version: 2 as const, kind: "criteria" as const, comparisonKey: "a".repeat(64), assignedAccounts: 1, incompleteAccounts: 0, unpricedOpen: 0, unpricedWon: 0, undatedWon: 0, excludedCurrencyDeals: 0 };
function point(date: string, changes: Partial<SegmentCoverageSnapshotInput> = {}): SegmentCoverageSnapshotInput {
  return { segmentId: "m", snapshotedAt: new Date(date), matchedAccountCount: 1, openPipelineAmount: 100, wonAmount: 0, currency: "CNY", basis, ...changes };
}
function regional(changes: Partial<TerritoryAttainmentSnapshotInput> = {}): TerritoryAttainmentSnapshotInput {
  return { territoryId: "r", period: "2026Q4", snapshotedAt: NOW, targetAmount: 1000, attainedAmount: 100, currency: "CNY", basis: { version: 2, kind: "published_plan", comparisonKey: "b".repeat(64), planId: "p", revisionId: "rev1", revisionVersion: 1, lineKey: "line1", periodStart: "2026-10-01", periodEnd: "2027-01-01", incompleteDeals: 0, excludedCurrencyDeals: 0 }, ...changes };
}
const view = (segments: SegmentCoverageSnapshotInput[] = [], territories: TerritoryAttainmentSnapshotInput[] = []) => strategyDiagnosticView({ segments, territories, segmentNames: new Map([["m", "Market"]]), territoryNames: new Map([["r", "Region"]]), currency: "CNY", now: NOW, windowDays: 30 });

test("legacy, wrong currency, future points and points outside 30 days cannot enter diagnostics", () => {
  const r = view([point("2026-11-18", { basis: undefined }), point("2026-11-18", { currency: "USD" }), point("2026-12-01"), point("2026-10-19")]);
  assert.deepEqual(r.segments, []); assert.equal(r.totals.avgCoverage, null); assert.equal(r.totals.avgAttainment, null); assert.equal(r.warningsMeasured, false);
});
test("a single observation is not a trend and missing money is not zero", () => {
  const r = view([point("2026-11-18", { openPipelineAmount: null })], [regional({ attainedAmount: null })]);
  assert.equal(r.segments[0].countDelta, null); assert.equal(r.segments[0].pipelinePctChange, null); assert.equal(r.segments[0].currentPipeline, null);
  assert.equal(r.territories[0].attainmentPct, null); assert.equal(r.totals.avgAttainment, null); assert.equal(r.warningsMeasured, false);
});
test("definition changes split the series even when a definition is later restored", () => {
  const r = view([point("2026-11-16"), point("2026-11-17", { basis: { ...basis, comparisonKey: "c".repeat(64) } }), point("2026-11-18")]);
  assert.equal(r.segments[0].series.length, 1); assert.equal(r.segments[0].isFalseFat, false);
});
test("two comparable observations can warn, but unknown intermediate values cannot be bridged", () => {
  const points = [point("2026-11-16"), point("2026-11-18", { openPipelineAmount: 120 })];
  assert.equal(view(points).segments[0].isFalseFat, true);
  assert.equal(view([...points, point("2026-11-17", { openPipelineAmount: null })]).segments[0].isFalseFat, false);
  assert.equal(view([point("2026-11-16", { openPipelineAmount: 0 }), points[1]]).segments[0].pipelinePctChange, null);
});
test("quarterly attainment never averages annual or other-quarter targets, and zero target is unmeasured", () => {
  const r = view([], [regional(), regional({ period: "Y2026" }), regional({ period: "2026Q3" })]);
  assert.equal(r.territories.length, 1); assert.equal(r.totals.avgAttainment, 10);
  assert.equal(view([], [regional({ targetAmount: 0 })]).territories[0].attainmentPct, null);
});
test("new planning publication begins a fresh series", () => {
  const recent = regional(), old = regional({ snapshotedAt: new Date("2026-11-18") });
  recent.basis = { ...recent.basis!, comparisonKey: "d".repeat(64) };
  assert.equal(view([], [old, recent]).territories[0].series.length, 1);
});

test("live market and publication changes hide stale points before the next scheduler tick", () => {
  const r = strategyDiagnosticView({ segments: [point("2026-11-18")], territories: [regional()], segmentNames: new Map([["m", "Market"]]), territoryNames: new Map([["r", "Region"]]), currentMarketBasis: new Map([["m", "e".repeat(64)]]), currentRevisions: new Set(["rev2"]), currency: "CNY", now: NOW, windowDays: 30 });
  assert.deepEqual(r.segments, []); assert.deepEqual(r.territories, []);
});

test("switching currency away and back cannot bridge over the intervening currency", () => {
  const r = view([point("2026-11-16"), point("2026-11-17", { currency: "USD", basis: { ...basis, comparisonKey: "c".repeat(64) } }), point("2026-11-18")]);
  assert.equal(r.segments[0].series.length, 1);
});
