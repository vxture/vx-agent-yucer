import { getStrategyStore } from "../shared/registry";
import type { StrategyStore } from "./store";
import { computeDiagnosticSnapshots, type DiagnosticSource } from "./lib/diagnostic-snapshots";
import { readDiagnosticSource } from "./snapshot-source";

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
  source?: (workspaceId: string) => Promise<DiagnosticSource>;
}

// Used by the scheduler and explicit captures. Old points stay append-only;
// only versioned captures are eligible for the diagnostic read service.
export async function runStrategySnapshots(options: SnapshotOptions): Promise<SnapshotLedger> {
  const now = options.now ?? new Date();
  const store = options.store ?? getStrategyStore();
  const source = options.source ?? readDiagnosticSource;
  const ledger: SnapshotLedger = { segmentSnapshots: 0, territorySnapshots: 0, workspacesProcessed: 0, failed: 0 };
  // Keep workspace captures serial to bound database pressure.
  await options.workspaces.reduce(async (previous, { workspaceId }) => {
    await previous;
    try {
      const rows = computeDiagnosticSnapshots(await source(workspaceId), now);
      for (const row of rows.segments) {
        await store.appendSegmentCoverageSnapshot(workspaceId, row);
        ledger.segmentSnapshots += 1;
      }
      for (const row of rows.territories) {
        await store.appendTerritoryAttainmentSnapshot(workspaceId, row);
        ledger.territorySnapshots += 1;
      }
      ledger.workspacesProcessed += 1;
    } catch {
      ledger.failed += 1;
    }
  }, Promise.resolve());
  return ledger;
}
