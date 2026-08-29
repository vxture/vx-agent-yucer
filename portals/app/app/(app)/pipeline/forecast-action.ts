"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getPipelineStore } from "../../domains/shared/registry";
import { submitForecast } from "../../domains/pipeline/service";

// Submitting a forecast snapshot.
//
// `submitForecast` had existed with a full gate, a rule function and a store
// port since batch 2 and had ZERO non-test callers - not even a comment saying
// so, unlike the other unwired verbs. Nobody noticed because the surface it
// feeds fails quietly: `forecast_snapshot` stayed empty, so the trajectory
// rendered its empty state forever and `attainment()` had no numerator, and an
// empty chart looks like a new workspace rather than like a broken product.
// The demo seed hid it further by filling the table directly.
//
// WORKSPACE SCOPE, and only that, for now. It is the scope every other number
// is measured against, and the two territory/owner scopes need pickers that do
// not exist yet. Offering a scope selector that could only produce one value
// would be a control that lies about what it does.

export interface SubmitForecastResult {
  ok: boolean;
  /** The period the snapshot was taken for, echoed so the toast can name it. */
  period?: string;
  error?: string;
}

export async function submitForecastSnapshot(
  period: string,
): Promise<SubmitForecastResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await submitForecast(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPipelineStore(),
    },
    {
      period,
      // A workspace scope carries no territory and no owner - validateScope
      // rejects it if it does, which is why these are explicit nulls rather
      // than omitted.
      scope: { scopeType: "workspace", territoryId: null, ownerSub: null },
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }

  // The snapshot is append-only, so the page must re-read rather than patch:
  // what changed is that the series grew a point, and the series is what the
  // page renders.
  revalidatePath("/pipeline");
  return { ok: true, period: result.value.period };
}
