import { NextResponse } from "next/server";
import type { OidcConfig } from "./config";
import { getAuthUser } from "./session";
import { clearCookieOptions } from "./cookie";

export async function sessionResponse(
  cfg: OidcConfig, rpsid: string | undefined, forceCheck: boolean,
  resolve = getAuthUser,
): Promise<NextResponse> {
  const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache" };
  try {
    const user = rpsid ? await resolve(cfg, rpsid, { activity: false, forceCheck }) : null;
    const response = NextResponse.json(user ? { authenticated: true, user } : { authenticated: false }, { headers });
    if (!user && rpsid) response.cookies.set(cfg.cookieName, "", clearCookieOptions(cfg));
    return response;
  } catch {
    // Unknown is neither signed in nor signed out. Keep the cookie for retry.
    return NextResponse.json({ authenticated: null, code: "SESSION_STATUS_UNAVAILABLE", retryable: true }, {
      status: 503, headers: { ...headers, "Retry-After": "5" },
    });
  }
}
