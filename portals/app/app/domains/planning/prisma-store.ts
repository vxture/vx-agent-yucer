import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import { DEFAULT_CURRENCY, money } from "../shared/money";
import type { TerritoryDraft } from "./lib/territory";
import { currencyOf, targetValue, type PublishedTotals, type SalesTarget, type TargetMetric, type TargetScope, type TargetStatus, type TargetValue } from "./lib/target";
import type { PlanningStore, TargetFilter, TargetRecord, TerritoryRecord } from "./store";

// Prisma-backed PlanningStore over yucer_gtm.
//
// The scope tuple never appears in an update. createTarget writes it once;
// updateTarget's data object is built field by field from a patch type that has
// no scope fields at all, so there is no path by which a commitment silently
// moves between people or periods.
//
// closedAmountFor reads D6's forecast snapshots. D2 sets targets, D6 computes
// achievement, and neither writes the other's data - so attainment reads the
// snapshot rather than recomputing a closed amount that already has an owner.

const TARGET_TABLE = "yucer_gtm.sales_target";
const TERRITORY_TABLE = "yucer_gtm.territory";

export class PrismaPlanningStore implements PlanningStore {
  async listTargets(workspaceId: string, filter: TargetFilter = {}): Promise<TargetRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.salesTarget.findMany({
      where: {
        workspaceId,
        ...(filter.period ? { period: filter.period } : {}),
        ...(filter.ownerSub ? { ownerSub: filter.ownerSub } : {}),
        ...(filter.territoryId ? { territoryId: filter.territoryId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: [{ period: "desc" }, { scopeType: "asc" }],
    });
    return rows.map((r: Record<string, unknown>) => toTarget(r));
  }

  async getTarget(workspaceId: string, id: string): Promise<TargetRecord | null> {
    const p = await getPrismaClient();
    const row = await p.salesTarget.findFirst({ where: { id, workspaceId } });
    return row ? toTarget(row as Record<string, unknown>) : null;
  }

  async upsertTerritory(workspaceId: string, input: TerritoryDraft): Promise<TerritoryRecord> {
    const p = await getPrismaClient();
    const update = {
      name: input.name,
      parentId: input.parentId,
      ownerSub: input.ownerSub,
      status: input.status,
      updatedAt: new Date(),
    };
    // The update half only - the create half writes the anchor once, which is
    // exactly what the column lock permits and what assertWritable checks.
    const guard = assertWritable(TERRITORY_TABLE, update);
    if (!guard.ok) {
      throw new Error(
        `refusing to write a locked territory column: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }
    const row = await p.territory.upsert({
      where: { workspaceId_territoryCode: { workspaceId, territoryCode: input.territoryCode } },
      update,
      create: { workspaceId, territoryCode: input.territoryCode, ...update },
    });
    return toTerritory(row as Record<string, unknown>);
  }

  async createTarget(workspaceId: string, target: SalesTarget): Promise<TargetRecord> {
    const p = await getPrismaClient();
    const row = await p.salesTarget.create({
      data: {
        workspaceId,
        planId: target.planId,
        period: target.period,
        scopeType: target.scopeType,
        territoryId: target.territoryId,
        ownerSub: target.ownerSub,
        metric: target.metric,
        targetAmount: target.targetValue.amount,
        // NULL for a count metric - incr/0013's CHECK enforces the pairing, and
        // currencyOf is the single place that decides it.
        currency: currencyOf(target.targetValue),
      },
    });
    return toTarget(row as Record<string, unknown>);
  }

  async updateTarget(
    workspaceId: string,
    id: string,
    patch: { targetValue?: TargetValue; status?: TargetStatus; planId?: string | null },
  ): Promise<boolean> {
    const p = await getPrismaClient();
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.planId !== undefined) data.planId = patch.planId;
    if (patch.targetValue !== undefined) {
      data.targetAmount = patch.targetValue.amount;
      data.currency = currencyOf(patch.targetValue);
    }

    const guard = assertWritable(TARGET_TABLE, data);
    if (!guard.ok) {
      throw new Error(
        `refusing to write the target scope tuple: ${guard.violations.map((v) => v.message).join("; ")}`,
      );
    }

    const res = await p.salesTarget.updateMany({ where: { id, workspaceId }, data });
    return res.count > 0;
  }

  async listTerritories(
    workspaceId: string,
    opts: { includeRetired?: boolean } = {},
  ): Promise<TerritoryRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.territory.findMany({
      // Active only by DEFAULT, and explicit about it. This adapter filtered on
      // status while the in-memory one did not, so the two answered the same
      // question differently: every test saw retired rows and production never
      // did. The default is the one the scope selector needs - you should not
      // be able to set a target on a region that has been wound down - and the
      // management panel asks for the rest by name.
      where: { workspaceId, ...(opts.includeRetired ? {} : { status: "active" }) },
      orderBy: { territoryCode: "asc" },
    });
    return rows.map((r: Record<string, unknown>) => toTerritory(r));
  }

  async publishedTotalsFor(workspaceId: string, scope: TargetScope): Promise<PublishedTotals | null> {
    const p = await getPrismaClient();
    // The LATEST snapshot for the scope. Snapshots are append-only and a period
    // accumulates many; attainment is measured against the most recent one, and
    // the older ones are what forecast accuracy is computed from.
    const row = await p.forecastSnapshot.findFirst({
      where: {
        workspaceId,
        period: scope.period,
        scopeType: scope.scopeType,
        territoryId: scope.territoryId,
        ownerSub: scope.ownerSub,
      },
      orderBy: { snapshotAt: "desc" },
    });
    if (!row) return null;
    return {
      closedAmount: money(Number(String(row.closedAmount)), String(row.currency)),
      pipelineAmount: money(Number(String(row.pipelineAmount)), String(row.currency)),
      newLogoCount: row.newLogoCount ?? null,
    };
  }
}

function toTerritory(r: Record<string, unknown>): TerritoryRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    territoryCode: String(r.territoryCode),
    name: String(r.name),
    parentId: (r.parentId as string | null) ?? null,
    // Tolerant of pre-0017 rows: absent reads as covering nothing, the same
    // answer an empty list gives and the safe one for a router.
    regions: Array.isArray(r.regions) ? (r.regions as unknown[]).map(String) : [],
    ownerSub: (r.ownerSub as string | null) ?? null,
    status: String(r.status),
  };
}

function toTarget(r: Record<string, unknown>): TargetRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspaceId),
    period: String(r.period),
    scopeType: r.scopeType as TargetScope["scopeType"],
    territoryId: (r.territoryId as string | null) ?? null,
    ownerSub: (r.ownerSub as string | null) ?? null,
    metric: r.metric as TargetMetric,
    // The unit is derived from the metric, never read back from the row: a row
    // whose currency disagreed with its metric would otherwise reintroduce the
    // exact ambiguity incr/0013 removed.
    targetValue: targetValue(
      r.metric as TargetMetric,
      Number(String(r.targetAmount)),
      r.currency == null ? DEFAULT_CURRENCY : String(r.currency),
    ),
    status: r.status as TargetStatus,
    planId: (r.planId as string | null) ?? null,
  };
}
