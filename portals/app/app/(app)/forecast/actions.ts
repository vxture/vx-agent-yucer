"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getPipelineStore } from "../../domains/shared/registry";
import { applyCategorySuggestion } from "../../domains/pipeline/service";

/**
 * File one deal where the rule would file it.
 *
 * IT SENDS ONLY AN ID. The first version accepted the category from the client
 * and, having checked it was a member of the enum, wrote it - so a page minutes
 * out of date could apply a suggestion that no longer existed, and a crafted
 * request could file a deal wherever it liked within the enum. `/renewal`
 * already re-derived its draft on apply for exactly this reason; this path did
 * not, which is one batch shipping two answers to one question.
 *
 * `applyCategorySuggestion` re-runs the rule against the row as it stands now
 * and refuses when there is nothing to apply. The write underneath is still
 * `updateCommercialTerms`, so `pipeline.forecast.categorize` and
 * `planCategoryChange` both still apply - no second door into that room.
 */
export async function applySuggestedCategory(input: {
  opportunityId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await applyCategorySuggestion(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.pipeline(),
    },
    input.opportunityId,
  );

  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };
  revalidatePath("/forecast");
  return { ok: true };
}
