/**
 * Strict, read-only product provisioning directory shared by jobs and polling.
 * @package @yucer/app
 * @layer Application
 * @category service
 * @author AI-Generated
 * @date 2026-11-24
 */
import { getPlatformClientConfig, type PlatformClientConfig } from "../../entitlement/platform-client";
import { assertInternalTarget } from "../../lib/internal-target";

// ============================================================================
// Contract validation: a missing row never means deprovisioned.
// ============================================================================
export interface ProvisionRow {
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

export interface ProvisioningReaderOptions {
  config?: PlatformClientConfig;
  fetchImpl?: typeof fetch;
}

/** Read validated pages with a dedicated provisioning reader ticket, never ACK. */
export async function* readProvisioningPages(
  cfg: PlatformClientConfig,
  fetchImpl: typeof fetch = fetch,
): AsyncGenerator<Page> {
  const cursors = new Set<string>();
  const workspaces = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  do {
    if (pages >= 10_000) throw new Error("Provisioning page bound exceeded");
    const url = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/platform/provisioning`);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${await cfg.accessToken(null)}`, accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Provisioning reader failed (${res.status})`);
    const page = parsePage(await res.json());
    pages++;
    for (const row of page.items) {
      if (workspaces.has(row.workspace_id)) throw new Error("Duplicate provisioning workspace");
      workspaces.add(row.workspace_id);
    }
    cursor = page.nextCursor;
    if (cursor) {
      if (cursors.has(cursor)) throw new Error("Repeated provisioning cursor");
      cursors.add(cursor);
    }
    yield page;
  } while (cursor);
}

/** Return only current provisioned workspace/org pairs after a complete scan.
 * Missing relations are excluded, never inferred from nullable local history.
 * Authentication, paging and contract failures propagate without a partial map. */
export async function readProvisionedOrganizations(
  opts: ProvisioningReaderOptions = {},
): Promise<ReadonlyMap<string, string> | null> {
  const cfg = opts.config ?? getPlatformClientConfig();
  if (!cfg) return null;
  const organizations = new Map<string, string>();
  for await (const page of readProvisioningPages(cfg, opts.fetchImpl)) {
    for (const row of page.items) {
      if (row.state === "provisioned") organizations.set(row.workspace_id, row.tenant_id);
    }
  }
  return organizations;
}
