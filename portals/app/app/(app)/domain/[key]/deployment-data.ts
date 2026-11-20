import { readSalesPlan, type SalesPlanContext } from "../../../domains/planning/plan-service";
import { PlanError, planVersions } from "../../../domains/planning/plan-model";
import { regionalPlanningRevision } from "../../../domains/planning/plan-workflow";
import { can } from "../../../authz/decide";

export type DeploymentOverview = Awaited<ReturnType<typeof readDeploymentOverview>>;

/** Return only an authorized summary, never serialize the planning aggregate. */
export async function readDeploymentOverview(ctx: SalesPlanContext, year: number, at: string) {
  try {
    const plan = await readSalesPlan(ctx, year);
    const state = plan ? planVersions(plan, at) : null;
    const current = state?.current;
    if (!current) return { status: "unpublished" as const };
    const content = current.content;
    // A company revision carries the previous regional slice unchanged.
    // Identify its actual publication rather than implying a new deployment.
    const regionalVersion = regionalPlanningRevision(plan!, current)?.version ?? null;
    const regions = content.regions.filter(r => r.included);
    const customers = new Set([
      ...content.budgets.map(b => b.accountId),
      ...content.actions.flatMap(a => a.accountId ? [a.accountId] : []),
    ]);
    if (customers.size && !can(ctx.holder, ctx.entitlement, "account.view", "data").allowed)
      return { status: "denied" as const };
    const withAction = new Set(content.actions.flatMap(a => a.accountId ? [a.accountId] : []));
    return {
      status: "published" as const,
      revisionId: current.id,
      version: current.version,
      regionalVersion,
      closed: state!.closed,
      regions: regions.length,
      customers: customers.size,
      regionsWithoutOwner: regions.filter(r => !r.ownerSub).length,
      customersWithoutAction: [...customers].filter(id => !withAction.has(id)).length,
    };
  } catch (error) {
    if (error instanceof PlanError && [
      "plan_denied", "plan_scope_required", "plan_source_permission", "strategy_source_permission",
    ].includes(error.code)) return { status: "denied" as const };
    return { status: "failed" as const };
  }
}
