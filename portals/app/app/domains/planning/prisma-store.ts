import { getPrismaClient } from "../../lib/db";
import { assertWritable } from "../shared/column-locks";
import { money, type Money } from "../shared/money";
import type { SalesTarget, TargetMetric, TargetScope, TargetStatus } from "./lib/target";
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
        targetAmount: target.targetAmount.amount,
        currency: target.targetAmount.currency,
      },
    });
    return toTarget(row as Record<string, unknown>);
  }

  async updateTarget(
    workspaceId: string,
    id: string,
    patch: { targetAmount?: Money; status?: TargetStatus; planId?: string | null },
  ): Promise<boolean> {
    const p = await getPrismaClient();
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.planId !== undefined) data.planId = patch.planId;
    if (patch.targetAmount !== undefined) {
      data.targetAmount = patch.targetAmount.amount;
      data.currency = patch.targetAmount.currency;
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

  async listTerritories(workspaceId: string): Promise<TerritoryRecord[]> {
    const p = await getPrismaClient();
    const rows = await p.territory.findMany({
      where: { workspaceId, status: "active" },
      orderBy: { territoryCode: "asc" },
    });
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      workspaceId: String(r.workspaceId),
      territoryCode: String(r.territoryCode),
      name: String(r.name),
      parentId: (r.parentId as string | null) ?? null,
      ownerSub: (r.ownerSub as string | null) ?? null,
      status: String(r.status),
    }));
  }

  async closedAmountFor(workspaceId: string, scope: TargetScope): Promise<Money | null> {
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
    return money(Number(String(row.closedAmount)), String(row.currency));
  }
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
    targetAmount: money(Number(String(r.targetAmount)), String(r.currency)),
    status: r.status as TargetStatus,
    planId: (r.planId as string | null) ?? null,
  };
}
