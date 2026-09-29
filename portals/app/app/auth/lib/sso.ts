// Silent SSO: arriving from the platform already signed in.
//
// Somebody who opens yucer from console.vxture.com is ALREADY signed in at
// accounts.vxture.com - they just have no RP session here yet. Showing them
// the front door and a 登录 button asks them to re-assert something the IdP
// already knows (owner, 2026-09-28: "已经登录 vxture.com ... 停留在欢迎使用首页,
// 需要点击登录才能进入").
//
// So middleware.ts sends a session-less page visit through
// `/auth/login?silent=1` first, which adds `prompt=none` to the authorize
// request. If the IdP has a session the round trip is invisible and they land
// on the page they asked for; if it does not, the IdP answers
// `login_required` (verified against accounts.vxture.com on 2026-09-28) and
// the visitor meets the front door exactly as before.
//
// The marker cookie is what keeps it from looping: it is set on the redirect
// that STARTS the attempt, so an IdP that keeps answering login_required costs
// one redirect, not an infinite loop. A successful callback clears it, so the
// next signed-out visit gets a fresh attempt.
//
// Ported from vx-agent-vxtpl #85 - whose middleware.ts, as merged, carries
// the comment and the import but not the redirect itself.
//
// This module imports NOTHING on purpose: middleware.ts runs on the edge
// runtime and the auth routes on node, and a dependency-free module is the only
// shape safe in both without a second, drifting copy of the names.

const SSO_ATTEMPT_BASE = "yucer_sso_tried";

/** Long enough to stop a loop; short enough that somebody who signs in at the
 *  platform a few minutes later still gets a silent attempt, not a door. */
export const SSO_ATTEMPT_TTL_SECONDS = 600;

/** What a SUCCESSFUL sign-in leaves the marker at, instead of clearing it.
 *
 *  Clearing it would let a member whose session is valid but unusable to the
 *  layout - no active workspace, no role row - loop: resume silently, sign in,
 *  marker cleared, layout still has no session, resume silently... A few
 *  seconds is all the loop guard needs; it is deliberately not the full
 *  SSO_ATTEMPT_TTL_SECONDS, so a session that dies again a few minutes later
 *  still gets its own silent attempt. */
export const SSO_FRESH_TTL_SECONDS = 30;

/** Host-prefixed exactly when the session cookie is (`__Host-` needs Secure,
 *  which dev over http cannot satisfy). */
export function ssoAttemptCookieName(sessionCookieName: string): string {
  return sessionCookieName.startsWith("__Host-") ? `__Host-${SSO_ATTEMPT_BASE}` : SSO_ATTEMPT_BASE;
}

export function ssoAttemptCookieOptions(sessionCookieName: string, maxAge = SSO_ATTEMPT_TTL_SECONDS) {
  return {
    httpOnly: true as const,
    secure: sessionCookieName.startsWith("__Host-"),
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge,
  };
}

/**
 * Whether a page that found NO USABLE SESSION should try to get one back
 * silently, rather than show the front door.
 *
 * The gap this closes (owner report, 2026-09-29: signed out after about ten
 * minutes, and 登录 then goes straight back in): shouldTrySilentSso above only
 * fires for a visit with NO session cookie. A member whose session died SERVER
 * side - refresh refused, Redis lost it - still holds the cookie, so they were
 * shown the door and asked to click through something the IdP already knows.
 * Same person, same IdP session, same answer as a silent attempt - it just
 * never got asked.
 *
 * Only when there IS a cookie: no cookie is shouldTrySilentSso's case and the
 * middleware has already had its turn. And the same marker keeps it from
 * looping - the login route sets it on the attempt, so an IdP that answers
 * login_required costs one redirect and then the door renders as before.
 */
export function shouldResumeSilently(r: {
  enabled: boolean;
  hasCookie: boolean;
  triedRecently: boolean;
  justSignedOut: boolean;
}): boolean {
  return r.enabled && r.hasCookie && !r.triedRecently && !r.justSignedOut;
}

/**
 * The authorize errors that mean "nobody is signed in here, and I was told not
 * to ask" (OIDC core 3.1.2.6) - the EXPECTED answer to prompt=none, not a
 * failure. Every other error is a real one and still rejects.
 */
const INTERACTION_REQUIRED = new Set([
  "login_required",
  "interaction_required",
  "consent_required",
  "account_selection_required",
]);

export function isInteractionRequired(error: string): boolean {
  return INTERACTION_REQUIRED.has(error);
}

/** What the callback does with an authorize error: a silent attempt the IdP
 *  declined goes back to where the visitor was going; anything else rejects. */
export function silentErrorOutcome(error: string, authState: { silent?: boolean } | null): "return" | "reject" {
  return authState?.silent === true && isInteractionRequired(error) ? "return" : "reject";
}

/**
 * Whether this request should start a silent attempt. Only a top-level page
 * navigation, with sign-in configured, no session cookie, no attempt already
 * made, and not straight after a sign-out (the sign-out confirmation must
 * render, and the IdP session is gone anyway).
 */
export function shouldTrySilentSso(r: {
  method: string;
  pathname: string;
  enabled: boolean;
  hasSession: boolean;
  triedRecently: boolean;
  justSignedOut: boolean;
  /** Sec-Fetch-Mode, when the browser sends it. */
  fetchMode: string | null;
  /** Next's RSC / prefetch requests are fetches, not navigations. */
  isRscOrPrefetch: boolean;
}): boolean {
  if (!r.enabled || r.method !== "GET") return false;
  if (r.hasSession || r.triedRecently || r.justSignedOut) return false;
  if (r.isRscOrPrefetch) return false;
  if (r.fetchMode !== null && r.fetchMode !== "navigate") return false;
  // The login round trip itself, route handlers, build output, and any file.
  if (/^\/(auth|api|_next)(\/|$)/.test(r.pathname)) return false;
  if (/\.[a-z0-9]+$/i.test(r.pathname)) return false;
  return true;
}
