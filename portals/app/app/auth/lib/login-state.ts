import type { OidcConfig } from "./config";
import { accessExpiry, refreshTokens, verifyToken } from "./oidc";
import {
  acquireCheckLock,
  deleteSession,
  getSession,
  putSession,
  releaseCheckLock,
  type RpSession,
} from "./session-store";
import type { AccessClaims } from "./claims";
import { describeError, noteLoginState } from "./auth-failures";

// THE PRODUCT'S ONE LOGIN STATE (owner rulings, 2026-09-29).
//
//   - ACCOUNTS IS THE ONLY AUTHORITY on whether a person is logged in. This
//     product defines no login lifetime and never logs anybody out on its own
//     clock. The same person uses several products at once; none of them may
//     kick them out.
//   - ONE STATE PER PRODUCT. A browser holds one opaque cookie; behind it is
//     one record - who this is and which accounts login (`sid`) it mirrors.
//     Every section reads that record. None of them checks or refreshes
//     anything: the old design had 131 call sites each deciding for itself
//     that a token was near expiry and racing to refresh it, and the platform
//     answers a replayed refresh token by revoking the whole chain. That race
//     is what signed people out after about ten minutes.
//   - ONE CHECKER. When accounts is due to be asked again, exactly one request
//     - across every process, via a Redis lock - asks. Everyone else reads the
//     record as it stands and carries on.
//   - ASKED ON ACTIVITY ONLY. A check doubles as "the member is using this"
//     (accounts renews its idle clock on it). A request the member did not
//     make - a status probe, a link prefetch - reads, never checks, so an open
//     tab does not keep a login alive forever.
//   - THE STATE ENDS only when accounts says so, or the member logs out
//     (auth/logout, which ends the ACCOUNTS login - global, every product).
//     An unanswered question (network, 5xx) is not a "no": the state is kept.
//
// WHAT "ASK ACCOUNTS" MEANS depends on what the platform offers, so it is a
// port (`LoginAuthority`) with two adapters:
//   - `accountsStatusAuthority` - the sid status query requested in
//     vxture-platform/vxture-platform#538. Used when ACCOUNTS_SESSION_STATUS_URL
//     is set. Its request/response shape is this product's proposal until the
//     platform answers; see the adapter.
//   - `grantAuthority` - the interim. The only server-side question accounts
//     answers today is "renew this grant": yes, or invalid_grant. With the
//     race gone (one checker, lock, re-read) an invalid_grant is accounts
//     saying the login's grant is over, not the product tripping over itself.
//     Its schedule comes from accounts too: the access token's own expiry.

/** What a check found. `session` is the record to keep when the login holds. */
export type CheckResult =
  | { readonly kind: "valid"; readonly session: RpSession }
  | { readonly kind: "ended"; readonly detail: string }
  | { readonly kind: "unavailable"; readonly detail: string };

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
  putSession: typeof putSession;
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

const nowSeconds = () => Math.floor(Date.now() / 1000);

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
 * PROPOSED SHAPE, until the platform answers:
 *   POST <ACCOUNTS_SESSION_STATUS_URL>
 *   Authorization: Basic <client_id:client_secret>
 *   { "sid": "...", "active": true|false }
 *   -> 200 { "valid": true|false, "next_check_at": <epoch seconds> }
 * Adjust here, and only here, when the real contract lands.
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
        });
      } catch (err) {
        return { kind: "unavailable", detail: describeError(err) };
      }
      if (!res.ok) return { kind: "unavailable", detail: `status query ${res.status}` };
      const body = (await res.json().catch(() => null)) as { valid?: unknown; next_check_at?: unknown } | null;
      if (body?.valid === false) return { kind: "ended", detail: "accounts: login no longer valid" };
      if (body?.valid !== true) return { kind: "unavailable", detail: "status query answered neither yes nor no" };
      const next = typeof body.next_check_at === "number" ? body.next_check_at : undefined;
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

export function defaultAuthority(): LoginAuthority {
  const url = process.env.ACCOUNTS_SESSION_STATUS_URL;
  return url ? accountsStatusAuthority(url) : grantAuthority();
}

const defaultDeps = (): LoginStateDeps => ({
  getSession,
  putSession,
  deleteSession,
  acquireCheckLock,
  releaseCheckLock,
  authority: defaultAuthority(),
  now: nowSeconds,
});

