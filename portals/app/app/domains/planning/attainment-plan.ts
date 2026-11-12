import { can } from "../../authz/decide";
import { canReadReportingScope } from "../../authz/forecast-scope";
import { readEffectiveTargetSnapshot } from "./effective-targets";
import {
  demand,
  planVersions,
  type PlanContent,
  type PlanRevision,
} from "./plan-model";
import type { SalesPlanContext } from "./plan-service";
import type { PlanningStore } from "./store";

export type AttainmentRevision = {
  id: string;
  version: number;
  effectiveAt: string;
};
export type AttainmentTarget = {
  key: string;
  period: string;
  scope: string;
  currency: string;
  floor: number | null;
  target: number;
  stretch: number | null;
  baseline: number | null;
  baselineComparable: boolean;
  source: "sales_plan" | "legacy";
  revision: AttainmentRevision | null;
};
export type AttainmentPlan = {
  year: number;
  observedAt: string;
  current: AttainmentRevision | null;
  baseline: AttainmentRevision | null;
  scheduled: AttainmentRevision | null;
  historical: AttainmentRevision[];
  targets: AttainmentTarget[];
  regions: {
    id: string;
    name: string;
    provinces: string[];
    included: boolean;
  }[];
  support: Pick<PlanContent, "budgets" | "contributions" | "team" | "actions">;
  supportRestricted: boolean;
};
const normalized = (period: string) =>
  /^Y?\d{4}$/.test(period) ? `Y${period.replace(/^Y/, "")}` : period;

// Return a projection, never the complete company revision to a regional user.
export async function readAttainmentPlan(
  ctx: SalesPlanContext & { targets: PlanningStore },
  year: number,
): Promise<AttainmentPlan> {
  return (await readAttainmentPlans(ctx, year))[0];
}

export async function readAttainmentPlans(
  ctx: SalesPlanContext & { targets: PlanningStore },
  requestedYear?: number,
): Promise<AttainmentPlan[]> {
  demand(
    can(ctx.holder, ctx.entitlement, "planning.attainment.view", "data")
      .allowed &&
      can(ctx.holder, ctx.entitlement, "planning.target.view", "data").allowed,
    "plan_denied",
  );
  const observedAt = (ctx.now?.() ?? new Date()).toISOString();
  const { targets, plans } = await readEffectiveTargetSnapshot(
    ctx.targets,
    ctx.store,
    ctx.workspaceId,
    observedAt,
  );
  const periodYear = (p: string) =>
    /^(?:Y)?(\d{4})(?:$|Q[1-4]$|-(?:0[1-9]|1[0-2])$)/.exec(p)?.[1];
  const visibleTargets = targets.filter(
    (t) =>
      t.metric === "revenue" &&
      t.status !== "draft" &&
      canReadReportingScope(ctx.scope, t, ctx.sub),
  );
  const years =
    requestedYear === undefined
      ? [
          ...new Set([
            Number(observedAt.slice(0, 4)),
            ...visibleTargets
              .map((t) => Number(periodYear(t.period)))
              .filter(Number.isInteger),
            ...(ctx.scope.kind === "workspace" ? plans.map((p) => p.year) : []),
          ]),
        ].sort((a, b) => b - a)
      : [requestedYear];
  const customers =
    ctx.scope.kind === "workspace" &&
    can(ctx.holder, ctx.entitlement, "account.view", "data").allowed;
  const people =
    ctx.scope.kind === "workspace" &&
    can(ctx.holder, ctx.entitlement, "admin.member.view", "data").allowed;
  return years.map((year) => {
    const plan = plans.find((p) => p.year === year);
    const state = plan ? planVersions(plan, observedAt) : null;
    const revision = (r: PlanRevision | null): AttainmentRevision | null => {
      if (!r) return null;
      const release = plan!.events.find(
        (e) => e.kind === "release" && e.revisionId === r.id,
      );
      return {
        id: r.id,
        version: r.version!,
        effectiveAt: release!.effectiveAt,
      };
    };
    const current = revision(state?.current ?? null);
    const content = state?.current?.content;
    const baselineContent = state?.baseline?.content;
    const rows: AttainmentTarget[] = visibleTargets.flatMap((t) => {
      if (
        t.targetValue.unit !== "money" ||
        periodYear(t.period) !== String(year)
      )
        return [];
      const scope =
        t.scopeType === "workspace"
          ? "workspace"
          : t.scopeType === "territory"
            ? `territory:${t.territoryId}`
            : `owner:${t.ownerSub}`;
      const line = content?.targets.find(
        (l) =>
          l.metric === "revenue" &&
          l.scope === scope &&
          l.period === normalized(t.period) &&
          l.currency ===
            (t.targetValue.unit === "money" ? t.targetValue.currency : null),
      );
      const base = baselineContent?.targets.find(
        (l) =>
          l.metric === "revenue" &&
          l.scope === scope &&
          l.period === normalized(t.period) &&
          l.currency === line?.currency,
      );
      const boundary = (c: PlanContent | undefined) =>
        c?.regions
          .filter((r) => scope === "workspace" || scope === `territory:${r.id}`)
          .map((r) => [r.id, [...r.provinces].sort((a, b) => a.localeCompare(b))])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      return [
        {
          key: line?.key ?? t.id,
          period: normalized(t.period),
          scope,
          currency: t.targetValue.currency,
          target: t.targetValue.amount,
          floor: line?.floor == null ? null : Number(line.floor),
          stretch: line?.stretch == null ? null : Number(line.stretch),
          baseline: base?.target == null ? null : Number(base.target),
          baselineComparable:
            JSON.stringify(boundary(content)) ===
            JSON.stringify(boundary(baselineContent)),
          source: line && t.managedBySalesPlan ? "sales_plan" : "legacy",
          revision: line && t.managedBySalesPlan ? current : null,
        },
      ];
    });
    const regions = (content?.regions ?? []).filter((r) =>
      canReadReportingScope(
        ctx.scope,
        { scopeType: "territory", territoryId: r.id, ownerSub: null },
        ctx.sub,
      ),
    );
    // Full supporting budgets/personnel currently require the same complete-release
    // access as planning. A scoped target reader receives no hidden support counts.
    return {
      year,
      observedAt,
      current: ctx.scope.kind === "own" ? null : current,
      baseline:
        ctx.scope.kind === "own" ? null : revision(state?.baseline ?? null),
      scheduled:
        ctx.scope.kind === "own" ? null : revision(state?.scheduled ?? null),
      historical:
        ctx.scope.kind === "workspace"
          ? (plan?.revisions ?? []).flatMap((r) =>
              r.state === "sealed" ? [revision(r)!] : [],
            )
          : [],
      targets: rows,
      regions: regions.map(({ id, name, provinces, included }) => ({
        id,
        name,
        provinces,
        included,
      })),
      support: {
        budgets: customers ? (content?.budgets ?? []) : [],
        contributions: customers ? (content?.contributions ?? []) : [],
        team: people ? (content?.team ?? []) : [],
        actions: customers && people ? (content?.actions ?? []) : [],
      },
      supportRestricted: !customers || !people,
    };
  });
}
