/** Read-only product authorization directory (platform PR #710). */
import { assertInternalTarget } from "../lib/internal-target";
import { isDeployedStage } from "../lib/deploy-stage";
import { getS2SConfig, type FetchLike } from "./s2s";
import { mintChannelToken } from "./channel-token";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECT = /^usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION = /^[0-9a-f]{32}$/;
const MAX_PAGES = 200;

export interface ProductRosterItem {
  subject: string;
  displayName: string | null;
}

export interface ProductRosterConfig {
  baseUrl: string;
  product: string;
  workspaceId: string;
  orgId: string;
  accessToken: () => Promise<string>;
}

export interface ProductRosterFetchOptions {
  fetchImpl?: FetchLike;
}

/**
 * Follow opaque, version-bound cursors without ever accepting an identity
 * selector from a browser. A concurrent membership change discards all partial
 * results and restarts once. No successful or failed roster is cached.
 */
export async function fetchProductRoster(
  cfg: ProductRosterConfig,
  opts: ProductRosterFetchOptions = {},
): Promise<ProductRosterItem[]> {
  const endpoint = assertInternalTarget(`${cfg.baseUrl.replace(/\/$/, "")}/platform/product-roster`);
  const token = await cfg.accessToken();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(20_000);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const items = new Map<string, ProductRosterItem>();
    const cursors = new Set<string>();
    let cursor: string | null = null;
    let org: string | null = null;
    let version: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(endpoint);
      url.searchParams.set("limit", "200");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetchImpl(url.toString(), {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        cache: "no-store", redirect: "error", signal,
      });
      if (res.status === 409 && attempt === 0) break;
      if (!res.ok) throw new Error(`product roster endpoint ${res.status}`);
      const raw: unknown = await res.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid product roster response");
      const body = raw as Record<string, unknown>;
      if (body.workspace_id !== cfg.workspaceId || body.product !== cfg.product ||
          body.org_id !== cfg.orgId || typeof body.org_id !== "string" || !UUID.test(body.org_id) ||
          (org !== null && body.org_id !== org) ||
          body.authorization_mode !== "assigned_seats" ||
          typeof body.version !== "string" || !VERSION.test(body.version) ||
          (version !== null && body.version !== version) ||
          !Array.isArray(body.items) || body.items.length > 200) {
        throw new Error("Invalid product roster scope or revision");
      }
      org = body.org_id;
      version = body.version;
      for (const entry of body.items) {
        if (!entry || typeof entry !== "object") throw new Error("Invalid product roster item");
        const row = entry as Record<string, unknown>;
        if (typeof row.subject !== "string" || !SUBJECT.test(row.subject) || row.eligible !== true ||
            (row.display_name !== null && typeof row.display_name !== "string") || items.has(row.subject)) {
          throw new Error("Invalid product roster identity");
        }
        items.set(row.subject, {
          subject: row.subject,
          displayName: typeof row.display_name === "string" ? row.display_name.trim() || null : null,
        });
      }
      const next = body.nextCursor;
      if (next === null) return [...items.values()];
      if (typeof next !== "string" || !/^[A-Za-z0-9_-]{1,1024}$/.test(next) || cursors.has(next) || !body.items.length) {
        throw new Error("Invalid product roster cursor");
      }
      cursors.add(next);
      cursor = next;
      if (page === MAX_PAGES - 1) throw new Error("Product roster exceeded pagination bound");
    }
  }
  throw new Error("Product roster changed repeatedly");
}

export function getProductRosterConfig(
  workspaceId: string,
  orgId: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): ProductRosterConfig | null {
  const baseUrl = env.PLATFORM_API_URL?.trim();
  const s2s = getS2SConfig(env);
  if (!baseUrl || !s2s.enabled) return null;
  if (!orgId || !UUID.test(orgId)) throw new Error("Product roster requires verified organization context");
  return {
    baseUrl,
    product: s2s.productCode,
    workspaceId,
    orgId,
    accessToken: () => mintChannelToken(workspaceId, { config: s2s, orgId }),
  };
}

/** Offline development alone may use the local-known directory. */
export async function readProductRoster(workspaceId: string, orgId?: string | null): Promise<ProductRosterItem[] | null> {
  const cfg = getProductRosterConfig(workspaceId, orgId);
  if (cfg) return fetchProductRoster(cfg);
  if (isDeployedStage()) throw new Error("Product roster configuration missing");
  return null;
}
