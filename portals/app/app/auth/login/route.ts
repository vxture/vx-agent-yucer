import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { makePkce, randomToken } from "../lib/pkce";
import { putAuthState } from "../lib/session-store";
import { safeReturnTo } from "../lib/return-to";

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
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const silent = url.searchParams.get("silent") === "1";
  // A silent attempt is a round trip the visitor did not ask for: on a
  // deployment where sign-in is not configured, send them where they were
  // going rather than to an IdP error page.
  if (silent && (!cfg.enabled || !cfg.redirectUri)) {
    return NextResponse.redirect(new URL(returnTo, cfg.appOrigin || url.origin).toString());
  }

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
  // ?switch=1 is the header's 切换用户: OIDC core `prompt=login` makes the IdP
  // re-authenticate even though it still holds a session, so a different
  // person can sign in; the callback then replaces the RP session. Additive -
  // an ordinary login sends no prompt and behaves exactly as before.
  if (url.searchParams.get("switch") === "1") authorize.searchParams.set("prompt", "login");
  else if (silent) authorize.searchParams.set("prompt", "none");
  return NextResponse.redirect(authorize.toString());
}
