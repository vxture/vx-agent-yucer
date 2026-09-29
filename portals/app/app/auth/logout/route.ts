import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { deleteSession, getSession } from "../lib/session-store";
import { clearCookieOptions } from "../lib/cookie";
import { randomToken } from "../lib/pkce";
import { SIGNED_OUT_COOKIE, SIGNED_OUT_MAX_AGE_SECONDS } from "../lib/signed-out-marker";

// POST /auth/logout (080-rp section 2.2): destroy the local RP session + clear
// the cookie, then 302 to the IdP end_session endpoint to trigger global logout.
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const cfg = getOidcConfig();
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  // Read BEFORE deleting: the id_token is what tells accounts which login to end.
  const record = rpsid ? await getSession(cfg.clientId, rpsid).catch(() => null) : null;
  if (rpsid) await deleteSession(cfg.clientId, rpsid).catch(() => {});

  // LOGOUT IS GLOBAL (owner, 2026-09-29): it ends the ACCOUNTS login, not just
  // this product's record, so every product on this computer finds the login
  // over the next time it asks (auth/lib/login-state.ts). id_token_hint and
  // client_id let accounts end it without asking the member to confirm;
  // which of them the platform requires is vxture-platform#538's item 4.
  const endSession = new URL(cfg.endSessionUrl);
  if (record?.idToken) endSession.searchParams.set("id_token_hint", record.idToken);
  endSession.searchParams.set("client_id", cfg.clientId);
  if (cfg.postLogoutRedirectUri) {
    endSession.searchParams.set("post_logout_redirect_uri", cfg.postLogoutRedirectUri);
  }
  endSession.searchParams.set("state", randomToken(16));

  const res = NextResponse.redirect(endSession.toString());
  res.cookies.set(cfg.cookieName, "", clearCookieOptions(cfg));

  // The note to self, read when the IdP sends the browser back to the
  // registered post-logout URI - the product root, which is also the front
  // door. Without it a completed sign-out is answered with "sign in" and looks
  // like a failure (auth/lib/signed-out-marker.ts).
  //
  // NOT HttpOnly, and that is deliberate rather than an oversight: the
  // confirmation screen clears it from the client as it mounts, because a
  // layout cannot write a cookie. It carries no identity and grants nothing -
  // the value is the string "1" - so nothing is exposed by letting a script
  // read the one bit it already knows.
  res.cookies.set(SIGNED_OUT_COOKIE, "1", {
    httpOnly: false,
    secure: cfg.cookieName.startsWith("__Host-"),
    sameSite: "lax",
    path: "/",
    maxAge: SIGNED_OUT_MAX_AGE_SECONDS,
  });
  return res;
}
