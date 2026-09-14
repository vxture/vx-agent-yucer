"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { setPricingPolicy } from "../../domains/catalog/service";
import { getCatalogStore } from "../../domains/shared/registry";
import type { PricingPolicy } from "../../domains/catalog/lib/pricing-policy";

/* 计价货币的写入路径 (incr/0044, permission unified incr/0063).
 *
 * Gated on `pipeline.opportunityconfig.manage` inside the service - the one
 * permission for all six /admin/opportunity sections, not `catalog.price`
 * any more (that still gates the real price book's own entry upserts,
 * unchanged). Returns the violation CODE, never its sentence (TD-010).
 */
export async function savePricingPolicy(
  input: PricingPolicy,
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await setPricingPolicy(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getCatalogStore(),
    },
    input,
  );
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  // Everything that prices reads this row.
  revalidatePath("/pricebook");
  revalidatePath("/pipeline");
  return { ok: true };
}
