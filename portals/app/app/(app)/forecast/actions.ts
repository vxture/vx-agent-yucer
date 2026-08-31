"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getPipelineStore } from "../../domains/shared/registry";
import { updateCommercialTerms } from "../../domains/pipeline/service";
import { isForecastCategory } from "../../domains/pipeline/lib/forecast";

/**
 * File one deal where the rule would file it.
 *
 * NO NEW WRITE VERB. This goes through `updateCommercialTerms`, which is where
 * a forecast category has always been changed and which already carries the
 * gate that matters: `pipeline.forecast.categorize`, a pro-tier capability the
 * catalog deliberately withholds from a rep who has `pipeline.write`. Adding a
 * verb here so the button had "its own" path would be a second door into a room
 * the product locked on purpose.
 *
 * It also means `planCategoryChange` still runs. A suggestion cannot walk a
 * deal into `closed` on an open stage, whatever the page thought it was
 * sending.
 *
 * THE CATEGORY IS VALIDATED, not trusted. The client sends a string; a crafted
 * request must not reach the store with something the enum does not contain.
 */
export async function applySuggestedCategory(input: {
  opportunityId: string;
  forecastCategory: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  if (!isForecastCategory(input.forecastCategory)) {
    return { ok: false, error: "unknown_forecast_category" };
  }

  const result = await updateCommercialTerms(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPipelineStore(),
    },
    input.opportunityId,
    { forecastCategory: input.forecastCategory },
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/forecast");
  return { ok: true };
}
