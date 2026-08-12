import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { getAuthUser } from "../lib/session";

// GET /auth/session (080-rp section 2.2): read the cookie, resolve the RP session
// (silent-refreshing a near-expiry access token), return the bootstrap claims.
// Never returns tokens to the browser. Anonymous is a 200 with authenticated:false.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const cfg = getOidcConfig();
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  if (!rpsid) return NextResponse.json({ authenticated: false });

  const user = await getAuthUser(cfg, rpsid).catch(() => null);
  if (!user) return NextResponse.json({ authenticated: false });

  // account_status gate (080-rp section 2.6): non-active is treated as no session.
  if (user.accountStatus && user.accountStatus !== "active") {
    return NextResponse.json({ authenticated: false, reason: "account_inactive" });
  }
  return NextResponse.json({ authenticated: true, user });
}
