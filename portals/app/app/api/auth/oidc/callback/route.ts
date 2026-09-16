import { NextResponse } from "next/server";
import { getOidcConfig } from "../../../../auth/lib/config";
import { exchangeCode, verifyToken } from "../../../../auth/lib/oidc";
import { takeAuthState, putSession, type RpSession } from "../../../../auth/lib/session-store";
import { sessionCookieOptions } from "../../../../auth/lib/cookie";
import { randomToken } from "../../../../auth/lib/pkce";

// GET /api/auth/oidc/callback (080-rp section 2.3/2.5) - the redirect_uri the
// platform REGISTERED for the `yucer` OIDC client (platform handoff,
// 2026-09-14).
//
// X-4 THREE-STEP MIGRATION, COMPLETE. This repo carried a legacy alias at
// /auth/callback during the platform's registration switch: (1) this path
// shipped as a re-export of that handler and both were live, (2) the
// platform's registration already pointed here from the 2026-09-14 handoff,
// (3) the legacy route is removed - this file is now the only implementation,
// not a re-export of one living elsewhere. The old /auth/callback path
// answers 404.
//
// Consume the single-use state, exchange the code, verify id_token (nonce) +
// access_token, assert matching sub, create the RP session, set the opaque
// cookie, 302 to returnTo.
export const dynamic = "force-dynamic";

function reject(msg: string): Response {
  // Do not echo untrusted input; a generic 400 avoids oracle/redirect abuse.
  return new NextResponse(`auth callback rejected: ${msg}`, { status: 400 });
}

export async function GET(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return reject("missing code/state");

  const authState = await takeAuthState(cfg.clientId, state);
  if (!authState) return reject("unknown or replayed state");

  let tokens;
  try {
    tokens = await exchangeCode(cfg, code, authState.verifier);
  } catch {
    return reject("code exchange failed");
  }
  if (!tokens.id_token) return reject("no id_token");

  let idClaims;
  try {
    idClaims = await verifyToken(tokens.id_token, cfg);
  } catch {
    return reject("id_token invalid");
  }
  if (idClaims.nonce !== authState.nonce) return reject("nonce mismatch");

  let accessClaims;
  try {
    accessClaims = await verifyToken(tokens.access_token, cfg);
  } catch {
    return reject("access_token invalid");
  }
  if (accessClaims.sub !== idClaims.sub) return reject("sub mismatch");

  const rpsid = randomToken();
  const session: RpSession = {
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessExpiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 300),
    sid: typeof idClaims.sid === "string" ? idClaims.sid : undefined,
    sub: String(idClaims.sub),
  };
  await putSession(cfg.clientId, rpsid, session, cfg.sessionTtlSeconds);

  // returnTo is a whitelisted relative path; anchor it to the app origin.
  const dest = new URL(authState.returnTo, cfg.appOrigin || url.origin);
  const res = NextResponse.redirect(dest.toString());
  res.cookies.set(cfg.cookieName, rpsid, sessionCookieOptions(cfg));
  return res;
}