// --- the one checker ------------------------------------------------------------

export interface LoginState {
  readonly session: RpSession;
  readonly claims: AccessClaims;
}

function due(session: RpSession, now: number): boolean {
  return !session.claims || scheduleFrom(session, session.nextCheckAt, now) <= now;
}

/**
 * Run one check under the lock, and apply what accounts said. Returns the
 * record as it stands afterwards, or null when the login has ended. When
 * another request holds the lock, returns the record unchanged - that request
 * is doing the asking.
 */
async function checkOnce(
  cfg: OidcConfig,
  rpsid: string,
  activity: boolean,
  deps: LoginStateDeps,
  ask: (session: RpSession) => Promise<CheckResult>,
  onlyIf: (session: RpSession) => boolean,
): Promise<RpSession | null | "busy"> {
  if (!(await deps.acquireCheckLock(cfg.clientId, rpsid, LOCK_HOLD_SECONDS))) return "busy";
  try {
    // RE-READ INSIDE THE LOCK: whoever held it last may already have asked.
    const current = await deps.getSession(cfg.clientId, rpsid);
    if (!current) return null;
    if (!onlyIf(current)) return current;
    const result = await ask(current);
    if (result.kind === "valid") {
      await deps.putSession(cfg.clientId, rpsid, result.session, cfg.sessionTtlSeconds);
      return result.session;
    }
    if (result.kind === "ended") {
      noteLoginState("ended_by_accounts", result.detail);
      await deps.deleteSession(cfg.clientId, rpsid).catch(() => undefined);
      return null;
    }
    noteLoginState(activity ? "check_unavailable" : "token_unavailable", result.detail);
    const kept = { ...current, nextCheckAt: deps.now() + RETRY_SECONDS + EARLY_SECONDS };
    await deps.putSession(cfg.clientId, rpsid, kept, cfg.sessionTtlSeconds);
    return kept;
  } finally {
    await deps.releaseCheckLock(cfg.clientId, rpsid).catch(() => undefined);
  }
}

/**
 * The login state behind a cookie. `activity`: the member is actually doing
 * something (a page they opened, an action they took). Only then is accounts
 * asked, and only when accounts' own schedule says it is time.
 */
export async function resolveLoginState(
  cfg: OidcConfig,
  rpsid: string,
  opts: { activity: boolean },
  deps: LoginStateDeps = defaultDeps(),
): Promise<LoginState | null> {
  let session = await deps.getSession(cfg.clientId, rpsid);
  if (!session) {
    noteLoginState("no_record");
    return null;
  }

  // A record from before this module has no claims: it must be asked once,
  // activity or not, or it has nothing to show.
  if (due(session, deps.now()) && (opts.activity || !session.claims)) {
    const after = await checkOnce(
      cfg, rpsid, true, deps,
      (s) => deps.authority.check(cfg, s, opts.activity),
      (s) => due(s, deps.now()),
    );
    if (after === null) return null;
    if (after !== "busy") session = after;
  }

  if (!session.claims) return null; // pre-existing record, check in flight elsewhere
  return { session, claims: session.claims };
}

/**
 * An access token for calling the platform on the member's behalf (OBO), or
 * null. Renews under the same lock when the stored one has run out. A null
 * here affects the call, never the login state.
 */
export async function accessTokenFor(
  cfg: OidcConfig,
  rpsid: string,
  deps: LoginStateDeps = defaultDeps(),
): Promise<string | null> {
  const fresh = (s: RpSession) => s.accessExpiresAt - deps.now() > EARLY_SECONDS;
  const session = await deps.getSession(cfg.clientId, rpsid);
  if (!session) return null;
  if (fresh(session)) return session.accessToken;

  for (let attempt = 0; attempt < 10; attempt++) {
    const after = await checkOnce(
      cfg, rpsid, false, deps,
      (s) => deps.authority.freshToken(cfg, s),
      (s) => !fresh(s),
    );
    if (after === null) return null;
    if (after !== "busy") return fresh(after) ? after.accessToken : null;
    // Somebody else is renewing: wait for their result rather than racing it.
    await new Promise((r) => setTimeout(r, 300));
    const now = await deps.getSession(cfg.clientId, rpsid);
    if (now && fresh(now)) return now.accessToken;
  }
  noteLoginState("token_unavailable", "renewal busy too long");
  return null;
}
