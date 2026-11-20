import type { OidcConfig } from "./config";
import { accessExpiry, refreshTokens, verifyToken } from "./oidc";
import {
  acquireCheckLock,
  deleteSession,
  getSession,
  updateSession,
  releaseCheckLock,
  type RpSession,
} from "./session-store";
import type { AccessClaims } from "./claims";
import { sameAccessScope } from "./session-context";
import { describeError, noteLoginState } from "./auth-failures";

// Accounts is the sole login authority. Status checks (including background
// active:false probes) do not rotate tokens or renew idle time. Real activity
// is reported separately. One Redis lease and fenced writes prevent a delayed
// status/refresh response from resurrecting a session removed by logout.

/** What a check found. `session` is the record to keep when the login holds. */
export type CheckResult =
  | { readonly kind: "valid"; readonly session: RpSession }
  | { readonly kind: "ended"; readonly detail: string }
  | { readonly kind: "unavailable"; readonly detail: string };

type CheckPurpose = "status" | "token" | "context";

export interface LoginAuthority {
  /** Ask accounts whether this login still holds. `activity`: the member is
   *  actually using the product right now (accounts may renew on it). */
  check(cfg: OidcConfig, session: RpSession, activity: boolean): Promise<CheckResult>;
  /** A usable access token for calling the platform on the member's behalf,
   *  or null. Never ends the login state. */
  freshToken(cfg: OidcConfig, session: RpSession): Promise<CheckResult>;
}

export interface LoginStateDeps {
  getSession: typeof getSession;
  updateSession: typeof updateSession;
  deleteSession: typeof deleteSession;
  acquireCheckLock: typeof acquireCheckLock;
  releaseCheckLock: typeof releaseCheckLock;
  authority: LoginAuthority;
  now: () => number; // epoch seconds
}

/** How long a checker may hold the lock before it frees itself - a crash
 *  guard, not a schedule. */
const LOCK_HOLD_SECONDS = 20;
/** Ask again a little before accounts' own deadline, not after it. */
const EARLY_SECONDS = 30;
/** After an unanswered check, try again on the next activity past this. A
 *  retry pace, not a lifetime: nothing ends because of it. */
const RETRY_SECONDS = 30;

const nowSeconds = () => Date.now() / 1000;

/** The record's schedule, from what accounts said. */
function scheduleFrom(session: RpSession, accountsNextCheckAt: number | undefined, now: number): number {
  const deadline = accountsNextCheckAt ?? session.accessExpiresAt;
  return Math.max(now, deadline - EARLY_SECONDS);
}

// --- adapters ---------------------------------------------------------------

/** A 4xx from the token endpoint is accounts answering "no". Anything else -
 *  network, timeout, 5xx - is accounts not answering at all. */
function isRefusal(err: unknown): boolean {
  return /^token endpoint 4\d\d/.test(err instanceof Error ? err.message : "");
}

async function renewGrant(
  cfg: OidcConfig,
  session: RpSession,
  deps: { refreshTokens: typeof refreshTokens; verifyToken: typeof verifyToken },
  now: number,
): Promise<CheckResult> {
  if (!session.refreshToken) return { kind: "ended", detail: "no refresh token to renew with" };
  let tokens;
  try {
    tokens = await deps.refreshTokens(cfg, session.refreshToken);
  } catch (err) {
    return isRefusal(err)
      ? { kind: "ended", detail: describeError(err) }
      : { kind: "unavailable", detail: describeError(err) };
  }
  let claims: AccessClaims;
  try {
    claims = (await deps.verifyToken(tokens.access_token, cfg)) as AccessClaims;
  } catch (err) {
    return { kind: "unavailable", detail: `renewed token did not verify: ${describeError(err)}` };
  }
  if (claims.sub !== session.sub) return { kind: "ended", detail: "renewed subject mismatch" };
  const accessExpiresAt = accessExpiry(tokens.access_token, tokens.expires_in, now);
  return {
    kind: "valid",
    session: {
      ...session,
      accessToken: tokens.access_token,
      idToken: tokens.id_token ?? session.idToken,
      // rotation: the IdP returns a fresh refresh token; store it, drop the old
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      accessExpiresAt,
      claims,
      nextCheckAt: accessExpiresAt,
    },
  };
}

