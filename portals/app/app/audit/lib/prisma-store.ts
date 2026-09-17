import type { PrismaClient } from "@prisma/client";
import type { AuditEventListRow, AuditOutcome, AuditStore, AuditEventRow } from "./store";
import { getPrismaClient } from "../../lib/db";

// Prisma-backed AuditStore over local_audit.event. Used when DATABASE_URL is
// set. Insert-only, matching the table's grants (no UPDATE, no DELETE).

export class PrismaAuditStore implements AuditStore {
  constructor(private readonly client: () => Promise<PrismaClient> = getPrismaClient) {}

  async record(row: AuditEventRow): Promise<void> {
    const p = await this.client();
    await p.auditEvent.create({
      data: {
        workspaceId: row.workspaceId,
        actorId: row.actorId,
        actorConsole: row.actorConsole,
        objectType: row.objectType,
        objectId: row.objectId,
        action: row.action,
        outcome: row.outcome,
        taskId: row.taskId,
        costAmount: row.costAmount,
        costUnit: row.costUnit,
      },
    });
  }

  async countByOutcomeSince(workspaceId: string, since: Date): Promise<Record<AuditOutcome, number>> {
    const p = await this.client();
    const groups = await p.auditEvent.groupBy({
      by: ["outcome"],
      where: { workspaceId, occurredAt: { gte: since } },
      _count: { _all: true },
    });
    const out: Record<AuditOutcome, number> = { success: 0, denied: 0, error: 0 };
    for (const g of groups) {
      if (g.outcome === "success" || g.outcome === "denied" || g.outcome === "error") {
        out[g.outcome] = g._count._all;
      }
    }
    return out;
  }

  async countByActorSince(workspaceId: string, action: string, since: Date): Promise<Record<string, number>> {
    const p = await this.client();
    const groups = await p.auditEvent.groupBy({
      by: ["actorId"],
      where: { workspaceId, action, occurredAt: { gte: since } },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const g of groups) out[g.actorId] = g._count._all;
    return out;
  }

  async listSince(
    workspaceId: string,
    since: Date,
    options: { actions?: readonly string[]; limit?: number } = {},
  ): Promise<AuditEventListRow[]> {
    const p = await this.client();
    const rows = await p.auditEvent.findMany({
      where: {
        workspaceId,
        occurredAt: { gte: since },
        ...(options.actions ? { action: { in: [...options.actions] } } : {}),
      },
      orderBy: { occurredAt: "desc" },
      ...(options.limit ? { take: options.limit } : {}),
    });
    return rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      actorId: r.actorId,
      actorConsole: r.actorConsole,
      objectType: r.objectType,
      objectId: r.objectId,
      action: r.action,
      outcome: r.outcome as AuditOutcome,
      taskId: r.taskId,
      costAmount: r.costAmount ? Number(r.costAmount) : null,
      costUnit: r.costUnit,
      occurredAt: r.occurredAt,
    }));
  }
}
