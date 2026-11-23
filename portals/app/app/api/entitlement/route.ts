import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthUser } from "../../auth/lib/session";
import { resolveProductEntryAccess } from "../../auth/product-access";
import { hasProductAccess, hasDataAccess, ctaFor } from "../../entitlement/types";

// GET /api/entitlement (C2 verification channel): resolve the current session's
// workspace entitlement and expose the gate outcomes. Read-only; never returns
// the platform secret. Works offline via the Mock resolver.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const cfg = getOidcConfig();
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  const user = rpsid ? await getAuthUser(cfg, rpsid).catch(() => null) : null;
  if (!user || !user.activeWorkspace) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const access = await resolveProductEntryAccess(user, true);
  const headers = { "Cache-Control": "private, no-store" };
  if (access.state === "unavailable") return NextResponse.json({ code: "PRODUCT_ACCESS_UNAVAILABLE", retryable: true }, { status: 503, headers });
  if (access.state === "unassigned" || access.state === "no-roles") return NextResponse.json({ code: "PRODUCT_ACCESS_REQUIRED", productAccess: access.state }, { status: 403, headers });
  const entitlement = access.entitlement!;
  return NextResponse.json({
    entitlement,
    productAccess: access.state,
    gates: {
      productAccess: hasProductAccess(entitlement),
      dataAccess: hasDataAccess(entitlement),
      cta: ctaFor(entitlement),
    },
  }, { headers });
}