/** The interim adapter: renewing the grant IS the question. */
export function grantAuthority(
  deps: { refreshTokens: typeof refreshTokens; verifyToken: typeof verifyToken } = { refreshTokens, verifyToken },
  now: () => number = nowSeconds,
): LoginAuthority {
  return {
    check: (cfg, session) => renewGrant(cfg, session, deps, now()),
    freshToken: (cfg, session) => renewGrant(cfg, session, deps, now()),
  };
}

/**
 * The adapter for accounts' sid status query (vxture-platform/vxture-platform#538).
 *
 * Deployed Accounts contract:
 *   POST <ACCOUNTS_SESSION_STATUS_URL>
 *   Authorization: Basic <client_id:client_secret>
 *   { "sid": "...", "active": true|false }
 *   -> 200 { "valid": true|false, "next_check_at": <epoch seconds> }
 * Background probes MUST send active:false.
 *
 * Token renewal stays a separate concern: a failed renewal returns
 * "unavailable" for that call and never ends the login.
 */
export function accountsStatusAuthority(
  url: string,
  deps: {
    refreshTokens: typeof refreshTokens;
    verifyToken: typeof verifyToken;
    fetch: typeof fetch;
  } = { refreshTokens, verifyToken, fetch },
  now: () => number = nowSeconds,
): LoginAuthority {
  return {
    async check(cfg, session, activity) {
      if (!session.sid) return { kind: "unavailable", detail: "record carries no sid" };
      let res: Response;
      try {
        res = await deps.fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"),
          },
          body: JSON.stringify({ sid: session.sid, active: activity }),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        });
      } catch (err) {
        return { kind: "unavailable", detail: describeError(err) };
      }
      if (!res.ok) return { kind: "unavailable", detail: `status query ${res.status}` };
      const body = (await res.json().catch(() => null)) as { valid?: unknown; next_check_at?: unknown } | null;
      if (body?.valid === false) return { kind: "ended", detail: "accounts: login no longer valid" };
      if (body?.valid !== true) return { kind: "unavailable", detail: "status query answered neither yes nor no" };
      const next = typeof body.next_check_at === "number" && Number.isFinite(body.next_check_at) ? body.next_check_at : undefined;
      return { kind: "valid", session: { ...session, nextCheckAt: next ?? scheduleFrom(session, undefined, now()) + EARLY_SECONDS } };
    },
    async freshToken(cfg, session) {
      const r = await renewGrant(cfg, session, deps, now());
      // Under a real status query, a refused renewal says nothing about the
      // login - only the query does. Downgrade "ended" to "unavailable" and
      // keep the login's own schedule.
      if (r.kind === "ended") return { kind: "unavailable", detail: r.detail };
      if (r.kind === "valid") return { kind: "valid", session: { ...r.session, nextCheckAt: session.nextCheckAt } };
      return r;
    },
  };
}

export function defaultAuthority(cfg: OidcConfig): LoginAuthority {
  // The deployed Accounts contract, not refresh-token rotation, owns login.
  const url = process.env.ACCOUNTS_SESSION_STATUS_URL || `${cfg.issuer}/oidc/session/status`;
  return accountsStatusAuthority(url);
}

const defaultDeps = (cfg: OidcConfig): LoginStateDeps => ({
  getSession,
  updateSession,
  deleteSession,
  acquireCheckLock,
  releaseCheckLock,
  authority: defaultAuthority(cfg),
  now: nowSeconds,
});

// --- the one checker ------------------------------------------------------------

export class LoginStateUnavailableError extends Error {
  constructor() { super("Central login validation unavailable"); this.name = "LoginStateUnavailableError"; }
}

