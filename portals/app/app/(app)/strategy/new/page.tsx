import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getStrategyStore } from "../../../domains/shared/registry";
import { listPlans } from "../../../domains/strategy/service";
import { NewPlanForm } from "../../components/plan-form";
import { createStrategyPlan, savePlan } from "../actions";

// 新建 / 修改战略计划 - a page since 2026-09-05 (owner ruling; see /catalog/new
// for the shape and why the gate redirects). NO STATUS FIELD survives the move:
// a new plan is a draft, and the lifecycle table owns every step after that.
//
// ?no=X edits that plan: the number locks and the fields arrive filled in. The
// two modes are gated separately - creating needs strategy.plan.create, editing
// needs strategy.plan.update - so a member who may only edit reaches this page
// with a number and is refused without one.
//
// An unknown number falls back to creation rather than showing an edit heading
// over an empty form.

export const dynamic = "force-dynamic";

export default async function NewPlanPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ no?: string }>;
}) {
  const { SHELL_TEXT, STRATEGY_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const plans = await listPlans({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getStrategyStore(),
  });
  const rows = plans.ok ? plans.value : [];

  const { no } = await searchParams;
  const found = no ? rows.find((p) => p.planNo === no) : undefined;

  // A settled plan is not editable - the service refuses it - so the form is
  // not offered for one either. Sending the reader back to the roster is the
  // same answer the gate gives, arrived at before the typing rather than after.
  const editable = found && found.status !== "closed" && found.status !== "archived";
  const action = editable ? "strategy.plan.update" : "strategy.plan.create";
  if (!can(session.authz, session.entitlement, action, "ui").allowed) {
    redirect("/strategy");
  }

  return (
    <ViewLayout>
      <ViewHeader
        title={editable ? STRATEGY_TEXT.editPlanTitle : STRATEGY_TEXT.newPlanTitle}
        description={editable ? STRATEGY_TEXT.editPlanWhy : STRATEGY_TEXT.newPlanWhy}
      />
      <NewPlanForm
        key={editable ? found.id : "new"}
        existingPlanNos={rows.map((p) => p.planNo)}
        existingPeriods={rows.map((p) => p.period)}
        initial={
          editable
            ? {
                id: found.id,
                planNo: found.planNo,
                name: found.name,
                period: found.period,
                objective: found.objective,
                ownerSub: found.ownerSub,
              }
            : undefined
        }
        onCreate={createStrategyPlan}
        onSave={savePlan}
      />
    </ViewLayout>
  );
}
