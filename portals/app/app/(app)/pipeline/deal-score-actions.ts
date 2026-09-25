"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { setDealScoreWeights } from "../../domains/pipeline/service";
import type { DealScoreWeights } from "../../domains/pipeline/lib/deal-score";

/* 商机评估分's weights (incr/0091). Gated on pipeline.opportunityconfig.manage
 * inside the service, like every /admin/opportunity section. Returns the
 * violation CODE, never its sentence (TD-010). */
export async function saveDealScoreWeights(input: DealScoreWeights): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await setDealScoreWeights(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.pipeline(),
    },
    input,
  );
  if (!r.ok) return { ok: false, error: r.violations[0]?.code ?? "denied" };
  revalidatePath("/admin/opportunity");
  // Every deal page's score moves with the weights.
  revalidatePath("/pipeline", "layout");
  return { ok: true };
}
