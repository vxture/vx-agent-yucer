import { getUsageStore, type UsageRow, type UsageStore } from "./store";
import { getPlatformClientConfig, type PlatformClientConfig } from "../../entitlement/platform-client";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { assertInternalTarget } from "../../lib/internal-target";

// Async flush job (product_200 section 4.1): drain buffered counter usage and
// report to the platform consume service (the single writer).
//
// THE CONSUME SERVICE ANSWERS 200 ALWAYS - it keeps the ledger, it does not
// judge (product integration rules, C3 upstream, 2026-09-13). A quota that did
// not cover the call comes back as `gated: true` IN THE BODY: the row is
// reported and done, and the entitlement may have changed, so the C2 cache is
// evicted. What to do about `gated` is the product's decision at the action
// point, never this loop's.
//
// This file used to treat 409 as "gated, terminal" - the branch the reference
// implementation names as a fossil from before the contract converged on 200.
// A 409 is now what every other non-200 is: not reported, stays buffered.

export interface ConsumeResult {
  status: number;
  /** From the 200 body: the quota did not cover this call. Information, not an error. */
  gated?: boolean;
  /** The 200 body as parsed (replayed, event_id, consumed, ...); the replay probe reads it. */
  body?: Record<string, unknown>;
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
  const done: UsageRow[] = [];
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
      // On a fresh consume this is the id the platform just wrote; on a
      // replayed idempotency_key (replayed: true) it is the ORIGINAL event's
      // id, which is exactly what makes storing it useful for reconciliation.
      const platformEventId = typeof res.body?.event_id === "string" ? res.body.event_id : null;
      done.push({ ...row, platformEventId });
      if (res.gated) {
        // Recorded by the platform, quota not covering it: done, and the
        // entitlement is re-read next time anyone asks.
        gated++;
        (opts.onGated ?? ((ws: string) => getEntitlementResolver().invalidate(ws)))(row.workspaceId);
      } else {
        flushed++;
      }
    } else {
      retried++; // any non-200 (4xx incl. 404 fail-closed, 5xx) -> stays buffered
    }
  }
  await store.markFlushed(done);
  return { scanned: rows.length, flushed, gated, retried };
}

/** Platform consume caller, or null when the platform is not configured (offline). */
function defaultConsume(): ConsumeFn | null {
  const cfg = getPlatformClientConfig();
  if (!cfg) return null;
  return makePlatformConsume(cfg);
}

/** POST /usage/consume for one buffered row - the flush loop's caller, and the replay probe's. */
export function makePlatformConsume(cfg: PlatformClientConfig): ConsumeFn {
  return async (row) => {
    const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/usage/consume`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vxture-internal-auth": cfg.authToken,
        // Lands next to the usage event on the platform side; the idempotency
        // key is the one id both sides already share, so reconciliation needs
        // no second one.
        "x-request-id": row.idempotencyKey,
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
    let gated = false;
    let body: Record<string, unknown> | undefined;
    if (res.status === 200) {
      try {
        const parsed = (await res.json()) as Record<string, unknown> | null;
        if (parsed && typeof parsed === "object") body = parsed;
        gated = body?.gated === true;
      } catch {
        // A 200 without a JSON body is still a 200: reported, not gated.
      }
    }
    return { status: res.status, gated, body };
  };
}
