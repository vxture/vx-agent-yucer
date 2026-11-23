import { NextResponse } from "next/server";
import type { OidcConfig } from "./config";
import { getAuthUser } from "./session";
import type { AuthUser } from "./claims";
import type { ProductEntryState } from "../product-access";

export async function sessionResponse(
  cfg: OidcConfig, rpsid: string | undefined, forceCheck: boolean,
  resolve = getAuthUser,
  syncContext = false,
  readAccess?: (user: AuthUser) => Promise<{ state: ProductEntryState; revision?: string }>,
): Promise<NextResponse> {
  const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache" };
  try {
    const user = rpsid ? await resolve(cfg, rpsid, { activity: false, forceCheck, ...(syncContext ? { syncContext: true } : {}) }) : null;
    const access = user && readAccess ? await readAccess(user) : undefined;
    const response = NextResponse.json(user ? { authenticated: true, user, ...(access ? { productAccess: access.state, accessRevision: access.revision } : {}) } : { authenticated: false }, { headers });
    // This is an asynchronous probe. Its old response must never erase the
    // cookie installed by a newer sign-in in another tab. Only top-level
    // logout and the login callback may change the browser session pointer.
    return response;
  } catch {
    // Unknown is neither signed in nor signed out. Keep the cookie for retry.
    return NextResponse.json({ authenticated: null, code: "SESSION_STATUS_UNAVAILABLE", retryable: true }, {
      status: 503, headers: { ...headers, "Retry-After": "5" },
    });
  }
}
