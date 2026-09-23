import type { AccountStore } from "./store";
import type { HealthResult } from "./lib/health";
import { snapshotChanged, type SnapshotSource } from "./lib/health-history";

/**
 * Write a health reading into its history (incr/0079), when it changed.
 *
 * The one writer both paths share - a person's recompute and the nightly
 * sweep - so "a row per change, not per day" is one rule, not two. Returns
 * whether a row was appended.
 */
export async function recordHealthReading(
  store: Pick<AccountStore, "listHealthSnapshots" | "appendHealthSnapshot">,
  workspaceId: string,
  accountId: string,
  reading: Pick<HealthResult, "score" | "contributions">,
  source: SnapshotSource,
  now: Date,
): Promise<boolean> {
  const [last] = await store.listHealthSnapshots(workspaceId, accountId, { limit: 1 });
  if (!snapshotChanged(last ?? null, reading)) return false;
  await store.appendHealthSnapshot(workspaceId, accountId, {
    score: reading.score,
    contributions: reading.contributions,
    source,
    computedAt: now,
  });
  return true;
}
