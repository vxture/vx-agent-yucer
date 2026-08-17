import { can } from "../../authz/decide";
import { getEntitlementResolver } from "../../entitlement/resolver";
import type { PermCode } from "../../authz/catalog";
import { getSignalStore } from "../../domains/shared/registry";
import { ingestSignals } from "../../domains/signal/service";
import { ARDA_SOURCE, type ArdaContext, type ArdaFactSource } from "./port";
import { getArdaConfig, getArdaFactSource } from "./source";

// The arda sync job's body (ADR-011 + ADR-010).
//
// It does exactly one thing: pull facts and insert signal rows. It never
// scores, never resolves an account, never promotes to a lead. That is ADR-010
// rule 4, and it is also what keeps the kill criterion honest - promotion has
// to stay a human verdict or the number it produces means nothing.
//
// THE SYSTEM SUBJECT. There is no member behind a scheduled sync, so the job
// carries a named system subject with a hardcoded permission set rather than
// borrowing a person's. `svc:arda-sync` is not a member, is never in a member
// list, and holds exactly one permission - see ARDA_SYNC_PERMISSIONS.
//
// The entitlement gate still evaluates per workspace, and a workspace below
// business tier is COUNTED AS SKIPPED rather than silently omitted. ADR-010
// rule 5 exists because a sweep that cannot tell "not entitled" from "nothing
// to do" lets everyone assume the work happened.

/** Named, so it is identifiable in a log as a system actor rather than a person. */
export const ARDA_SYNC_SUBJECT = "svc:arda-sync";

/**
 * Exactly what the job needs, and nothing else.
 *
 * Hardcoded rather than borrowed from a role. Every role that holds
 * signal.triage also holds a dozen other things - a background job carrying a
 * role would be able to move deals and read customer records because somebody
 * once decided a salesperson should. The first draft of this file borrowed
 * sales_ops and the test caught it: sales_ops does not hold signal.triage at
 * all, so the job would have been denied on every run, in the background, with
 * nobody watching.
 */
export const ARDA_SYNC_PERMISSIONS: readonly PermCode[] = ["signal.triage"];

export interface ArdaSyncLedger {
  status: "disabled" | "ok" | "failed";
  attempted: number;
  recorded: number;
  duplicates: number;
  /** Records the adapter refused to coerce or truncate. Reported even on a
   * green run - a feed of 500 records of which 12 map is a broken integration
   * wearing a tick. */
  unmapped: number;
  /** Workspaces the entitlement gate refused. Not an error, not a success. */
  skipped: number;
  failed: number;
  asOf: string | null;
}

export interface ArdaSyncOptions {
  /** The caller names the workspaces. Nothing in this repo enumerates them, and
   * inventing an enumeration would be a bigger commitment than this job is. */
  workspaces: readonly { workspaceId: string; tenantId: string }[];
  source?: ArdaFactSource;
  now?: Date;
  requestId?: string;
}

const HOUR_MS = 3_600_000;

export async function runArdaSync(options: ArdaSyncOptions): Promise<ArdaSyncLedger> {
  const source = options.source ?? getArdaFactSource();
  const ledger: ArdaSyncLedger = {
    status: "ok",
    attempted: 0,
    recorded: 0,
    duplicates: 0,
    unmapped: 0,
    skipped: 0,
    failed: 0,
    asOf: null,
  };

  // Configured-off is a normal state, reported as such. A job deliberately
  // switched off must not be dressed as a failure, or the first real failure
  // will be read as more of the same.
  if (!source.configured) {
    return { ...ledger, status: "disabled" };
  }

  const config = getArdaConfig();
  const now = options.now ?? new Date();
  const store = getSignalStore();
  const resolver = getEntitlementResolver();
  const holder = { permissions: new Set(ARDA_SYNC_PERMISSIONS) };

  for (const ws of options.workspaces) {
    const ctx: ArdaContext = {
      workspaceId: ws.workspaceId,
      tenantId: ws.tenantId,
      requestId: options.requestId,
    };

    try {
      const entitlement = await resolver.resolve(ws.workspaceId);

      // THE GATE RUNS BEFORE THE WORK, and that ordering is the fix.
      //
      // It used to live inside ingestSignals, which meant an unentitled
      // workspace still had its watermark computed, an S2S token minted
      // CARRYING ITS workspace_id, and its facts pulled from arda - all before
      // anything checked whether this workspace had bought the feature. A gate
      // that runs after the request has already been made is an accounting
      // step, not a gate.
      //
      // It also fixes the ledger: the early return on an empty feed sat ahead
      // of the old gate, so a below-tier workspace with a quiet feed was
      // counted as neither skipped nor recorded - it simply vanished, which is
      // the exact failure ADR-010 rule 5 exists to prevent.
      const gate = can(holder, entitlement, "signal.feed.ingest", "data");
      if (!gate.allowed) {
        ledger.skipped += 1;
        continue;
      }

      // The watermark, derived rather than stored. Re-polled with a deliberate
      // overlap: a duplicate is caught by uidx_signal_ws_source_ref and
      // counted, while a missed record is invisible forever.
      const since = await watermark(store, ws.workspaceId, now, config.overlapHours);

      const fetched = await source.fetchSignals(ctx, since, config.pageLimit);
      ledger.attempted += fetched.signals.length + fetched.unmapped;
      ledger.unmapped += fetched.unmapped;
      if (fetched.asOf && (ledger.asOf === null || fetched.asOf.toISOString() > ledger.asOf)) {
        ledger.asOf = fetched.asOf.toISOString();
      }

      if (fetched.signals.length === 0) continue;

      const result = await ingestSignals(
        {
          workspaceId: ws.workspaceId,
          sub: ARDA_SYNC_SUBJECT,
          holder,
          entitlement,
          store,
        },
        fetched.signals,
      );

      if (!result.ok) {
        // Refused by a gate is not a failure of the job. Counted separately so
        // "nobody is entitled" cannot read as "the feed is quiet".
        ledger.skipped += 1;
        continue;
      }
      ledger.recorded += result.value.recorded.length;
      ledger.duplicates += result.value.duplicates;
    } catch {
      ledger.failed += 1;
    }
  }

  if (ledger.failed > 0) ledger.status = "failed";
  return ledger;
}

/**
 * MAX(detected_at) over arda-sourced rows, minus the overlap.
 *
 * This is why ADR-011 needs no cursor table and therefore no DDL. It holds only
 * if arda tolerates an overlapping since-query - liaison question 7, and the
 * single question that decides whether the zero-DDL claim survives.
 */
async function watermark(
  store: ReturnType<typeof getSignalStore>,
  workspaceId: string,
  now: Date,
  overlapHours: number,
): Promise<Date> {
  const rows = await store.listSignals(workspaceId, {});
  let latest = 0;
  for (const r of rows) {
    if (r.source !== ARDA_SOURCE) continue;
    const t = r.detectedAt?.getTime() ?? 0;
    if (t > latest) latest = t;
  }
  // Nothing stored yet: start one overlap window back rather than at the epoch,
  // so a first run does not ask arda for the whole of history.
  const base = latest === 0 ? now.getTime() : latest;
  return new Date(base - overlapHours * HOUR_MS);
}
