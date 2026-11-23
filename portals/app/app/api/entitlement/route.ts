import { cookies } from "next/headers";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthUser } from "../../auth/lib/session";
import { resolveProductEntryAccess } from "../../auth/product-access";
import { entitlementResponse } from "./handler";

// GET /api/entitlement (C2 verification channel): resolve the current session's
// workspace entitlement and expose the gate outcomes. Read-only; never returns
// the platform secret. Works offline via the Mock resolver.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return entitlementResponse(async () => {
    const cfg = getOidcConfig();
    const jar = await cookies();
    const rpsid = jar.get(cfg.cookieName)?.value;
    return rpsid ? getAuthUser(cfg, rpsid) : null;
  }, user => resolveProductEntryAccess(user, true, undefined, { initialize: false }));
}
