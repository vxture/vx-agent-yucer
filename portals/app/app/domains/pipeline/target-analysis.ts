import { can } from "../../authz/decide";
import { canReadReportingScope } from "../../authz/forecast-scope";
import type { DataScope } from "../../authz/scope";
import type { AccountStore } from "../account/store";
import { listAccounts } from "../account/service";
import { readCooperationHistory } from "../account/cooperation-service";
import { listTargets, type PlanningContext } from "../planning/service";
import { readAttainmentPlans } from "../planning/attainment-plan";
import type { SalesPlanStore } from "../planning/plan-store";
import type { PipelineStore } from "./store";
import { listPipeline } from "./service";
import {
  analysisRow,
  serializeAnalysisDeal,
  verifiedNewLogos,
  type MetricFact,
} from "./lib/attainment-analysis";

/** Controlled assistant reads use the page's D6 facts, never legacy forecast snapshots.
 * No request timestamp is returned: identical facts have identical source hashes. */
export async function readTargetAnalysis(
  ctx: PlanningContext & {
    scope: DataScope;
    plans: SalesPlanStore;
    pipeline: PipelineStore;
    accounts: AccountStore;
  },
  year?: number,
) {
  const targets = await listTargets(ctx);
  if (!targets.ok) throw new Error("permission_denied");
  const rows = targets.value.filter(
    (t) =>
      t.status !== "draft" &&
      canReadReportingScope(ctx.scope, t, ctx.sub) &&
      (year === undefined ||
        Number(t.period.replace(/^Y/, "").slice(0, 4)) === year),
  );
  if (
    !can(ctx.holder, ctx.entitlement, "planning.attainment.view", "data")
      .allowed
  )
    return rows.map((t) => ({ ...t, analysis: null }));
  const [plans, pipeline, accounts, history] = await Promise.all([
    readAttainmentPlans({ ...ctx, store: ctx.plans, targets: ctx.store }).catch(
      () => null,
    ),
    listPipeline(
      { ...ctx, store: ctx.pipeline },
      { includeClosed: true },
    ).catch(() => null),
    listAccounts({ ...ctx, store: ctx.accounts }).catch(() => null),
    readCooperationHistory({ ...ctx, store: ctx.accounts }).catch(() => null),
  ]);
  const metricTargets = plans?.flatMap((p) => p.metricTargets ?? []) ?? [];
  const deals = pipeline?.ok ? pipeline.value.map(serializeAnalysisDeal) : null;
  const observedAt = new Date().toISOString();
  return rows.map((t) => {
    const scope =
      t.scopeType === "workspace"
        ? "workspace"
        : t.scopeType === "territory"
          ? `territory:${t.territoryId}`
          : `owner:${t.ownerSub}`;
    const period = /^\d{4}$/.test(t.period) ? `Y${t.period}` : t.period;
    const currency =
      t.targetValue.unit === "money" ? t.targetValue.currency : "CNY";
    const row = analysisRow({
      scope,
      name: "",
      period,
      currency,
      targets: metricTargets,
      deals,
      observedAt,
      unavailable: can(ctx.holder, ctx.entitlement, "pipeline.view", "data")
        .allowed
        ? "failed"
        : "denied",
    });
    const actual: MetricFact =
      t.metric === "revenue"
        ? row.closed
        : t.metric === "pipeline"
          ? row.open
          : t.metric === "new_logo"
            ? accounts?.ok
              ? verifiedNewLogos(
                  history?.ok ? history.value : null,
                  accounts.value,
                  scope,
                  period,
                  ctx.scope.kind === "workspace",
                )
              : {
                  value: null,
                  state: can(
                    ctx.holder,
                    ctx.entitlement,
                    "account.view",
                    "data",
                  ).allowed
                    ? "failed"
                    : "denied",
                  missing: 0,
                }
            : { value: null, state: "unknown", missing: 0 };
    const target =
      metricTargets.find(
        (m) =>
          m.scope === scope &&
          m.period === period &&
          m.metric === t.metric &&
          m.currency ===
            (t.targetValue.unit === "money" ? t.targetValue.currency : null),
      ) ?? null;
    return {
      ...t,
      analysis: {
        period,
        scope,
        currency: t.targetValue.unit === "money" ? currency : null,
        actual,
        target,
        difference:
          actual.value === null
            ? null
            : Math.round((actual.value - t.targetValue.amount) * 100) / 100,
        rate:
          actual.value !== null && t.targetValue.amount > 0
            ? actual.value / t.targetValue.amount
            : null,
        revenue: {
          closed: row.closed,
          open: row.open,
          coverage: row.coverage,
          undated: row.undated,
          pending: row.pending,
        },
      },
    };
  });
}
