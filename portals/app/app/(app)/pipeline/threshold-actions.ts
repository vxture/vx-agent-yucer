"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { setForecastThresholds } from "../../domains/pipeline/service";
import type { ForecastThresholds } from "../../domains/pipeline/lib/forecast-rule";

/* 预测阈值的写入路径 (incr/0041, permission unified incr/0063).
 *
 * Gated on `pipeline.opportunityconfig.manage` inside the service - the one
 * permission for all six /admin/opportunity sections, not
 * `pipeline.forecast.categorize` any more (that still gates applying a
 * forecast-category suggestion on /forecast and /pipeline/[id], unchanged).
 * Returns the violation CODE, never its sentence (TD-010).
 */
export async function saveForecastThresholds(
  input: ForecastThresholds,
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const r = await setForecastThresholds(
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
  // The review page reads the same numbers, so it must not keep the old ones.
  revalidatePath("/forecast");
  return { ok: true };
}
