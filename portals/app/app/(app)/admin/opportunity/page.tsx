import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getCatalogStore, getDeliveryStore } from "../../../domains/shared/registry";
import { pricingPolicy } from "../../../domains/catalog/service";
import { ageingCutoffs } from "../../../domains/delivery/service";
import {
  dealTypeUsage,
  forecastThresholds,
  listDealTypes,
  listStageDefinitions,
  listWinLossReasons,
  stageDefinitionUsage,
  winLossReasonUsage,
} from "../../../domains/pipeline/service";
import { WinLossReasonConfig } from "../../components/win-loss-reason-config";
import { DealTypeConfig } from "../../components/deal-type-config";
import { StageDefinitionConfig } from "../../components/stage-definition-config";
import { ForecastThresholdConfig } from "../../components/forecast-threshold-config";
import { PricingPolicyConfig } from "../../components/pricing-policy-config";
import { AgeingPolicyConfig } from "../../components/ageing-policy-config";
import {
  moveWinLossReasonAction,
  removeWinLossReasonAction,
  saveWinLossReason,
} from "../../pipeline/reason-actions";
import {
  moveDealTypeAction,
  removeDealTypeAction,
  saveDealType,
  saveDealTypeStallOverride,
} from "../../pipeline/deal-type-actions";
import { DEFAULT_FORECAST_THRESHOLDS } from "../../../domains/pipeline/lib/forecast-rule";
import {
  moveStageDefinitionAction,
  removeStageDefinitionAction,
  saveStageDefinition,
} from "../../pipeline/stage-definition-actions";
import { saveForecastThresholds } from "../../pipeline/threshold-actions";
import { savePricingPolicy } from "../../catalog/pricing-actions";
import { saveAgeingCutoffs } from "../../delivery/ageing-actions";
import { loadFailureText } from "../../lib/load-failure";

// 商机配置 - the assembly PR of the 商机配置 batch.
//
// SIX SECTIONS, ONE PAGE: 赢丢原因/商机类型/商机阶段 were each a standalone
// route through PR1-PR3 of this batch (backend first, then their own config
// UI) precisely so the backend they needed had a real surface to verify
// against before this page existed. 预测阈值/计价规则/账龄分档 were already
// standalone routes from earlier batches. All six are the same kind of thing
// - set once, read by every screen that shows or advances a deal - so they
// join /admin/product's own precedent (产品类型/产品状态/计价单位 stacked on
// one page since 2026-09-08) rather than staying six gear icons nobody who
// is setting up a workspace goes looking for one at a time.
//
// ONE NEW PAGE-LEVEL PERMISSION, `pipeline.opportunityconfig.view`, gates
// whether this page is reachable at all - it resolves to the existing
// pipeline.read, the same choice pipeline.stage.view/pipeline.dealtype.view
// already made, so nobody's read access widens. EACH SECTION KEEPS ITS OWN
// WRITE PERMISSION UNCHANGED: pipeline.winloss.record, pipeline.dealType,
// pipeline.stage, pipeline.forecast.categorize, catalog.pricebook.upsert,
// delivery.revenue.upsert respectively - a role that can price but not
// redefine stages sees the whole page, with only the price section editable.

export const dynamic = "force-dynamic";

