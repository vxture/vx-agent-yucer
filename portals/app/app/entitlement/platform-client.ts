import { BRAND } from "@yucer/shared/brand";
import { assertInternalTarget } from "../lib/internal-target";
import { EMPTY_ENTITLEMENT, type Entitlement, type QuotaPool } from "./types";

// C2 caller (product_200 section 3, product_220 section 3). Calls the platform
// entitlement endpoint over the internal network with the shared internal-auth
// header, and parses the envelope tolerantly (unknown added fields ignored,
// missing fields defaulted). Never sends the secret to the browser.

export interface PlatformClientConfig {
  baseUrl: string;
  authToken: string;
  product: string;
}

export function getPlatformClientConfig(): PlatformClientConfig | null {
  const baseUrl = process.env.PLATFORM_API_URL;
  const authToken = process.env.PLATFORM_INTERNAL_AUTH_TOKEN;
  if (!baseUrl || !authToken) return null; // -> Mock resolver
  return { baseUrl, authToken, product: BRAND.productCode };
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// The integration rules' documented TTL, and the fallback when a response
// carries no Cache-Control at all (or one this parser cannot read) - not a
// silent guess, the exact number the platform's own contract names. Exported
// so /api/status reports this same constant rather than a second literal
// that could drift from it.
export const DEFAULT_CACHE_TTL_MS = 45_000;

/** max-age in milliseconds from a Cache-Control header, or the documented default. */
function ttlMsFromCacheControl(header: string | null): number {
  const match = header ? /(?:^|,)\s*max-age=(\d+)/i.exec(header) : null;
  if (!match) return DEFAULT_CACHE_TTL_MS;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_CACHE_TTL_MS;
}

export interface EntitlementFetch {
  entitlement: Entitlement;
  /** How long the response said to cache it for - "按它缓存" (C2), not a local guess. */
  ttlMs: number;
}

/** Tolerant envelope parse: coerce known fields, ignore unknown, default missing. */
export function parseEntitlementEnvelope(
  workspaceId: string,
  product: string,
  raw: unknown,
): Entitlement {
  const o = (raw ?? {}) as Record<string, unknown>;
  const limits: Record<string, number> = {};
  if (o.limits && typeof o.limits === "object") {
    for (const [k, v] of Object.entries(o.limits as Record<string, unknown>)) {
      if (typeof v === "number") limits[k] = v;
    }
  }
  const pools: QuotaPool[] = Array.isArray(o.quota_pools)
    ? (o.quota_pools as unknown[]).flatMap((p) => {
        const pp = p as Record<string, unknown>;
        const metric = str(pp.metric);
        return metric
          ? [{ metric, limit: num(pp.limit), remaining: num(pp.remaining), priority: num(pp.priority) }]
          : [];
      })
    : [];
  return {
    ...EMPTY_ENTITLEMENT,
    workspace_id: workspaceId,
    product,
    // status kept as-is (may be an unknown future value; gating uses tier/bundled) -
    // str() already returns string | null, exactly this field's type, no cast needed
    status: str(o.status),
    trial_ends_at: str(o.trial_ends_at),
    current_period_end: str(o.current_period_end),
    cancel_at_period_end: o.cancel_at_period_end === true,
    data_retention_until: str(o.data_retention_until),
    tier: (str(o.tier) as Entitlement["tier"]) ?? null,
    bundled: o.bundled === true,
    limits,
    quota_pools: pools,
  };
}

export async function fetchEntitlement(
  cfg: PlatformClientConfig,
  workspaceId: string,
): Promise<EntitlementFetch> {
  const url = assertInternalTarget(
    `${cfg.baseUrl.replace(/\/$/, "")}/platform/entitlements` +
      `?workspace_id=${encodeURIComponent(workspaceId)}&product=${encodeURIComponent(cfg.product)}`,
  );
  const res = await fetch(url, {
    headers: { "x-vxture-internal-auth": cfg.authToken, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`entitlement endpoint ${res.status}`);
  const entitlement = parseEntitlementEnvelope(workspaceId, cfg.product, await res.json());
  // "响应带 Cache-Control: private, max-age=45 - 按它缓存" (C2): the caller's cache
  // follows this response's own header, not a constant disconnected from it.
  const ttlMs = ttlMsFromCacheControl(res.headers.get("cache-control"));
  return { entitlement, ttlMs };
}