export interface LoginState {
  readonly session: RpSession;
  readonly claims: AccessClaims;
  readonly previousClaims?: AccessClaims;
}

function due(session: RpSession, now: number): boolean {
  return !session.claims || scheduleFrom(session, session.nextCheckAt, now) <= now;
}

/**
 * Run one check under the lock, and apply what accounts said. Returns the
 * record as it stands afterwards, or null when the login has ended. When
 * another request holds the lock, callers wait for its fenced result.
 */
async function checkOnce(
  cfg: OidcConfig,
  rpsid: string,
  purpose: CheckPurpose,
  deps: LoginStateDeps,
  ask: (session: RpSession) => Promise<CheckResult>,
  onlyIf: (session: RpSession) => boolean,
): Promise<RpSession | null | "busy"> {
  const lease = await deps.acquireCheckLock(cfg.clientId, rpsid, LOCK_HOLD_SECONDS);
  if (!lease) return "busy";
  try {
    // RE-READ INSIDE THE LOCK: whoever held it last may already have asked.
    let current = await deps.getSession(cfg.clientId, rpsid);
    if (!current) return null;
    if (!onlyIf(current)) return current;
    if (purpose === "context") {
      // Other requests must not authorize old claims during this round trip.
      const pending = { ...current, contextUnavailable: true };
      const saved = await deps.updateSession(cfg.clientId, rpsid, current, pending, cfg.sessionTtlSeconds, lease);
      if (!saved) return busyOrGone(cfg, rpsid, deps);
      current = pending;
    }
    return await applyCheckedResult(cfg, rpsid, current, await ask(current), purpose, lease, deps);
  } finally {
    await deps.releaseCheckLock(cfg.clientId, rpsid, lease).catch(() => undefined);
  }
}

async function busyOrGone(cfg: OidcConfig, rpsid: string, deps: LoginStateDeps): Promise<"busy" | null> {
  return (await deps.getSession(cfg.clientId, rpsid)) ? "busy" : null;
}

async function applyCheckedResult(
  cfg: OidcConfig, rpsid: string, current: RpSession, result: CheckResult,
  purpose: CheckPurpose, lease: string, deps: LoginStateDeps,
): Promise<RpSession | null | "busy"> {
  if (result.kind === "ended") {
    noteLoginState("ended_by_accounts", result.detail);
    await deps.deleteSession(cfg.clientId, rpsid, { session: current, lease });
    return busyOrGone(cfg, rpsid, deps);
  }
  let next: RpSession;
  if (result.kind === "valid") {
    next = checkedRecord(result.session, purpose, deps.now());
  } else {
    noteLoginState(purpose === "status" ? "check_unavailable" : "token_unavailable", "central request unavailable");
    // Keep recovery credentials, but never authorize an unchecked old scope.
    next = purpose === "status"
      ? { ...current, nextCheckAt: deps.now() + RETRY_SECONDS + EARLY_SECONDS, statusUnavailable: true }
      : current;
  }
  const saved = await deps.updateSession(cfg.clientId, rpsid, current, next, cfg.sessionTtlSeconds, lease);
  return saved ? next : busyOrGone(cfg, rpsid, deps);
}

function checkedRecord(session: RpSession, purpose: CheckPurpose, now: number): RpSession {
  if (purpose === "status") return { ...session, checkedAt: now, statusUnavailable: false };
  if (purpose === "context") return { ...session, contextCheckedAt: now, contextUnavailable: false };
  return session;
}

async function settleCheck(
  cfg: OidcConfig, rpsid: string, purpose: "status" | "context", deps: LoginStateDeps,
  initial: RpSession, ask: (s: RpSession) => Promise<CheckResult>, onlyIf: (s: RpSession) => boolean,
): Promise<RpSession | null> {
  let session = initial;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (!onlyIf(session)) return session;
    const after = await checkOnce(cfg, rpsid, purpose, deps, ask, onlyIf);
    if (after !== "busy") return after;
    await new Promise((r) => setTimeout(r, 50));
    const current = await deps.getSession(cfg.clientId, rpsid);
    if (!current) return null;
    session = current;
  }
  throw new LoginStateUnavailableError();
}

