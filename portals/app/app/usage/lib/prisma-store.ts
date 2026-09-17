import type { PrismaClient } from "@prisma/client";
import type { UsageStore, UsageRow } from "./store";
import { getPrismaClient } from "../../lib/db";

// Prisma-backed UsageStore over local_usage.raw. Used when DATABASE_URL is set.

export class PrismaUsageStore implements UsageStore {
  /** Injectable for tests, same shape as PrismaAccountStore. Production
   * constructs this with no argument and nothing changes. */
  constructor(private readonly client: () => Promise<PrismaClient> = getPrismaClient) {}

  async record(row: Omit<UsageRow, "flushed" | "platformEventId" | "createdAt">): Promise<void> {
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
      platformEventId: r.platformEventId,
      createdAt: r.createdAt,
    }));
  }

  async sumSince(workspaceId: string, metric: string, since: Date): Promise<number> {
    const p = await this.client();
    const agg = await p.raw.aggregate({
      where: { workspaceId, metric, createdAt: { gte: since } },
      _sum: { amount: true },
    });
    return Number(agg._sum.amount ?? 0);
  }

  async markFlushed(
    rows: readonly Pick<UsageRow, "idempotencyKey" | "workspaceId" | "metric" | "platformEventId">[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const p = await this.client();
    // Each row's own platformEventId, not a shared value: one flush call
    // usually reports several rows in a batch, and the platform returns a
    // DIFFERENT event id for each - updateMany's single `data` cannot express
    // that, so this writes flushed and platformEventId together per row.
    for (const r of rows) {
      await p.raw.update({
        where: { idempotencyKey: r.idempotencyKey },
        data: { flushed: true, platformEventId: r.platformEventId },
      });
    }
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
