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
import { assertInternalTarget } from "../../lib/internal-target";
import { handleProvisioning, type HandlerDeps } from "./handler";
import { getProvisioningStore } from "./store";
import { sendProvisioningAck } from "./ack";

// ============================================================================
// Contract validation: a missing row never means deprovisioned.
// ============================================================================
interface ProvisionRow {
  workspace_id: string; tenant_id: string;
  state: "pending" | "provisioned" | "deprovisioned";
  seq: number; updated_at: string;
}
interface Page { items: ProvisionRow[]; nextCursor: string | null }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePage(raw: unknown): Page {
  if (!raw || typeof raw !== "object") throw new Error("Invalid provisioning page");
  const page = raw as Record<string, unknown>;
  if (!Array.isArray(page.items) || !(page.nextCursor === null || (typeof page.nextCursor === "string" && page.nextCursor.length > 0))) {
    throw new Error("Invalid provisioning page");
  }
  for (const item of page.items) {
    if (!item || typeof item !== "object") throw new Error("Invalid provisioning item");
    const v = item as Record<string, unknown>;
    if (typeof v.workspace_id !== "string" || !UUID.test(v.workspace_id) ||
        typeof v.tenant_id !== "string" || !UUID.test(v.tenant_id) ||
        !["pending", "provisioned", "deprovisioned"].includes(String(v.state)) ||
        !Number.isSafeInteger(v.seq) || Number(v.seq) < 0 ||
        typeof v.updated_at !== "string" || !Number.isFinite(Date.parse(v.updated_at))) {
      throw new Error("Invalid provisioning item");
    }
  }
  return page as unknown as Page;
}

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
  const cursors = new Set<string>();
  const workspaces = new Set<string>();
  let cursor: string | null = null;
  let pages = 0, scanned = 0, applied = 0;
  do {
    if (pages >= 10_000) throw new Error("Provisioning page bound exceeded");
    const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/platform/provisioning`);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await (opts.fetchImpl ?? fetch)(url, {
      headers: { authorization: `Bearer ${await cfg.accessToken(null)}`, accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Provisioning reader failed (${res.status})`);
    const page = parsePage(await res.json());
    pages++;
    for (const row of page.items) {
      if (workspaces.has(row.workspace_id)) throw new Error("Duplicate provisioning workspace");
      workspaces.add(row.workspace_id);
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
    cursor = page.nextCursor;
    if (cursor) {
      if (cursors.has(cursor)) throw new Error("Repeated provisioning cursor");
      cursors.add(cursor);
    }
  } while (cursor);
  return { pages, scanned, applied };
}