/**
 * The login state behind a cookie. `activity`: the member is actually doing
 * something (a page they opened, an action they took). Read-only checks also
 * run when due; forceCheck bypasses the schedule without reporting activity.
 */
export async function resolveLoginState(
  cfg: OidcConfig,
  rpsid: string,
  opts: { activity: boolean; forceCheck?: boolean; syncContext?: boolean },
  deps: LoginStateDeps = defaultDeps(cfg),
): Promise<LoginState | null> {
  let session = await deps.getSession(cfg.clientId, rpsid);
  if (!session) {
    noteLoginState("no_record");
    return null;
  }

  const previousClaims = session.claims;
  const requestedAt = deps.now();
  const shouldCheck = (s: RpSession) => due(s, deps.now()) || (!!opts.forceCheck && (s.statusUnavailable || (s.checkedAt ?? 0) < requestedAt));
  session = await settleCheck(cfg, rpsid, "status", deps, session,
    (s) => deps.authority.check(cfg, s, opts.activity), shouldCheck);
  if (!session) return null;
  if (session.statusUnavailable) throw new LoginStateUnavailableError();

  // Foreground entry/refocus is separate from read-only login validation.
  // A still-fresh access token is a signed snapshot, not the current selection.
  // Overlapping tabs share the existing lease and the completed refresh.
  const needsContext = (s: RpSession) => !!s.contextUnavailable || (s.contextCheckedAt ?? 0) < requestedAt;
  if (opts.syncContext) {
    session = await settleCheck(cfg, rpsid, "context", deps, session,
      (s) => deps.authority.freshToken(cfg, s), needsContext);
    if (!session) return null;
  }
  if (session.contextUnavailable) throw new LoginStateUnavailableError();
  if (!session.claims) return null;
  return { session, claims: session.claims, previousClaims };
}

/**
 * An access token for calling the platform on the member's behalf (OBO), or
 * null. Renews under the same lock when the stored one has run out. A null
 * here affects the call, never the login state.
 */
export async function accessTokenFor(
  cfg: OidcConfig,
  rpsid: string,
  deps: LoginStateDeps = defaultDeps(cfg),
  expectedClaims?: AccessClaims,
): Promise<string | null> {
  const fresh = (s: RpSession) => s.accessExpiresAt - deps.now() > EARLY_SECONDS;
  const session = await deps.getSession(cfg.clientId, rpsid);
  if (!session) {
    if (expectedClaims) throw new LoginStateUnavailableError();
    return null;
  }
  const usableToken = (s: RpSession): string | null => {
    // A request resolved its data scope before requesting an OBO ticket.
    // A concurrent context refresh cannot lend it another workspace's token.
    if (s.statusUnavailable || s.contextUnavailable
      || (expectedClaims && (!s.claims || !sameAccessScope(expectedClaims, s.claims)))) {
      throw new LoginStateUnavailableError();
    }
    return fresh(s) ? s.accessToken : null;
  };
  const existing = usableToken(session);
  if (existing) return existing;

  for (let attempt = 0; attempt < 10; attempt++) {
    const after = await checkOnce(
      cfg, rpsid, "token", deps,
      (s) => deps.authority.freshToken(cfg, s),
      (s) => !fresh(s),
    );
    if (after === null) {
      if (expectedClaims) throw new LoginStateUnavailableError();
      return null;
    }
    if (after !== "busy") return usableToken(after);
    // Somebody else is renewing: wait for their result rather than racing it.
    await new Promise((r) => setTimeout(r, 300));
    const now = await deps.getSession(cfg.clientId, rpsid);
    if (now && fresh(now)) return usableToken(now);
  }
  noteLoginState("token_unavailable", "renewal busy too long");
  return null;
}
