import { NextResponse } from "next/server";
import type { OidcConfig } from "./config";
import { clearCookieOptions } from "./cookie";
import { deleteSession, getSession } from "./session-store";
import { randomToken } from "./pkce";
import { SIGNED_OUT_COOKIE, SIGNED_OUT_MAX_AGE_SECONDS } from "./signed-out-marker";
import { ssoAttemptCookieName, ssoAttemptCookieOptions } from "./sso";
import { safeReturnTo } from "./return-to";

export const SWITCH_COOKIE = "vx_account_switch";

/** Browser navigation is essential: only it carries Accounts' session cookie.
 * 303 converts the product POST into the supported Accounts GET. */
export async function logoutResponse(
  cfg: OidcConfig,
  rpsid: string | undefined,
  switchTo?: string,
  deps = { getSession, deleteSession },
): Promise<NextResponse> {
  const record = rpsid ? await deps.getSession(cfg.clientId, rpsid).catch(() => null) : null;
  // Clear the browser pointer even if Redis is temporarily unreachable. The
  // central logout and retryable back-channel notification still revoke the sid.
  if (rpsid) await deps.deleteSession(cfg.clientId, rpsid).catch(() => undefined);
  const endSession = new URL(cfg.endSessionUrl);
  if (record?.idToken) endSession.searchParams.set("id_token_hint", record.idToken);
  endSession.searchParams.set("client_id", cfg.clientId);
  if (cfg.postLogoutRedirectUri) endSession.searchParams.set("post_logout_redirect_uri", cfg.postLogoutRedirectUri);
  endSession.searchParams.set("state", randomToken(16));
  const res = NextResponse.redirect(endSession.toString(), 303);
  res.headers.set("Cache-Control", "private, no-store");
  res.cookies.set(cfg.cookieName, "", clearCookieOptions(cfg));
  res.cookies.set(SIGNED_OUT_COOKIE, "1", {
    httpOnly: false, secure: cfg.cookieName.startsWith("__Host-"),
    sameSite: "lax", path: "/", maxAge: SIGNED_OUT_MAX_AGE_SECONDS,
  });
  // Prevent silent SSO before a switch has completed its central logout hop.
  res.cookies.set(ssoAttemptCookieName(cfg.cookieName), "1", ssoAttemptCookieOptions(cfg.cookieName));
  res.cookies.set(SWITCH_COOKIE, switchTo === undefined ? "" : safeReturnTo(switchTo), {
    httpOnly: true, secure: cfg.cookieName.startsWith("__Host-"),
    sameSite: "lax", path: "/", maxAge: switchTo === undefined ? 0 : 600,
  });
  return res;
}
