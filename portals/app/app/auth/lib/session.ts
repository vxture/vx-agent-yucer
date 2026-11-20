import { invalidateAuthz } from "../../authz/context";
import { getEntitlementResolver } from "../../entitlement/resolver";
import type { OidcConfig } from "./config";
import { toAuthUser, type AuthUser } from "./claims";
import { accessTokenFor, resolveLoginState, LoginStateUnavailableError } from "./login-state";

// Per-request auth (080-rp section 2.6): cookie -> the product's one login
// state (login-state.ts) -> AuthUser. Returns null when there is no login
// state - which, since 2026-09-29, happens only when ACCOUNTS says the login
// is over or the member logged out; never because a token timed out.
//
// Callers do not refresh, verify or schedule anything. That was the defect:
// every caller deciding for itself, 131 of them, racing.

export interface AuthSession {
  user: AuthUser;
  /**
   * The member's own access token, for an OBO S2S exchange (platform/s2s.ts)
   * - never sent to the browser, never logged. Fetched ON DEMAND: a page that
   * only needs to know who is here never touches a token. Null means "no
   * token right now", which affects that call only.
   */
  accessToken: () => Promise<string | null>;
}

export interface ResolveOptions {
  /**
   * The member is actually doing something - a page they opened, an action
   * they took. Only such a request may ask accounts (and so renew the login's
   * idle clock). Probes, prefetches and status polls pass false.
   * Validation is independent: forceCheck bypasses the Accounts check schedule.
   */
  activity: boolean;
  forceCheck?: boolean;
  /** Explicit foreground entry/return only. Never used by periodic probes. */
  syncContext?: boolean;
}

export async function getAuthUser(
  cfg: OidcConfig,
  rpsid: string,
  opts: ResolveOptions = { activity: false, forceCheck: true },
): Promise<AuthUser | null> {
  return (await getAuthSession(cfg, rpsid, opts))?.user ?? null;
}

export interface AuthSessionDeps {
  resolve: typeof resolveLoginState;
  token: typeof accessTokenFor;
  invalidate: (workspace: string, sub: string) => void;
}

const defaultDeps: AuthSessionDeps = {
  resolve: resolveLoginState,
  token: accessTokenFor,
  invalidate(workspace, sub) {
    invalidateAuthz(workspace, sub);
    getEntitlementResolver().invalidate(workspace);
  },
};

export async function getAuthSession(
  cfg: OidcConfig,
  rpsid: string,
  opts: ResolveOptions = { activity: false, forceCheck: true },
  deps: AuthSessionDeps = defaultDeps,
): Promise<AuthSession | null> {
  const state = await deps.resolve(cfg, rpsid, opts).catch(() => {
    throw new LoginStateUnavailableError();
  });
  if (!state) return null;
  if (opts.syncContext) {
    for (const workspace of new Set([state.previousClaims?.active_workspace, state.claims.active_workspace])) {
      if (!workspace) continue;
      deps.invalidate(workspace, state.claims.sub);
    }
  }
  if (state.claims.account_status && state.claims.account_status !== "active") return null;
  let token: Promise<string | null> | null = null;
  return {
    user: toAuthUser(state.claims),
    // Memoised per resolution: one render asking twice renews at most once.
    accessToken: () => (token ??= deps.token(cfg, rpsid, undefined, state.claims)),
  };
}
