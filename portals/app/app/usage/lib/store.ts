// Local usage buffer port (local_usage.raw). Only COUNTER metrics are buffered
// here; gauge is a no-buffer direct PUT and caps are counted locally. In-memory
// on the offline path; Prisma-backed over local_usage when DATABASE_URL is set.
import { prismaEnabled } from "../../lib/db";
import { PrismaUsageStore } from "./prisma-store";

export interface UsageRow {
  workspaceId: string;
  metric: string; // must hit a platform metric registry key
  amount: number;
  idempotencyKey: string; // forced; replay = no-op
  flushed: boolean;
}

export interface UsageStore {
  record(row: Omit<UsageRow, "flushed">): Promise<void>;
  unflushed(limit: number): Promise<UsageRow[]>;
  /**
   * Rows, not bare keys: marking a flush also advances the per-(workspace,
   * metric) watermark in local_usage.checkpoint, and the watermark needs the
   * dimensions. The DDL shipped that table in the baseline as the
   * "product-local flush watermark" and NOTHING EVER WROTE IT - the flush
   * flipped raw.flushed and the one row that answers "when did this workspace's
   * metric last reach the platform" stayed empty forever. That question is the
   * first one asked when the platform says usage is missing (2026-08-30
   * connectivity audit).
   */
  markFlushed(rows: readonly Pick<UsageRow, "idempotencyKey" | "workspaceId" | "metric">[]): Promise<void>;
}

export class InMemoryUsageStore implements UsageStore {
  private rows = new Map<string, UsageRow>();

  async record(row: Omit<UsageRow, "flushed">): Promise<void> {
    // Upsert by idempotency key: a replay must not double-count.
    if (!this.rows.has(row.idempotencyKey)) {
      this.rows.set(row.idempotencyKey, { ...row, flushed: false });
    }
  }
  async unflushed(limit: number): Promise<UsageRow[]> {
    const out: UsageRow[] = [];
    for (const r of this.rows.values()) {
      if (!r.flushed) out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  }
  async markFlushed(
    rows: readonly Pick<UsageRow, "idempotencyKey" | "workspaceId" | "metric">[],
  ): Promise<void> {
    for (const { idempotencyKey } of rows) {
      const r = this.rows.get(idempotencyKey);
      if (r) r.flushed = true;
    }
    for (const { workspaceId, metric } of rows) {
      this.checkpoints.set(`${workspaceId}|${metric}`, new Date());
    }
  }

  /** The in-memory mirror of local_usage.checkpoint, for tests. */
  readonly checkpoints = new Map<string, Date>();
}

let override: UsageStore | null = null;
let memo: UsageStore | null = null;

export function getUsageStore(): UsageStore {
  if (override) return override;
  if (memo) return memo;
  memo = prismaEnabled() ? new PrismaUsageStore() : new InMemoryUsageStore();
  return memo;
}
export function setUsageStore(next: UsageStore | null): void {
  override = next;
  memo = null;
}
