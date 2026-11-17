import { cookies } from "next/headers";
import { logoutResponse, SWITCH_COOKIE } from "../lib/logout";
import { clearCookieOptions } from "../lib/cookie";
import { SIGNED_OUT_COOKIE } from "../lib/signed-out-marker";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { makePkce, randomToken } from "../lib/pkce";
import { putAuthState } from "../lib/session-store";
import { safeReturnTo } from "../lib/return-to";
import { ssoAttemptCookieName, ssoAttemptCookieOptions } from "../lib/sso";

// GET /auth/login (080-rp section 2.3): mint PKCE(S256) + state + nonce, persist
// the handshake to Redis keyed by state (single-use), and top-level 302 to the
// IdP authorize endpoint. MUST be a top-level navigation - never iframe/XHR.
//
// `?silent=1` adds `prompt=none` (auth/lib/sso.ts): authenticate from an
// existing IdP session or answer login_required, never show a form.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  const url = new URL(req.url);
  let returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const jar = await cookies();
  if (url.searchParams.get("switch") === "1") {
    return logoutResponse(cfg, jar.get(cfg.cookieName)?.value, returnTo);
  }
  const switching = url.searchParams.get("switchComplete") === "1" && jar.has(SWITCH_COOKIE);
  const silent = url.searchParams.get("silent") === "1";
  // A silent attempt is a round trip the visitor did not ask for: on a
  // deployment where sign-in is not configured, send them where they were
  // going rather than to an IdP error page.
  if (silent && (!cfg.enabled || !cfg.redirectUri)) {
    return NextResponse.redirect(new URL(returnTo, cfg.appOrigin || url.origin).toString());
  }

  if (switching) returnTo = safeReturnTo(jar.get(SWITCH_COOKIE)?.value);

  const { verifier, challenge } = makePkce();
  const state = randomToken();
  const nonce = randomToken();
  await putAuthState(cfg.clientId, state, { verifier, nonce, returnTo, ...(silent ? { silent: true } : {}) });

  const authorize = new URL(cfg.authorizeUrl);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("redirect_uri", cfg.redirectUri);
  authorize.searchParams.set("scope", cfg.scopes);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  // The old login is centrally ended before asking for the next account.
  if (switching) authorize.searchParams.set("prompt", "login");
  else if (silent) authorize.searchParams.set("prompt", "none");
  const res = NextResponse.redirect(authorize.toString());
  // THE MARKER IS SET HERE TOO, not only by the middleware. A silent attempt
  // can now start from the layout (a session that died with its cookie still
  // in the browser - auth/lib/sso.ts shouldResumeSilently), where there is no
  // middleware redirect to carry it; without the marker an IdP that answers
  // login_required would be asked again on every render.
  if (silent) res.cookies.set(ssoAttemptCookieName(cfg.cookieName), "1", ssoAttemptCookieOptions(cfg.cookieName));
  if (switching) {
    res.cookies.set(SWITCH_COOKIE, "", clearCookieOptions(cfg));
    res.cookies.set(SIGNED_OUT_COOKIE, "", { ...clearCookieOptions(cfg), httpOnly: false });
  }
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
