"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { setAgeingCutoffs } from "../../domains/delivery/service";
import { getDeliveryStore } from "../../domains/shared/registry";

/* 账龄分档的写入路径 (incr/0042).
 *
 * Gated on `delivery.revenue.upsert` inside the service - when a receivable
 * counts as 60 days late is the money side, not the project side. Returns the
 * violation CODE, never its sentence (TD-010).
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
  revalidatePath("/admin/ageing");
  // The collections chart is cut by these, so it must not keep the old bands.
  revalidatePath("/collection");
  return { ok: true };
}
