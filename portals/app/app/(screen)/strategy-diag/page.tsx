import { EmptyState } from "@vxture/design-ui";
import { resolveAppSession } from "../../(app)/lib/session";
import { getMessages } from "../../(app)/lib/i18n/server";
import { SignIn } from "../../(app)/components/sign-in";
import { can } from "../../authz/decide";
import { getPrismaClient } from "../../lib/db";
import {
  StrategyDiagScreen,
  type SegmentTrendRow,
  type TerritoryAttainmentRow,
} from "../components/strategy-diag-screen";

// 战略诊断 - strategy diagnostics screen (batch 11c).
//
// Reads the snapshot tables created in batch 11a and renders three panels:
// segment coverage trend ranking, territory attainment comparison, and
// "false fat" warnings (pipeline amount growing while customer count is
// stagnant). Same (screen) route group as 全国态势屏 and 赋能分析 -
// chromeless, dark ground, meant for a wall display.
//
// GATED ON strategy.plan.view - the same action that gates the strategy
// domain page. No new permission point: this screen only reads what the
// strategy domain already allows.

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const MAX_SNAPSHOTS = 12;

export default async function StrategyDiagPage() {
  const { STRATEGY_DIAG_TEXT: T } = await getMessages();
  const session = await resolveAppSession();

  if (!session) {
    return <SignIn />;
  }

  if (!can(session.authz, session.entitlement, "strategy.plan.view", "ui").allowed) {
    return (
      <EmptyState
        title={T.deniedTitle}
        description={T.deniedDescription}
      />
    );
  }

  const p = await getPrismaClient();
  const wid = session.workspaceId;

  const [segSnapshots, terrSnapshots, segments, territories] = await Promise.all([
    p.segmentCoverageSnapshot.findMany({
      where: { workspaceId: wid },
      orderBy: { snapshotedAt: "desc" },
      take: 500,
    }),
    p.territoryAttainmentSnapshot.findMany({
      where: { workspaceId: wid },
      orderBy: { snapshotedAt: "desc" },
      take: 500,
    }),
    p.marketSegment.findMany({
      where: { workspaceId: wid, status: "active" },
      select: { id: true, name: true },
    }),
    p.territory.findMany({
      where: { workspaceId: wid },
      select: { id: true, name: true },
    }),
  ]);

  const segNameMap = new Map(segments.map((s) => [s.id, s.name]));
  const terrNameMap = new Map(territories.map((t) => [t.id, t.name]));

  // Group segment snapshots by segmentId, keep the most recent MAX_SNAPSHOTS.
  const segBySegment = new Map<string, typeof segSnapshots>();
  for (const snap of segSnapshots) {
    const list = segBySegment.get(snap.segmentId) ?? [];
    if (list.length < MAX_SNAPSHOTS) list.push(snap);
    segBySegment.set(snap.segmentId, list);
  }

  const segmentTrends: SegmentTrendRow[] = [];
  for (const [segId, snaps] of segBySegment) {
    const name = segNameMap.get(segId);
    if (!name) continue;
    const sorted = [...snaps].sort(
      (a, b) => a.snapshotedAt.getTime() - b.snapshotedAt.getTime(),
    );
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const currentCount = last.matchedAccountCount;
    const currentPipeline = Number(last.openPipelineAmount);
    const countDelta = last.matchedAccountCount - first.matchedAccountCount;
    const firstPipeline = Number(first.openPipelineAmount);
    const pipelineDelta = currentPipeline - firstPipeline;
    const pipelinePctChange =
      firstPipeline > 0
        ? ((pipelineDelta / firstPipeline) * 100)
        : pipelineDelta > 0
          ? 100
          : 0;

    segmentTrends.push({
      segmentId: segId,
      name,
      currentCount,
      countDelta,
      currentPipeline,
      pipelineDelta,
      pipelinePctChange,
      series: sorted.map((s) => ({
        at: s.snapshotedAt.toISOString(),
        count: s.matchedAccountCount,
        pipeline: Number(s.openPipelineAmount),
        won: Number(s.wonAmount),
      })),
      isFalseFat: pipelinePctChange > 10 && countDelta <= 0,
    });
  }

  segmentTrends.sort((a, b) => b.currentCount - a.currentCount);

  // Group territory snapshots by territoryId+period.
  const terrByKey = new Map<string, typeof terrSnapshots>();
  for (const snap of terrSnapshots) {
    const key = `${snap.territoryId}|${snap.period}`;
    const list = terrByKey.get(key) ?? [];
    if (list.length < MAX_SNAPSHOTS) list.push(snap);
    terrByKey.set(key, list);
  }

  const territoryRows: TerritoryAttainmentRow[] = [];
  for (const [, snaps] of terrByKey) {
    const sorted = [...snaps].sort(
      (a, b) => a.snapshotedAt.getTime() - b.snapshotedAt.getTime(),
    );
    const last = sorted[sorted.length - 1]!;
    const name = terrNameMap.get(last.territoryId);
    if (!name) continue;
    const target = Number(last.targetAmount);
    const attained = Number(last.attainedAmount);
    territoryRows.push({
      territoryId: last.territoryId,
      name,
      period: last.period,
      targetAmount: target,
      attainedAmount: attained,
      attainmentPct: target > 0 ? (attained / target) * 100 : 0,
      series: sorted.map((s) => ({
        at: s.snapshotedAt.toISOString(),
        target: Number(s.targetAmount),
        attained: Number(s.attainedAmount),
      })),
    });
  }

  territoryRows.sort((a, b) => b.attainmentPct - a.attainmentPct);

  const avgCoverage =
    segmentTrends.length > 0
      ? Math.round(
          segmentTrends.reduce((s, r) => s + r.currentCount, 0) /
            segmentTrends.length,
        )
      : 0;
  const avgAttainment =
    territoryRows.length > 0
      ? territoryRows.reduce((s, r) => s + r.attainmentPct, 0) /
        territoryRows.length
      : 0;

  return (
    <StrategyDiagScreen
      segments={segmentTrends}
      territories={territoryRows}
      windowDays={WINDOW_DAYS}
      totals={{
        segments: segmentTrends.length,
        territories: territoryRows.length,
        avgCoverage,
        avgAttainment,
      }}
    />
  );
}