export default async function OpportunityConfigPage() {
  const { ADMIN_TEXT, DOMAIN_LABEL, LOAD_ERROR, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  if (!can(session.authz, session.entitlement, "pipeline.opportunityconfig.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };
  const catalogCtx = { ...ctx, store: getCatalogStore() };
  const deliveryCtx = { ...ctx, store: getDeliveryStore() };

  // THESE THREE, UNLIKE THE OTHER THREE, CAN GENUINELY FAIL THEIR OWN VIEW
  // GATE past the page's own. pipeline.opportunityconfig.view is pipeline.read
  // (the exact permission winloss.view/dealtype.view/stage.view already
  // resolve to, so those three can never fail here); forecast.view carries the
  // pipeline.forecast FEATURE KEY (a paid tier) and revenue.view carries
  // delivery.revenue - a workspace or role can hold pipeline.read without
  // holding either. Each section is therefore OMITTED, not shown with
  // fabricated defaults, when its own view gate refuses.
  const canViewForecast = can(session.authz, session.entitlement, "pipeline.forecast.view", "ui").allowed;
  const canViewPricing = can(session.authz, session.entitlement, "catalog.pricebook.view", "ui").allowed;
  const canViewAgeing = can(session.authz, session.entitlement, "delivery.revenue.view", "ui").allowed;

  const [
    reasons,
    reasonUsage,
    dealTypes,
    dealTypeUsageRows,
    stages,
    stageUsage,
    thresholds,
    policy,
    cutoffs,
  ] = await Promise.all([
    listWinLossReasons(ctx),
    winLossReasonUsage(ctx),
    listDealTypes(ctx),
    dealTypeUsage(ctx),
    listStageDefinitions(ctx),
    stageDefinitionUsage(ctx),
    canViewForecast ? forecastThresholds(ctx) : Promise.resolve(null),
    canViewPricing ? pricingPolicy(catalogCtx) : Promise.resolve(null),
    canViewAgeing ? ageingCutoffs(deliveryCtx) : Promise.resolve(null),
  ]);

  if (!reasons.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(reasons.violations, LOAD_ERROR)}
      />
    );
  }
  if (!dealTypes.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(dealTypes.violations, LOAD_ERROR)}
      />
    );
  }
  if (!stages.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(stages.violations, LOAD_ERROR)}
      />
    );
  }

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={DOMAIN_LABEL.opportunityConfig}
      />
      <ViewHeader
        icon="kanban"
        title={DOMAIN_LABEL.opportunityConfig}
        description={ADMIN_TEXT.entryHint.opportunityConfig}
      />

      <DealTypeConfig
        dealTypes={dealTypes.value}
        usage={dealTypeUsageRows.ok ? dealTypeUsageRows.value : {}}
        editable={can(session.authz, session.entitlement, "pipeline.dealtype.manage", "ui").allowed}
        showStallOverride={canViewForecast}
        canOverrideStallDays={can(session.authz, session.entitlement, "pipeline.forecast.categorize", "ui").allowed}
        workspaceStallDays={thresholds?.ok ? thresholds.value.stallDays : DEFAULT_FORECAST_THRESHOLDS.stallDays}
        onSave={saveDealType}
        onSaveStallOverride={saveDealTypeStallOverride}
        onMove={moveDealTypeAction}
        onDelete={removeDealTypeAction}
      />

      <StageDefinitionConfig
        stages={stages.value}
        usage={stageUsage.ok ? stageUsage.value : {}}
        editable={can(session.authz, session.entitlement, "pipeline.stage.manage", "ui").allowed}
        onSave={saveStageDefinition}
        onMove={moveStageDefinitionAction}
        onDelete={removeStageDefinitionAction}
      />

      <WinLossReasonConfig
        reasons={reasons.value}
        usage={reasonUsage.ok ? reasonUsage.value : {}}
        editable={can(session.authz, session.entitlement, "pipeline.winloss.record", "ui").allowed}
        onSave={saveWinLossReason}
        onMove={moveWinLossReasonAction}
        onDelete={removeWinLossReasonAction}
      />

      {canViewForecast && thresholds?.ok ? (
        <ForecastThresholdConfig
          thresholds={thresholds.value}
          canWrite={can(session.authz, session.entitlement, "pipeline.forecast.categorize", "ui").allowed}
          onSave={saveForecastThresholds}
        />
      ) : null}

      {canViewAgeing && cutoffs?.ok ? (
        <AgeingPolicyConfig
          cutoffs={cutoffs.value}
          canWrite={can(session.authz, session.entitlement, "delivery.revenue.upsert", "ui").allowed}
          onSave={saveAgeingCutoffs}
        />
      ) : null}

      {canViewPricing && policy?.ok ? (
        <PricingPolicyConfig
          policy={policy.value}
          canWrite={can(session.authz, session.entitlement, "catalog.pricebook.upsert", "ui").allowed}
          onSave={savePricingPolicy}
        />
      ) : null}
    </ViewLayout>
  );
}
