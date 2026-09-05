import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getStrategyStore } from "../../../domains/shared/registry";
import { listPlans } from "../../../domains/strategy/service";
import { NewPlanForm } from "../../components/plan-form";
import { createStrategyPlan } from "../actions";

// 新建战略计划 - a page since 2026-09-05 (owner ruling; see /catalog/new for
// the shape and why the gate redirects). NO STATUS FIELD survives the move: a
// new plan is a draft, and the lifecycle table owns every step after that.

export const dynamic = "force-dynamic";

export default async function NewPlanPage() {
  const { SHELL_TEXT, STRATEGY_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "strategy.plan.create", "ui").allowed) {
    redirect("/strategy");
  }

  const plans = await listPlans({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getStrategyStore(),
  });
  const rows = plans.ok ? plans.value : [];

  return (
    <ViewLayout>
      <ViewHeader title={STRATEGY_TEXT.newPlanTitle} description={STRATEGY_TEXT.newPlanWhy} />
      <NewPlanForm
        existingPlanNos={rows.map((p) => p.planNo)}
        existingPeriods={rows.map((p) => p.period)}
        onCreate={createStrategyPlan}
      />
    </ViewLayout>
  );
}
