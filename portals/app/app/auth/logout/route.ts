import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { deleteSession } from "../lib/session-store";
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
  if (rpsid) await deleteSession(cfg.clientId, rpsid).catch(() => {});

  const endSession = new URL(cfg.endSessionUrl);
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
