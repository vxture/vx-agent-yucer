"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getPipelineStore } from "../../domains/shared/registry";
import { submitForecast } from "../../domains/pipeline/service";
import { parseForecastScope } from "../lib/forecast-scope";

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
// ALL THREE SCOPES, since the owner's ruling of 2026-09-01. This comment used
// to say workspace only, "for want of pickers that do not exist yet" - they
// exist now, and the domain had supported the other two since batch 1.
//
// THE SCOPE ARRIVES AS THE URL'S STRING and is parsed here, on the server. A
// client that could hand over a ForecastScope object could hand over one the
// three-way validateScope rejects, or worse one it accepts and nobody meant -
// a territory scope carrying an owner. Parsing a single opaque token into the
// shape the domain demands keeps that impossible.

export interface SubmitForecastResult {
  ok: boolean;
  /** The period the snapshot was taken for, echoed so the toast can name it. */
  period?: string;
  error?: string;
}

export async function submitForecastSnapshot(
  period: string,
  scopeKey?: string,
): Promise<SubmitForecastResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };

  const result = await submitForecast(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: session.stores.pipeline(),
    },
    {
      period,
      // parseForecastScope always yields exactly one of the three shapes, with
      // the other id null - validateScope rejects a scope that carries both,
      // which is why this goes through the parser rather than being assembled
      // from separate params that could disagree.
      scope: parseForecastScope(scopeKey),
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
