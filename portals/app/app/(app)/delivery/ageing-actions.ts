"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { setAgeingCutoffs } from "../../domains/delivery/service";
import { getDeliveryStore } from "../../domains/shared/registry";

/* 账龄分档的写入路径 (incr/0042, permission unified incr/0063).
 *
 * Gated on `pipeline.opportunityconfig.manage` inside the service - the one
 * permission for all six /admin/opportunity sections, not
 * `delivery.revenue.upsert` any more (that still gates /collection's own
 * writes, unchanged). Returns the violation CODE, never its sentence
 * (TD-010).
 */
export async function saveAgeingCutoffs(
  cutoffs: readonly number[],
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await setAgeingCutoffs(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getDeliveryStore(),
    },
    cutoffs,
  );
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  // The collections chart is cut by these, so it must not keep the old bands.
  revalidatePath("/collection");
  return { ok: true };
}
