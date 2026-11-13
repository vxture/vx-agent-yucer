import { ViewHeader } from "../../components/business-controls";
import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { notFound, redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { loadFailureText } from "../../lib/load-failure";
import { can } from "../../../authz/decide";
import { getCatalogStore, getStrategyStore } from "../../../domains/shared/registry";
import { listSolutionReferences } from "../../../domains/catalog/service";
import { listAccounts } from "../../../domains/account/service";
import { marketViews } from "../../lib/market-strategy";
import { listPlans, listSegments } from "../../../domains/strategy/service";
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
// Unknown edit anchors return notFound; settled plans open their read view.

export const dynamic = "force-dynamic";

export default async function NewPlanPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ no?: string }>;
}) {
  const { DOMAIN_LABEL, STRATEGY_TEXT, SHELL_TEXT, LOAD_ERROR } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.

  const plans = await listPlans({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getStrategyStore(),
  });
  if(!plans.ok)return <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(plans.violations,LOAD_ERROR)}/>;
  const rows = plans.value;

  const { no } = await searchParams;
  const found = no ? rows.find((p) => p.planNo === no) : undefined;
  if(no && !found)notFound();
  if(found && ["closed","archived"].includes(found.status))redirect(`/strategy/${found.id}`);

  // A settled plan is not editable - the service refuses it - so the form is
  // not offered for one either. Sending the reader back to the roster is the
  // same answer the gate gives, arrived at before the typing rather than after.
  const editable = found && found.status !== "closed" && found.status !== "archived";
  const action = editable ? "strategy.plan.update" : "strategy.plan.create";
  if (!can(session.authz, session.entitlement, action, "ui").allowed) {
    redirect("/strategy");
  }
  const base = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement };
  const [solutions, segments, accounts] = await Promise.all([
    can(session.authz, session.entitlement, "catalog.solution.view", "ui").allowed
      ? listSolutionReferences({ ...base, store: getCatalogStore() }).catch(() => null) : null,
    can(session.authz, session.entitlement, "strategy.segment.view", "ui").allowed
      ? listSegments({ ...base, store: getStrategyStore() }).catch(() => null) : null,
    listAccounts({ ...base, store: session.stores.account() }).catch(() => null),
  ]);
  const customerRows = accounts?.ok ? accounts.value.map(({ id, name, accountNo, segmentCode, industry, region, customerSize }) =>
    ({ id, name, accountNo, segmentCode, industry, region, customerSize: customerSize ?? null })) : null;
  const marketOptions = segments?.ok ? marketViews(segments.value, null, customerRows)
    .map(({ id, name, segmentCode, status, criteria, matched, missing }) => ({ id, name, segmentCode, status, criteria, matched, missing })) : null;
  const solutionOptions = solutions?.ok ? solutions.value : null;
  const visibleSolutions = new Set(solutionOptions?.map(s => s.id));

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: DOMAIN_LABEL.strategy, href: "/strategy" }]}
        current={editable ? STRATEGY_TEXT.editPlanTitle : STRATEGY_TEXT.newPlanTitle}
      />
      <ViewHeader
        title={editable ? STRATEGY_TEXT.editPlanTitle : STRATEGY_TEXT.newPlanTitle}
        description={editable ? STRATEGY_TEXT.editPlanWhy : STRATEGY_TEXT.newPlanWhy}
      />
      <NewPlanForm
        key={editable ? found.id : "new"}
        existingPlanNos={rows.map((p) => p.planNo)}
        existingPeriods={rows.map((p) => p.period)}
        solutionOptions={solutionOptions}
        marketOptions={marketOptions}
        initial={
          editable
            ? {
                id: found.id,
                planNo: found.planNo,
                name: found.name,
                period: found.period,
                objective: found.objective,
                ownerSub: found.ownerSub,
                solutionIds: solutionOptions && found.solutionIds.every(id => visibleSolutions.has(id)) ? found.solutionIds : undefined,
                targetMarkets: marketOptions ? found.targetMarkets?.map(({ segmentId, intent, approach, solutionIds, marketName }) => ({
                  segmentId, intent, approach, marketName,
                  ...((!solutionIds.length || (solutionOptions && solutionIds.every(id => visibleSolutions.has(id)))) ? { solutionIds } : {}),
                })) ?? [] : [],
              }
            : undefined
        }
        onCreate={createStrategyPlan}
        onSave={savePlan}
      />
    </ViewLayout>
  );
}
