import type { OidcConfig } from "./config";
import { accessExpiry, verifyToken, refreshTokens } from "./oidc";
import { deleteSession, getSession, putSession, type RpSession } from "./session-store";
import { toAuthUser, type AccessClaims, type AuthUser } from "./claims";
import { describeError, recordSessionDrop } from "./auth-failures";

// Per-request auth (080-rp section 2.6 / 2.9): rpsid -> session -> silent refresh
// if the access token is near expiry (token rotation: new refresh stored, old
// invalidated) -> verify access token -> AuthUser. Returns null when there is no
// valid session (caller 401s XHR / 302s a page to /auth/login).
//
// EVERY null IS COUNTED, with its reason (auth-failures.ts): a session that
// dies must say why, or the next report of it is a guess again.

const REFRESH_SKEW_SECONDS = 60;

/** The store and IdP calls resolveSession needs; injectable so the races are
 *  testable without Redis or a network. */
export interface SessionDeps {
  getSession: typeof getSession;
  putSession: typeof putSession;
  deleteSession: typeof deleteSession;
  refreshTokens: typeof refreshTokens;
  verifyToken: typeof verifyToken;
}

const defaultDeps: SessionDeps = { getSession, putSession, deleteSession, refreshTokens, verifyToken };

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
  const resolved = await resolveSession(cfg, rpsid);
  if (!resolved) return null;
  return { user: toAuthUser(resolved.claims), accessToken: resolved.session.accessToken };
}

/**
 * The stored session, refreshed if it needs it, with its access token
 * verified. Null when there is no usable session - and the reason recorded.
 */
export async function resolveSession(
  cfg: OidcConfig,
  rpsid: string,
  deps: SessionDeps = defaultDeps,
): Promise<{ session: RpSession; claims: AccessClaims } | null> {
  let session = await deps.getSession(cfg.clientId, rpsid);
  if (!session) {
    recordSessionDrop("no_session");
    return null;
  }

  let refreshed = false;
  if (nearExpiry(session)) {
    session = await refreshOnce(cfg, rpsid, session, deps);
    if (!session) return null; // refresh failed -> session invalid (recorded)
    refreshed = true;
  }

  try {
    return { session, claims: (await deps.verifyToken(session.accessToken, cfg)) as AccessClaims };
  } catch (err) {
    // A token the clock says is fine but the verifier says is not. Whatever the
    // cause - an `exp` earlier than `expires_in` promised, skew between hosts -
    // the remedy for an EXPIRED token is the same: get a new one, once.
    const expired = (err as { code?: string } | null)?.code === "ERR_JWT_EXPIRED";
    if (expired && session.refreshToken && !refreshed) {
      const next = await refreshOnce(cfg, rpsid, session, deps);
      if (!next) return null;
      try {
        return { session: next, claims: (await deps.verifyToken(next.accessToken, cfg)) as AccessClaims };
      } catch (err2) {
        recordSessionDrop("token_invalid_after_refresh", describeError(err2));
        return null;
      }
    }
    recordSessionDrop("token_invalid", describeError(err));
    return null;
  }
}

// SINGLE-FLIGHT. The IdP rotates refresh tokens: each one works exactly once,
// and presenting a spent one is a replay - which the platform answers by
// revoking the WHOLE token chain, including the token the winning request has
// just been given (as vx-agent-tenderforge's OidcLoginService documents).
// So one lost race does not cost one request its session; it costs everyone
// theirs.
//
// One render resolves the session several times at once - the (app) layout, the
// page, the @deck slot, server actions, polling - and after the access token
// expires every one of them used to read the same stale session and present
// the same refresh token. Concurrent callers for one rpsid now share one
// refresh.
//
// AND THE FLIGHT RE-READS THE STORE before it refreshes. Sharing the promise is
// not enough: a request that read the session BEFORE the first refresh landed,
// and reaches this point AFTER it finished, finds the map empty and would
// refresh with the token that was just spent. Inside the flight the stored
// session is the truth; if somebody already refreshed it, use theirs.
//
// KEPT ON globalThis for the reason auth-failures.ts gives: separate route
// bundles must share one map or this guards nothing across them.
const FLIGHTS_KEY = "__yucerRefreshFlights";

function flights(): Map<string, Promise<RpSession | null>> {
  const g = globalThis as unknown as Record<string, Map<string, Promise<RpSession | null>> | undefined>;
  return (g[FLIGHTS_KEY] ??= new Map());
}

function refreshOnce(
  cfg: OidcConfig,
  rpsid: string,
  seen: RpSession,
  deps: SessionDeps,
): Promise<RpSession | null> {
  const key = `${cfg.clientId}:${rpsid}`;
  const map = flights();
  let pending = map.get(key);
  if (!pending) {
    pending = refreshLatest(cfg, rpsid, seen, deps).finally(() => map.delete(key));
    map.set(key, pending);
  }
  return pending;
}

async function refreshLatest(
  cfg: OidcConfig,
  rpsid: string,
  seen: RpSession,
  deps: SessionDeps,
): Promise<RpSession | null> {
  const latest = await deps.getSession(cfg.clientId, rpsid);
  if (!latest) {
    recordSessionDrop("no_session", "gone before refresh");
    return null;
  }
  // Somebody refreshed between our read and this flight: their session is
  // newer than the one we hold and does not need refreshing again.
  if (latest.accessToken !== seen.accessToken && !nearExpiry(latest)) return latest;
  return tryRefresh(cfg, rpsid, latest, deps);
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
      accessExpiresAt: accessExpiry(tokens.access_token, tokens.expires_in, Math.floor(Date.now() / 1000)),
    };
    await deps.putSession(cfg.clientId, rpsid, next, cfg.sessionTtlSeconds);
    return next;
  } catch (err) {
    // Another PROCESS may have rotated this token between our read and our
    // refresh (the flight is per process). If the store now holds a different,
    // fresh session, that one is valid - use it.
    const current = await deps.getSession(cfg.clientId, rpsid).catch(() => null);
    if (current && current.refreshToken !== session.refreshToken && !nearExpiry(current)) {
      return current;
    }
    // invalid_grant (expired/revoked/replayed) or the IdP unreachable -> dead.
    recordSessionDrop("refresh_failed", describeError(err));
    // AN EXPLICIT REFUSAL ENDS THE SESSION FOR GOOD, so remove it. Left in
    // Redis, every later request - each render, each poll - presents the same
    // dead refresh token again: a replay each time, to a platform that answers
    // replays by revoking (seen against a stand-in IdP, 2026-09-29: the same
    // token refused over and over). Only a 4xx counts; a network error or a 5xx
    // says nothing about the token, and the session may yet be fine.
    if (/^token endpoint 4\d\d/.test(err instanceof Error ? err.message : "")) {
      await deps.deleteSession(cfg.clientId, rpsid).catch(() => undefined);
    }
    return null;
  }
}
