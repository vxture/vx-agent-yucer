import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getCatalogStore, getDeliveryStore } from "../../../domains/shared/registry";
import { pricingPolicy } from "../../../domains/catalog/service";
import { ageingCutoffsForConfig } from "../../../domains/delivery/service";
import {
  dealTypeUsage,
  forecastThresholds,
  listDealTypes,
  listStageDefinitions,
  listWinLossReasonsForConfig,
  stageDefinitionUsage,
  winLossReasonUsage,
} from "../../../domains/pipeline/service";
import { WinLossReasonConfig } from "../../components/win-loss-reason-config";
import { DealTypeConfig } from "../../components/deal-type-config";
import { StageDefinitionConfig } from "../../components/stage-definition-config";
import { OpportunityConfigPanel } from "../../components/opportunity-config-panel";
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
import {
  moveStageDefinitionAction,
  removeStageDefinitionAction,
  saveStageDefinition,
} from "../../pipeline/stage-definition-actions";
import { saveForecastThresholds } from "../../pipeline/threshold-actions";
import { DEFAULT_FORECAST_THRESHOLDS } from "../../../domains/pipeline/lib/forecast-rule";
import { savePricingPolicy } from "../../catalog/pricing-actions";
import { saveAgeingCutoffs } from "../../delivery/ageing-actions";
import { loadFailureText } from "../../lib/load-failure";

// 商机配置 - the assembly PR of the 商机配置 batch, unified onto one
// permission (incr/0063).
//
// SIX SECTIONS, ONE PAGE: 商机类型/商机阶段/赢丢原因/预测阈值/账龄分档/计价
// 货币. Set once, read by every screen that shows or advances a deal - the
// same /admin/product precedent (产品类型/产品状态/计价单位 stacked on one
// page) rather than six gear icons nobody goes looking for one at a time.
//
// ONE PERMISSION FOR THE WHOLE PAGE, BOTH DIRECTIONS (owner principle,
// 2026-09-13: admin configuration stays simple and open; tier/permission
// complexity belongs on the real business pages that USE these settings -
// /forecast, /winloss, /collection - not the page that only configures
// them). READ is `pipeline.opportunityconfig.view` (unchanged, already
// resolved to plain pipeline.read with no paid-tier gate) - all six sections
// render whenever the page itself does, not three of them conditionally on a
// tier the workspace may not have bought. WRITE is the new
// `pipeline.opportunityconfig.manage` (incr/0063), replacing the six each
// section used to check on its own (pipeline.dealType / pipeline.stage /
// pipeline.write / pipeline.forecast / delivery.write / catalog.price) - see
// incr/0063's own note for why moving the SERVICE verbs behind this page's
// six save actions off those six couldn't affect any other page. The old six
// are not retired: they still gate their own, different actions elsewhere
// (recordWinLossReview, applySuggestedCategory, the real price book,
// delivery project/milestone upserts, lead conversion, opportunity create/
// update/advance).
//
// `listWinLossReasonsForConfig`/`ageingCutoffsForConfig` are forked reads
// (same data, `pipeline.opportunityconfig.view` instead of the tier-gated
// `pipeline.winloss.view`/`delivery.revenue.view`) - `listWinLossReasons`/
// `ageingCutoffs` themselves are shared with /winloss and /collection and
// keep their own tier gates unchanged. `listDealTypes`/`listStageDefinitions`
// and `pricingPolicy` need no fork: the first two already carry the FREE-tier
// `pipeline.manage` feature (no real gate to begin with), and pricing never
// carried a tier gate at all.

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

  // ONE PERMISSION, BOTH DIRECTIONS ALREADY DECIDED ABOVE - so every section's
  // write affordance is this one check, not six.
  const canManage = can(session.authz, session.entitlement, "pipeline.opportunityconfig.manage", "ui").allowed;

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
    listWinLossReasonsForConfig(ctx),
    winLossReasonUsage(ctx),
    listDealTypes(ctx),
    dealTypeUsage(ctx),
    listStageDefinitions(ctx),
    stageDefinitionUsage(ctx),
    forecastThresholds(ctx),
    pricingPolicy(catalogCtx),
    ageingCutoffsForConfig(deliveryCtx),
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
        editable={canManage}
        workspaceStallDays={thresholds.ok ? thresholds.value.stallDays : DEFAULT_FORECAST_THRESHOLDS.stallDays}
        onSave={saveDealType}
        onSaveStallOverride={saveDealTypeStallOverride}
        onMove={moveDealTypeAction}
        onDelete={removeDealTypeAction}
      />

      <StageDefinitionConfig
        stages={stages.value}
        usage={stageUsage.ok ? stageUsage.value : {}}
        editable={canManage}
        onSave={saveStageDefinition}
        onMove={moveStageDefinitionAction}
        onDelete={removeStageDefinitionAction}
      />

      <WinLossReasonConfig
        reasons={reasons.value}
        usage={reasonUsage.ok ? reasonUsage.value : {}}
        editable={canManage}
        onSave={saveWinLossReason}
        onMove={moveWinLossReasonAction}
        onDelete={removeWinLossReasonAction}
      />

      <OpportunityConfigPanel
        canManage={canManage}
        forecast={thresholds.ok ? { thresholds: thresholds.value, onSave: saveForecastThresholds } : null}
        ageing={cutoffs.ok ? { cutoffs: cutoffs.value, onSave: saveAgeingCutoffs } : null}
        pricing={policy.ok ? { policy: policy.value, onSave: savePricingPolicy } : null}
      />
    </ViewLayout>
  );
}
