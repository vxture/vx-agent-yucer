import { getPrismaClient } from "../../lib/db";
import { getStrategyStore } from "../shared/registry";
import type { StrategyStore, SegmentCoverageSnapshotInput, TerritoryAttainmentSnapshotInput } from "./store";

// The strategy snapshot job (workplan batch 11a-4, ADR-033 scheduler).
//
// WHY THIS IS AUTOMATIC AND forecast_snapshot IS MANUAL.
//
// forecast_snapshot records a human's declared numbers at a point in time:
// "the team commits to X this quarter." A scheduler cannot produce that -
// commitment is a speech act, not a derivation. The strategy snapshots are
// the opposite: "how many accounts does segment S cover right now" is a
// COUNT(*) with a WHERE clause, and the whole value is that it runs without
// anybody remembering to click a button.
//
// The scheduler writes one row per (workspace, segment) and one row per
// (workspace, territory, period) at the configured cadence. A manual
// trigger can write an additional point through the same store method.

export interface SnapshotLedger {
  segmentSnapshots: number;
  territorySnapshots: number;
  workspacesProcessed: number;
  failed: number;
}

export interface SnapshotOptions {
  workspaces: readonly { workspaceId: string }[];
  now?: Date;
  store?: StrategyStore;
}

export async function runStrategySnapshots(options: SnapshotOptions): Promise<SnapshotLedger> {
  const now = options.now ?? new Date();
  const store = options.store ?? getStrategyStore();
  const ledger: SnapshotLedger = { segmentSnapshots: 0, territorySnapshots: 0, workspacesProcessed: 0, failed: 0 };

  for (const { workspaceId } of options.workspaces) {
    try {
      const seg = await captureSegmentCoverage(workspaceId, now, store);
      const terr = await captureTerritoryAttainment(workspaceId, now, store);
      ledger.segmentSnapshots += seg;
      ledger.territorySnapshots += terr;
      ledger.workspacesProcessed += 1;
    } catch {
      ledger.failed += 1;
    }
  }

  return ledger;
}

async function captureSegmentCoverage(
  workspaceId: string,
  now: Date,
  store: StrategyStore,
): Promise<number> {
  const p = await getPrismaClient();
  const segments = await p.marketSegment.findMany({
    where: { workspaceId, status: "active" },
    select: { id: true },
  });
  if (segments.length === 0) return 0;

  let written = 0;
  for (const seg of segments) {
    const stats = await computeSegmentStats(workspaceId, seg.id);
    const row: SegmentCoverageSnapshotInput = {
      segmentId: seg.id,
      snapshotedAt: now,
      matchedAccountCount: stats.accountCount,
      openPipelineAmount: stats.openPipelineAmount,
      wonAmount: stats.wonAmount,
      currency: "CNY",
    };
    await store.appendSegmentCoverageSnapshot(workspaceId, row);
    written += 1;
  }
  return written;
}

async function computeSegmentStats(
  workspaceId: string,
  segmentId: string,
): Promise<{ accountCount: number; openPipelineAmount: number; wonAmount: number }> {
  const p = await getPrismaClient();
  const seg = await p.marketSegment.findFirst({
    where: { id: segmentId, workspaceId },
    select: { segmentCode: true },
  });
  if (!seg) return { accountCount: 0, openPipelineAmount: 0, wonAmount: 0 };

  const accountCount = await p.account.count({
    where: { workspaceId, segmentCode: seg.segmentCode, deletedAt: null },
  });

  const pipeline = await p.opportunity.aggregate({
    where: { workspaceId, deletedAt: null, status: "open" },
    _sum: { amount: true },
  });
  const won = await p.opportunity.aggregate({
    where: { workspaceId, deletedAt: null, status: "won" },
    _sum: { amount: true },
  });

  return {
    accountCount,
    openPipelineAmount: Number(pipeline._sum.amount ?? 0),
    wonAmount: Number(won._sum.amount ?? 0),
  };
}

async function captureTerritoryAttainment(
  workspaceId: string,
  now: Date,
  store: StrategyStore,
): Promise<number> {
  const p = await getPrismaClient();
  const targets = await p.salesTarget.findMany({
    where: { workspaceId, territoryId: { not: null } },
    select: { territoryId: true, period: true, targetAmount: true, currency: true },
  });
  if (targets.length === 0) return 0;

  const grouped = new Map<string, { territoryId: string; period: string; targetAmount: number; currency: string }>();
  for (const t of targets) {
    if (!t.territoryId) continue;
    const key = `${t.territoryId}|${t.period}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        territoryId: t.territoryId!,
        period: t.period,
        targetAmount: Number(t.targetAmount ?? 0),
        currency: t.currency ?? "CNY",
      });
    }
  }

  let written = 0;
  for (const g of grouped.values()) {
    const attained = await computeTerritoryAttainment(workspaceId, g.territoryId, g.period);
    const row: TerritoryAttainmentSnapshotInput = {
      territoryId: g.territoryId,
      period: g.period,
      snapshotedAt: now,
      targetAmount: g.targetAmount,
      attainedAmount: attained,
      currency: g.currency,
    };
    await store.appendTerritoryAttainmentSnapshot(workspaceId, row);
    written += 1;
  }
  return written;
}

async function computeTerritoryAttainment(
  workspaceId: string,
  territoryId: string,
  _period: string,
): Promise<number> {
  const p = await getPrismaClient();
  const result = await p.opportunity.aggregate({
    where: { workspaceId, territoryId, deletedAt: null, status: "won" },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}
