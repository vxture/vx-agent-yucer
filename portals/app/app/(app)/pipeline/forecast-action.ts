"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession, type AppSession } from "../lib/session";
import { can } from "../../authz/decide";
import { canReadReportingScope } from "../../authz/forecast-scope";
import {
  getCatalogStore,
  getPlanningStore,
  getSalesPlanStore,
} from "../../domains/shared/registry";
import { resolveForecastTargetBasis } from "../../domains/planning/effective-targets";
import { submitForecast } from "../../domains/pipeline/service";
import {
  planSnapshot,
  reportedRevenueBasis,
} from "../../domains/pipeline/lib/forecast";
import { forecastScopeKey, parseForecastScope } from "../lib/forecast-scope";
import { normalizeAttainmentPeriod } from "../lib/attainment-workspace";
import {
  confirmationFingerprint,
  confirmationMatches,
  createForecastConfirmation,
  sameForecastCall,
  type ForecastConfirmationView,
} from "../lib/forecast-confirmation";
import {
  getForecastConfirmation,
  putForecastConfirmation,
} from "../lib/forecast-confirmation-store";

export interface SubmitForecastResult {
  ok: boolean;
  period?: string;
  error?: string;
}

function allowed(session: AppSession, scopeKey: string) {
  return (
    forecastScopeKey(parseForecastScope(scopeKey)) === scopeKey &&
    canReadReportingScope(
      session.scope,
      parseForecastScope(scopeKey),
      session.user.sub,
    ) &&
    can(session.authz, session.entitlement, "pipeline.forecast.view", "data")
      .allowed &&
    can(
      session.authz,
      session.entitlement,
      "pipeline.forecast.snapshot",
      "data",
    ).allowed
  );
}

async function readSubmission(
  session: AppSession,
  period: string,
  scopeKey: string,
) {
  const scope = parseForecastScope(scopeKey);
  const policy = await getCatalogStore().getPricingPolicy(session.workspaceId);
  const [opportunities, basis] = await Promise.all([
    session.stores
      .pipeline()
      .listOpportunities(session.workspaceId, { includeClosed: true }),
    resolveForecastTargetBasis(
      getPlanningStore(),
      getSalesPlanStore(),
      session.workspaceId,
      { period, ...scope },
      policy.defaultCurrency,
    ),
  ]);
  const snapshot = planSnapshot({
    period,
    scope,
    currency: policy.defaultCurrency,
    opportunities,
  });
  return { snapshot, basis, currency: policy.defaultCurrency };
}

export async function prepareForecastSnapshot(
  period: string,
  scopeKey: string,
): Promise<
  | { ok: true; confirmation: ForecastConfirmationView }
  | { ok: false; error: string }
> {
  const session = await resolveAppSession();
  if (!session || !allowed(session, scopeKey))
    return { ok: false, error: "confirmation_denied" };
  try {
    period = normalizeAttainmentPeriod(period);
    const { snapshot, basis, currency } = await readSubmission(
      session,
      period,
      scopeKey,
    );
    if (!snapshot.ok)
      return {
        ok: false,
        error: snapshot.violations[0]?.code ?? "confirmation_failed",
      };
    const totals = {
      commitAmount: snapshot.value.commitAmount,
      bestCaseAmount: snapshot.value.bestCaseAmount,
      pipelineAmount: snapshot.value.pipelineAmount,
      closedAmount: snapshot.value.closedAmount,
      newLogoCount: snapshot.value.newLogoCount,
    };
    const confirmation = createForecastConfirmation({
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      period,
      scopeKey,
      currency,
      totals,
      basis,
      observedAt: snapshot.value.snapshotAt.toISOString(),
    });
    await putForecastConfirmation(confirmation);
    const visibleBasis = can(
      session.authz,
      session.entitlement,
      "planning.target.view",
      "data",
    ).allowed
      ? reportedRevenueBasis(basis)
      : null;
    return {
      ok: true,
      confirmation: {
        token: confirmation.token,
        period,
        scopeKey,
        observedAt: confirmation.observedAt,
        currency,
        totals,
        basis: visibleBasis,
      },
    };
  } catch {
    return { ok: false, error: "confirmation_failed" };
  }
}

export async function submitForecastSnapshot(
  period: string,
  scopeKey = "workspace",
  call?: { amount?: number | null; note?: string | null },
  token?: string,
): Promise<SubmitForecastResult> {
  const session = await resolveAppSession();
  if (!session || !allowed(session, scopeKey))
    return { ok: false, error: "confirmation_denied" };
  if (
    !token ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      token,
    )
  )
    return { ok: false, error: "confirmation_expired" };
  period = normalizeAttainmentPeriod(period);
  const scope = parseForecastScope(scopeKey);
  const findExisting = async () =>
    (
      await session.stores
        .pipeline()
        .listForecastSnapshots(session.workspaceId, {
          period,
          scopeType: scope.scopeType,
        })
    ).find(
      (s) =>
        s.id === token &&
        s.territoryId === scope.territoryId &&
        s.ownerSub === scope.ownerSub &&
        s.submittedBySub === session.user.sub,
    );
  const refresh = () => {
    revalidatePath("/pipeline");
    revalidatePath("/forecast");
    revalidatePath("/attainment");
  };
  try {
    // Check durable identity before expiry/current values: a lost response must
    // still acknowledge its original write after targets or deals have changed.
    const existing = await findExisting();
    if (existing) {
      if (!sameForecastCall(existing, call))
        return { ok: false, error: "confirmation_conflict" };
      refresh();
      return { ok: true, period };
    }
    const confirmation = await getForecastConfirmation(token);
    if (
      !confirmation ||
      !confirmationMatches(confirmation, {
        workspaceId: session.workspaceId,
        sub: session.user.sub,
        period,
        scopeKey,
      })
    )
      return { ok: false, error: "confirmation_expired" };
    const current = await readSubmission(session, period, scopeKey);
    if (!current.snapshot.ok)
      return {
        ok: false,
        error: current.snapshot.violations[0]?.code ?? "confirmation_failed",
      };
    if (
      confirmationFingerprint(current.snapshot.value, current.basis) !==
      confirmation.fingerprint
    )
      return { ok: false, error: "confirmation_changed" };
    const result = await submitForecast(
      {
        workspaceId: session.workspaceId,
        sub: session.user.sub,
        holder: session.authz,
        entitlement: session.entitlement,
        store: session.stores.pipeline(),
        catalog: getCatalogStore(),
      },
      {
        period,
        currency: confirmation.currency,
        scope,
        call,
        snapshotId: token,
        targetBasis: confirmation.basis,
        confirmedTotals: confirmation.totals,
      },
    );
    if (!result.ok)
      return {
        ok: false,
        error: result.violations[0]?.code ?? "confirmation_failed",
      };
    refresh();
    return { ok: true, period: result.value.period };
  } catch {
    // A concurrent retry may have committed first. The PK and target-basis
    // transaction are the database guard; never turn this into an UPDATE.
    try {
      const existing = await findExisting();
      if (existing) {
        if (!sameForecastCall(existing, call))
          return { ok: false, error: "confirmation_conflict" };
        refresh();
        return { ok: true, period };
      }
    } catch {
      /* The original confirmation is retained for a safe retry. */
    }
    return { ok: false, error: "confirmation_failed" };
  }
}
