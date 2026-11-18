import { getAuthzStore } from "../../../authz/store";
import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { notFound, redirect } from "next/navigation";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { loadFailureText } from "../../lib/load-failure";
import { can } from "../../../authz/decide";
import { getCatalogStore, getStrategyStore } from "../../../domains/shared/registry";
import { listProductReferences, listSolutionReferences } from "../../../domains/catalog/service";
import { listAccounts } from "../../../domains/account/service";
import { marketViews } from "../../lib/market-strategy";
import { listPlans, listSegments } from "../../../domains/strategy/service";
import { NewPlanForm } from "../../components/plan-form";
import { assistStrategyDraft } from "./assist-action";
import { listStrategyOptions, listStrategyTypes } from "../../../domains/strategy/type-service";
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
  readonly searchParams: Promise<{ no?: string; id?: string }>;
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

  const { no, id } = await searchParams;
  // id is the version identity. Old code links prefer the current draft.
  const found=id ? rows.find(p=>p.id===id) : no ? rows.find(p=>p.planNo===no && p.status==="draft") ?? rows.filter(p=>p.planNo===no).sort((a,b)=>(b.versionNo ?? 0)-(a.versionNo ?? 0))[0] : undefined;
  if((no || id) && !found)notFound();
  if(found && found.status !== "draft")redirect(`/strategy/${found.id}`);

  // A settled plan is not editable - the service refuses it - so the form is
  // not offered for one either. Sending the reader back to the roster is the
  // same answer the gate gives, arrived at before the typing rather than after.
  const editable = found && found.status === "draft";
  const action = editable ? "strategy.plan.update" : "strategy.plan.create";
  if (!can(session.authz, session.entitlement, action, "ui").allowed) {
    redirect("/strategy");
  }
  const base = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement };
  const [solutions, segments, accounts, members, products, strategyTypes] = await Promise.all([
    can(session.authz, session.entitlement, "catalog.solution.view", "ui").allowed
      ? listSolutionReferences({ ...base, store: getCatalogStore() }).catch(() => null) : null,
    can(session.authz, session.entitlement, "strategy.segment.view", "ui").allowed
      ? listSegments({ ...base, store: getStrategyStore() }).catch(() => null) : null,
    listAccounts({ ...base, store: session.stores.account() }).catch(() => null),
    getAuthzStore().listMembers(session.workspaceId).catch(() => null),
    can(session.authz, session.entitlement, "catalog.product.view", "ui").allowed
      ? listProductReferences({ ...base, store: getCatalogStore() }).catch(() => null) : null,
    listStrategyTypes({...base,store:getStrategyStore()}).catch(()=>null),
  ]);
  const optionRead=await listStrategyOptions({...base,store:getStrategyStore()});
  const policy=await getCatalogStore().getPricingPolicy(session.workspaceId);
  const customerRows = accounts?.ok ? accounts.value.map(({ id, name, accountNo, segmentId, industry, region, customerSize }) =>
    ({ id, name, accountNo, segmentId, industry, region, customerSize: customerSize ?? null })) : null;
  const marketOptions = segments?.ok ? marketViews(segments.value, null, customerRows)
    .map(({ id, name, segmentCode, status, criteria, matched, missing, solutionIds, productIds }) => ({ id, name, segmentCode, status, criteria, matched, missing, solutionIds, productIds })) : null;
  const solutionOptions = solutions?.ok ? solutions.value : null;
  const productOptions = products?.ok ? products.value : null;

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: DOMAIN_LABEL.strategy, href: "/strategy" }]}
        current={editable ? found.name : STRATEGY_TEXT.newPlanTitle}
      />
      <NewPlanForm
        key={editable ? found.id : "new"}
        strategyOptions={optionRead.ok ? optionRead.value : []} currency={policy.defaultCurrency} userKey={`${session.workspaceId}:${session.user.sub}`} canAssist={can(session.authz,session.entitlement,"copilot.ask","ui").allowed} onAssist={assistStrategyDraft}
        existingPlanNos={rows.map((p) => p.planNo)}
        strategyTypes={strategyTypes?.ok ? strategyTypes.value : null}
        solutionOptions={solutionOptions}
        productOptions={productOptions}
        marketOptions={marketOptions}
        ownerOptions={members?.filter(m => m.status === "active").map(m => ({ value: m.sub, label: m.displayName || m.sub })) ?? null}
        creatorSub={found ? found.createdBySub ?? null : session.user.sub}
        initial={
          editable
            ? {
                id: found.id,
                result:found.result,expectations:found.expectations,
                editToken:found.editToken ?? 1,basePlanId:found.basePlanId ?? null,changeReason:found.changeReason ?? "",
                planNo: found.planNo,
                name: found.name,
                period: found.period,
                strategyTypeId: found.strategyTypeId ?? null,
                objective: found.objective,
                ownerSub: found.ownerSub,
                productIds: found.productIds ?? [],
                solutionIds: found.solutionIds,
                // Keep saved UUID references even when the catalog cannot be read.
                // Drawers still gate editing; a basic edit must never erase links.
                targetMarkets: found.targetMarkets?.map(({ segmentId, intent, approach, solutionIds, productIds = [], marketName, criteria }) => ({
                  segmentId, intent, approach, marketName, criteria, solutionIds, productIds,
                })) ?? [],
              }
            : undefined
        }
        onCreate={createStrategyPlan}
        onSave={savePlan}
      />
    </ViewLayout>
  );
}
