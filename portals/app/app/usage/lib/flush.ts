import { getUsageStore, type UsageRow, type UsageStore } from "./store";
import { getPlatformClientConfig } from "../../entitlement/platform-client";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { assertInternalTarget } from "../../lib/internal-target";

// Async flush job (product_200 section 4.1): drain buffered counter usage and
// report to the platform consume service (the single writer). 200 -> flushed;
// 409 gated (quota exhausted) is a TERMINAL success (gating only blocks UI, not
// the ledger) and evicts the C2 cache; anything else stays buffered for retry.

export interface ConsumeResult {
  status: number;
}
export type ConsumeFn = (row: UsageRow) => Promise<ConsumeResult>;

export interface FlushOptions {
  store?: UsageStore;
  consume?: ConsumeFn;
  onGated?: (workspaceId: string) => void;
  batchSize?: number;
}

export interface FlushSummary {
  scanned: number;
  flushed: number;
  gated: number;
  retried: number;
  skipped?: boolean;
}

export async function flushUsage(opts: FlushOptions = {}): Promise<FlushSummary> {
  const store = opts.store ?? getUsageStore();
  const consume = opts.consume ?? defaultConsume();
  if (!consume) return { scanned: 0, flushed: 0, gated: 0, retried: 0, skipped: true };

  const rows = await store.unflushed(opts.batchSize ?? 50);
  const done: string[] = [];
  let flushed = 0;
  let gated = 0;
  let retried = 0;

  for (const row of rows) {
    let res: ConsumeResult;
    try {
      res = await consume(row);
    } catch {
      retried++;
      continue; // stays buffered
    }
    if (res.status === 200) {
      done.push(row.idempotencyKey);
      flushed++;
    } else if (res.status === 409) {
      // Gated is terminal: the platform recorded the attempt and refused the
      // quota; do not retry, and refresh entitlement so the UI reflects it.
      done.push(row.idempotencyKey);
      gated++;
      (opts.onGated ?? ((ws: string) => getEntitlementResolver().invalidate(ws)))(row.workspaceId);
    } else {
      retried++; // 4xx/5xx (incl. 404 fail-closed) -> stays buffered
    }
  }
  await store.markFlushed(done);
  return { scanned: rows.length, flushed, gated, retried };
}

/** Platform consume caller, or null when the platform is not configured (offline). */
function defaultConsume(): ConsumeFn | null {
  const cfg = getPlatformClientConfig();
  if (!cfg) return null;
  return async (row) => {
    const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/usage/consume`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vxture-internal-auth": cfg.authToken,
      },
      body: JSON.stringify({
        workspace_id: row.workspaceId,
        product: cfg.product,
        metric: row.metric,
        amount: row.amount,
        idempotency_key: row.idempotencyKey,
      }),
      cache: "no-store",
    });
    return { status: res.status };
  };
}
