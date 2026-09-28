import { NextResponse, type NextRequest } from "next/server";
import { shouldTrySilentSso, ssoAttemptCookieName, ssoAttemptCookieOptions } from "./app/auth/lib/sso";
import { SIGNED_OUT_COOKIE } from "./app/auth/lib/signed-out-marker";
import { getOidcConfig } from "./app/auth/lib/config";

/**
 * Silent SSO (auth/lib/sso.ts): a page visit with no session cookie is sent
 * through `/auth/login?silent=1` once, so somebody already signed in at the
 * platform lands on the page they opened instead of the front door. Nobody
 * signed in sees one invisible round trip and then the door, as before.
 *
 * A CHEAP check on purpose - the presence of a cookie, nothing more. The edge
 * runtime has no session store, and this is not a security boundary: the
 * layout still resolves the session properly, and a forged cookie only buys
 * the visitor the front door.
 */

export function middleware(req: NextRequest): NextResponse {
  // config.ts imports nothing, so it is edge-safe - and reading it here keeps
  // the cookie name and the origin from drifting away from the routes'.
  const cfg = getOidcConfig();
  const cookieName = cfg.cookieName;
  const markerName = ssoAttemptCookieName(cookieName);
  const go = shouldTrySilentSso({
    method: req.method,
    pathname: req.nextUrl.pathname,
    enabled: cfg.enabled,
    hasSession: req.cookies.has(cookieName),
    triedRecently: req.cookies.has(markerName),
    justSignedOut: req.cookies.get(SIGNED_OUT_COOKIE)?.value === "1",
    fetchMode: req.headers.get("sec-fetch-mode"),
    // Next strips its own RSC headers before middleware, so a browser fetch is
    // excluded by Sec-Fetch-Mode above; these catch whatever still carries them.
    isRscOrPrefetch: req.headers.has("rsc") || req.headers.has("next-router-prefetch") || req.headers.get("purpose") === "prefetch",
  });
  if (!go) return NextResponse.next();

  // Anchored to the configured origin, not req.url: behind the reverse proxy
  // the request URL can carry the container's own host.
  const login = new URL("/auth/login", cfg.appOrigin || req.url);
  login.searchParams.set("silent", "1");
  // Re-validated by safeReturnTo on the login route - never an open redirect.
  login.searchParams.set("returnTo", `${req.nextUrl.pathname}${req.nextUrl.search}`);
  const res = NextResponse.redirect(login);
  // Set on the redirect that STARTS the attempt, so it cannot loop.
  res.cookies.set(markerName, "1", ssoAttemptCookieOptions(cookieName));
  return res;
}

export const config = {
  // Pages only; shouldTrySilentSso repeats the exclusions so the rule is tested.
  matcher: ["/((?!auth/|api/|_next/static|_next/image|favicon.ico|assets/).*)"],
};
