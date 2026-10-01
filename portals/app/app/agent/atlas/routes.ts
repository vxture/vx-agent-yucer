// The route catalog: what each endpointCode yucer holds can actually take.
//
// GET /v1/model-routes (Atlas v0.7.7) answers, per route this product holds:
// its state, the context window and output ceiling (the MINIMUM across the
// route's whole fallback chain, so whichever model serves the call can take
// what fits), and the thinking modes it accepts. Before it, the only signal a
// wrong endpointCode or an oversized prompt gave was a failed call in front of
// a member.
//
// Read lazily and cached per process: routes are product grants (act.sub),
// not per workspace, and change only when an operator re-points one. A failed
// read never blocks a call - it caches "unknown" briefly and every caller falls
// back to what it did before the catalog existed.

import type { ThinkingMode } from "./profiles";

export interface RouteCapacity {
  readonly endpointCode: string;
  /** active / inactive / missing (a grant naming a route that does not exist). */
  readonly state: string;
  /** Tokens. null = unknown, NOT unlimited. */
  readonly contextWindow: number | null;
  readonly maxOutputTokens: number | null;
  /** null = the route did not say; every mode is then attempted as asked. */
  readonly thinkingModes: readonly ThinkingMode[] | null;
}

export interface RouteCatalog {
  readonly routes: ReadonlyMap<string, RouteCapacity>;
  readonly maxRequestBytes: number | null;
}

const posInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

/** Tolerant of shape drift: an unreadable row is skipped, never guessed at. */
export function parseRouteCatalog(json: unknown): RouteCatalog {
  const body = (json ?? {}) as { endpoints?: unknown; maxRequestBytes?: unknown };
  const routes = new Map<string, RouteCapacity>();
  for (const raw of Array.isArray(body.endpoints) ? body.endpoints : []) {
    const r = raw as Record<string, unknown>;
    const code = typeof r.endpointCode === "string" ? r.endpointCode : typeof r.code === "string" ? r.code : null;
    if (!code) continue;
    const modes = Array.isArray(r.thinkingModes)
      ? r.thinkingModes.filter((m): m is ThinkingMode => m === "off" || m === "on")
      : null;
    routes.set(code, {
      endpointCode: code,
      state: typeof r.state === "string" ? r.state : "active",
      contextWindow: posInt(r.contextWindow),
      maxOutputTokens: posInt(r.maxOutputTokens),
      thinkingModes: modes,
    });
  }
  return { routes, maxRequestBytes: posInt(body.maxRequestBytes) };
}

/** One route's capacity as a line of text: window, output, thinking modes,
 *  and its state when it is not the usual `active`. "?" is unknown - a route
 *  that did not say - and is never read as unlimited. */
export function describeRouteCapacity(r: RouteCapacity): string {
  const modes = r.thinkingModes ? r.thinkingModes.join("/") : "?";
  const state = r.state === "active" ? "" : `, ${r.state}`;
  return `window ${r.contextWindow ?? "?"}, output ${r.maxOutputTokens ?? "?"}, thinking ${modes}${state}`;
}

/** The held routes no call profile uses, by code - what an operator has
 *  granted this product beyond what it calls. */
export function routesNotInUse(catalog: RouteCatalog, inUse: ReadonlySet<string>): RouteCapacity[] {
  return [...catalog.routes.values()]
    .filter((r) => !inUse.has(r.endpointCode))
    .sort((a, b) => a.endpointCode.localeCompare(b.endpointCode));
}

/**
 * What a call to this route should actually send, given what the route says
 * it takes. Two adjustments, both toward the call succeeding:
 *
 * - A thinking mode the route does not accept is dropped (the route's own
 *   default then applies) rather than sent into a certain
 *   422 THINKING_MODE_UNSUPPORTED.
 * - A maxTokens above the route's output ceiling is lowered to it.
 */
export function fitToRoute<T extends { thinking?: ThinkingMode; maxTokens?: number }>(
  body: T,
  route: RouteCapacity | null,
): T {
  if (!route) return body;
  const out = { ...body };
  if (out.thinking !== undefined && route.thinkingModes && !route.thinkingModes.includes(out.thinking)) {
    delete out.thinking;
  }
  if (out.maxTokens !== undefined && route.maxOutputTokens !== null && out.maxTokens > route.maxOutputTokens) {
    out.maxTokens = route.maxOutputTokens;
  }
  return out;
}

// --- The per-process cache ---------------------------------------------------

const FRESH_MS = 10 * 60_000;
/** How long an unreadable catalog is remembered as unknown before asking again. */
const RETRY_MS = 60_000;

interface Entry {
  readonly catalog: RouteCatalog | null;
  readonly until: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<RouteCatalog | null>>();

/**
 * The catalog for one Atlas base URL, read at most once per FRESH_MS. Null
 * when it cannot be read - callers then behave as before the catalog existed.
 */
export async function cachedRouteCatalog(
  baseUrl: string,
  read: () => Promise<unknown>,
  now: () => number = Date.now,
): Promise<RouteCatalog | null> {
  const hit = cache.get(baseUrl);
  if (hit && hit.until > now()) return hit.catalog;
  let pending = inflight.get(baseUrl);
  if (!pending) {
    pending = read()
      .then((json) => {
        const catalog = parseRouteCatalog(json);
        cache.set(baseUrl, { catalog, until: now() + FRESH_MS });
        return catalog;
      })
      .catch(() => {
        cache.set(baseUrl, { catalog: null, until: now() + RETRY_MS });
        return null;
      })
      .finally(() => inflight.delete(baseUrl));
    inflight.set(baseUrl, pending);
  }
  return pending;
}

/** Tests only. */
export function resetRouteCatalogCache(): void {
  cache.clear();
  inflight.clear();
}
