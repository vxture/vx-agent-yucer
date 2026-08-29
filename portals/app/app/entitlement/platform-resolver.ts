import { type EntitlementResolver, makeEntitlement } from "./resolver";
import { fetchEntitlement, type PlatformClientConfig } from "./platform-client";
import type { Entitlement } from "./types";

// Real C2 resolver: short-TTL cache + C3 invalidate (product_200 section 3).
// entitlement is derived live, cached ~45s, and evicted on a subscription_changed
// webhook. Never persisted, never in the token. Stale-on-error keeps the UI up
// if the platform blips.

const TTL_MS = 45_000;

interface Entry {
  value: Entitlement;
  expiresAt: number;
}

/**
 * Injected so the failure path is assertable.
 *
 * This class turns a platform OUTAGE into an ACCESS DECISION, which makes
 * "what happens when the call fails" the most important thing about it - and
 * with a hardcoded fetch and clock there was no way to write that assertion.
 */
export interface PlatformResolverDeps {
  fetchImpl?: typeof fetchEntitlement;
  now?: () => number;
}

export class PlatformEntitlementResolver implements EntitlementResolver {
  private cache = new Map<string, Entry>();
  private readonly fetchImpl: typeof fetchEntitlement;
  private readonly now: () => number;

  constructor(
    private readonly cfg: PlatformClientConfig,
    deps: PlatformResolverDeps = {},
  ) {
    this.fetchImpl = deps.fetchImpl ?? fetchEntitlement;
    this.now = deps.now ?? Date.now;
  }

  async resolve(workspaceId: string): Promise<Entitlement> {
    const now = this.now();
    const hit = this.cache.get(workspaceId);
    if (hit && hit.expiresAt > now) return hit.value;

    try {
      const value = await this.fetchImpl(this.cfg, workspaceId);
      this.cache.set(workspaceId, { value, expiresAt: now + TTL_MS });
      return value;
    } catch {
      // Stale-on-error: last good value, else a no-coverage default (fail-closed
      // to no access, not fail-open).
      if (hit) return hit.value;
      return makeEntitlement(workspaceId, this.cfg.product);
    }
  }

  invalidate(workspaceId: string): void {
    this.cache.delete(workspaceId);
  }
}
