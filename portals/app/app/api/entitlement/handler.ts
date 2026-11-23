import type { AuthUser } from "../../auth/lib/claims";
import type { ProductEntryAccess } from "../../auth/product-access";
import { hasProductAccess, hasDataAccess, ctaFor } from "../../entitlement/types";

// Unknown authority is retryable. It must never be presented as a confirmed
// missing identity, or erase the browser's existing session pointer.
export async function entitlementResponse(
  identity: () => Promise<AuthUser | null>,
  authority: (user: AuthUser) => Promise<ProductEntryAccess>,
): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  const unavailable = () => Response.json(
    { code: "PRODUCT_ACCESS_UNAVAILABLE", retryable: true },
    { status: 503, headers: { ...headers, "Retry-After": "5" } },
  );
  try {
    const user = await identity();
    if (!user?.activeWorkspace)
      return Response.json({ authenticated: false }, { status: 401, headers });
    const access = await authority(user);
    if (access.state === "unavailable") return unavailable();
    if (access.state === "unassigned" || access.state === "no-roles")
      return Response.json(
        { code: "PRODUCT_ACCESS_REQUIRED", productAccess: access.state },
        { status: 403, headers },
      );
    const entitlement = access.entitlement!;
    return Response.json({
      entitlement,
      productAccess: access.state,
      gates: {
        productAccess: hasProductAccess(entitlement),
        dataAccess: hasDataAccess(entitlement),
        cta: ctaFor(entitlement),
      },
    }, { headers });
  } catch {
    return unavailable();
  }
}
