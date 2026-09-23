import type { PermCode } from "../../authz/catalog";
import { can } from "../../authz/decide";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { getAccountStore } from "../shared/registry";
import { recomputeHealth } from "./service";

// The health sweep (incr/0079, owner 2026-09-24: 重算和夜间扫描时写入).
//
// Daily, every customer: re-derive the score, persist it, and - when it moved -
// append a snapshot. It is the SAME recomputeHealth a person's 重新评估 runs,
// under a service identity, so there is one rule for what the score is and one
// for when a reading is worth a row.
//
// WHY A SWEEP AT ALL. Before it, account.health_score changed only when
// someone clicked 重新评估, so the stored number the lists, the group roll-up
// and the peer benchmark read could be months old - and a history written only
// on clicks would be a history of clicks. The page itself derives on read and
// never writes (persist:false); this is the only unattended writer.

export const HEALTH_SWEEP_SUBJECT = "svc:health-sweep";
export const HEALTH_SWEEP_PERMISSIONS: readonly PermCode[] = ["account.write"];

export interface HealthSweepLedger {
  accountsScored: number;
  /** Workspaces the entitlement gate refused. Counted, never omitted. */
  skipped: number;
  failed: number;
}

export async function runHealthSweep(options: {
  workspaces: readonly { workspaceId: string }[];
  now?: Date;
}): Promise<HealthSweepLedger> {
  const now = options.now ?? new Date();
  const resolver = getEntitlementResolver();
  const holder = { permissions: new Set(HEALTH_SWEEP_PERMISSIONS) };
  const ledger: HealthSweepLedger = { accountsScored: 0, skipped: 0, failed: 0 };

  for (const ws of options.workspaces) {
    try {
      const entitlement = await resolver.resolve(ws.workspaceId);
      if (!can(holder, entitlement, "account.upsert", "data").allowed) {
        ledger.skipped += 1;
        continue;
      }
      const store = getAccountStore();
      const ctx = { workspaceId: ws.workspaceId, sub: HEALTH_SWEEP_SUBJECT, holder, entitlement, store };
      const accounts = await store.listAccounts(ws.workspaceId, {});
      for (const a of accounts) {
        const r = await recomputeHealth(ctx, a.id, { now, persist: true, source: "sweep" }).catch(() => null);
        if (r?.ok) ledger.accountsScored += 1;
        else ledger.failed += 1;
      }
    } catch {
      ledger.failed += 1;
    }
  }
  return ledger;
}
