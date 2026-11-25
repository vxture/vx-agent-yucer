/**
 * Full provisioning reconciliation through the existing ordered event handler.
 * @package @yucer/app
 * @layer Application
 * @category service
 * @author AI-Generated
 * @date 2026-10-22
 */
import { getPlatformClientConfig, type PlatformClientConfig } from "../../entitlement/platform-client";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { readProvisioningPages } from "./read";
import { handleProvisioning, type HandlerDeps } from "./handler";
import { getProvisioningStore } from "./store";
import { sendProvisioningAck } from "./ack";

// ============================================================================
// Every invocation starts at page one; partial failure is replay-safe by seq.
// ============================================================================
/**
 * Reconcile all current product relations without creating absent-row deletions.
 * @param opts Optional transport, configuration, and handler dependencies.
 * @returns Aggregate counts only, safe for the scheduler's log.
 * @throws On authentication, pagination, validation, or persistence failure.
 */
export async function pollProvisioning(opts: {
  config?: PlatformClientConfig; fetchImpl?: typeof fetch; handler?: HandlerDeps;
} = {}): Promise<{ pages: number; scanned: number; applied: number; skipped?: boolean }> {
  const cfg = opts.config ?? getPlatformClientConfig();
  if (!cfg) return { pages: 0, scanned: 0, applied: 0, skipped: true };
  const deps: HandlerDeps = opts.handler ?? {
    store: getProvisioningStore(), product: cfg.product,
    onSubscriptionChanged: (ws) => getEntitlementResolver().invalidate(ws),
    onProvisioned: async (ws) => { await sendProvisioningAck({ workspaceId: ws, status: "ready" }); },
  };
  if (deps.product !== cfg.product) throw new Error("Provisioning product mismatch");
  let pages = 0, scanned = 0, applied = 0;
  for await (const page of readProvisioningPages(cfg, opts.fetchImpl)) {
    pages++;
    for (const row of page.items) {
      scanned++;
      // Pending is not a completed transition and must not archive a workspace.
      if (row.state === "pending") continue;
      const result = await handleProvisioning({
        id: `poll:${cfg.product}:${row.workspace_id}:${row.seq}:${row.state}`,
        type: `tenant.${row.state}`, seq: row.seq,
        workspace_id: row.workspace_id, tenant_id: row.tenant_id, application: cfg.product,
      }, deps);
      if (result.handled) applied++;
    }
  }
  return { pages, scanned, applied };
}
