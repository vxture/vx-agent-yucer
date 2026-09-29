import type { OidcConfig } from "./config";
import { verifyToken, refreshTokens } from "./oidc";
import { getSession, putSession, type RpSession } from "./session-store";

/** The store and IdP calls freshSession needs; injectable so the race is testable without Redis. */
export interface SessionDeps {
  getSession: typeof getSession;
  putSession: typeof putSession;
  refreshTokens: typeof refreshTokens;
}

const defaultDeps: SessionDeps = { getSession, putSession, refreshTokens };
import { toAuthUser, type AccessClaims, type AuthUser } from "./claims";

// Per-request auth (080-rp section 2.6 / 2.9): rpsid -> session -> silent refresh
// if the access token is near expiry (token rotation: new refresh stored, old
// invalidated) -> verify access token -> AuthUser. Returns null when there is no
// valid session (caller 401s XHR / 302s a page to /auth/login).

const REFRESH_SKEW_SECONDS = 60;

export interface AuthSession {
  user: AuthUser;
  /**
   * The member's own verified access token - never sent to the browser, never
   * logged. Its one sanctioned use is as `subject_token` for an OBO S2S
   * exchange (platform/s2s.ts), so a downstream audit names the person behind
   * a call rather than just "yucer the product."
   */
  accessToken: string;
}

export async function getAuthUser(cfg: OidcConfig, rpsid: string): Promise<AuthUser | null> {
  return (await getAuthSession(cfg, rpsid))?.user ?? null;
}

/** Same resolution as getAuthUser, plus the raw access token for OBO callers. */
export async function getAuthSession(cfg: OidcConfig, rpsid: string): Promise<AuthSession | null> {
  const session = await freshSession(cfg, rpsid);
  if (!session) return null;

  let claims: AccessClaims;
  try {
    claims = (await verifyToken(session.accessToken, cfg)) as AccessClaims;
  } catch {
    return null;
  }
  return { user: toAuthUser(claims), accessToken: session.accessToken };
}

/** The stored session, refreshed first if its access token is near expiry. */
export async function freshSession(
  cfg: OidcConfig,
  rpsid: string,
  deps: SessionDeps = defaultDeps,
): Promise<RpSession | null> {
  const session = await deps.getSession(cfg.clientId, rpsid);
  if (!session) return null;
  if (!nearExpiry(session)) return session;
  return refreshOnce(cfg, rpsid, session, deps); // null -> refresh failed, session invalid
}

// SINGLE-FLIGHT. The IdP rotates refresh tokens: each one works exactly once.
// One render resolves the session several times at once - the (app) layout, the
// page, the @deck slot, server actions - and after the access token expires
// every one of them read the same stale session. Each presented the same refresh
// token; the first won and the rest got invalid_grant as a replay, returned
// null, and the member saw the sign-in prompt while still signed in at the
// platform (idle ~10 min, then the signed-out screen, then sign-in goes straight back in).
// Concurrent callers for one rpsid in this process now share one refresh.
const inflight = new Map<string, Promise<RpSession | null>>();

function refreshOnce(
  cfg: OidcConfig,
  rpsid: string,
  session: RpSession,
  deps: SessionDeps,
): Promise<RpSession | null> {
  const key = `${cfg.clientId}:${rpsid}`;
  let pending = inflight.get(key);
  if (!pending) {
    pending = tryRefresh(cfg, rpsid, session, deps).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

function nearExpiry(session: RpSession): boolean {
  const now = Math.floor(Date.now() / 1000);
  return session.accessExpiresAt - now <= REFRESH_SKEW_SECONDS && !!session.refreshToken;
}

async function tryRefresh(
  cfg: OidcConfig,
  rpsid: string,
  session: RpSession,
  deps: SessionDeps,
): Promise<RpSession | null> {
  try {
    const tokens = await deps.refreshTokens(cfg, session.refreshToken!);
    const next: RpSession = {
      ...session,
      accessToken: tokens.access_token,
      idToken: tokens.id_token ?? session.idToken,
      // rotation: the IdP returns a fresh refresh token; store it, drop the old
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      accessExpiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 300),
    };
    await deps.putSession(cfg.clientId, rpsid, next, cfg.sessionTtlSeconds);
    return next;
  } catch {
    // Another process may have rotated this token between our read and our
    // refresh (single-flight is per process). If the store now holds a
    // different, fresh session, that one is valid - use it.
    const current = await deps.getSession(cfg.clientId, rpsid).catch(() => null);
    if (current && current.refreshToken !== session.refreshToken && !nearExpiry(current)) {
      return current;
    }
    // invalid_grant (expired/revoked/replayed) -> session is dead
    return null;
  }
}
