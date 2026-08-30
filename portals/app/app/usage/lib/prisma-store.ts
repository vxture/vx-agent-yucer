import type { PrismaClient } from "@prisma/client";
import type { UsageStore, UsageRow } from "./store";
import { getPrismaClient } from "../../lib/db";

// Prisma-backed UsageStore over local_usage.raw. Used when DATABASE_URL is set.

export class PrismaUsageStore implements UsageStore {
  /** Injectable for tests, same shape as PrismaAccountStore. Production
   * constructs this with no argument and nothing changes. */
  constructor(private readonly client: () => Promise<PrismaClient> = getPrismaClient) {}

  async record(row: Omit<UsageRow, "flushed">): Promise<void> {
    const p = await this.client();
    // Upsert on the unique idempotency key; a replay is a no-op (empty update).
    await p.raw.upsert({
      where: { idempotencyKey: row.idempotencyKey },
      create: {
        workspaceId: row.workspaceId,
        metric: row.metric,
        amount: BigInt(row.amount),
        idempotencyKey: row.idempotencyKey,
      },
      update: {},
    });
  }

  async unflushed(limit: number): Promise<UsageRow[]> {
    const p = await this.client();
    const rows = await p.raw.findMany({ where: { flushed: false }, take: limit });
    return rows.map((r) => ({
      workspaceId: r.workspaceId,
      metric: r.metric,
      amount: Number(r.amount),
      idempotencyKey: r.idempotencyKey,
      flushed: r.flushed,
    }));
  }

  async markFlushed(
    rows: readonly { idempotencyKey: string; workspaceId: string; metric: string }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const p = await this.client();
    await p.raw.updateMany({
      where: { idempotencyKey: { in: rows.map((r) => r.idempotencyKey) } },
      data: { flushed: true },
    });
    // The watermark: one row per (workspace, metric), latest successful flush.
    // Deduplicated first - one batch usually carries many rows of one metric,
    // and (workspace_id, metric) is unique in the DDL.
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.workspaceId}|${r.metric}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await p.checkpoint.upsert({
        where: { workspaceId_metric: { workspaceId: r.workspaceId, metric: r.metric } },
        update: { flushedAt: new Date() },
        create: { workspaceId: r.workspaceId, metric: r.metric },
      });
    }
  }
}
