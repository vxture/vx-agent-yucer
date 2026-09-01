import type { PrismaClient } from "@prisma/client";
import type { AuditStore, AuditEventRow } from "./store";
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
}
