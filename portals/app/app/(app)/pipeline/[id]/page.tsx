import Link from "next/link";
import {
  EmptyState,
  MetricGrid,
  PageHeader,
  PageSection,
  PageStack,
  StatusBadge,
  type MetricGridItem,
} from "@vxture/design-system";
import { resolveAppSession } from "../../lib/session";
import {
  FORECAST_LABEL,
  OPPORTUNITY_TEXT,
  PIPELINE_TEXT,
  SHELL_TEXT,
  STAGE_LABEL,
} from "../../lib/messages";
import { FORECAST_TONE, STAGE_TONE, formatMoney, probabilityDisplay } from "../../lib/view-model";
import { can } from "../../../authz/decide";
import { getPipelineStore } from "../../../domains/shared/registry";
import { stageHistory } from "../../../domains/pipeline/service";
import type { ForecastCategory } from "../../../domains/pipeline/lib/forecast";
import type { Stage } from "../../../domains/pipeline/lib/stage";
import { DealTerms } from "../../components/deal-terms";
import { StageControl } from "../../components/stage-control";
import { StageJourney } from "../../components/stage-journey";
import { advanceOpportunityStage, repriceOpportunity } from "../stage-action";

// D6 opportunity detail: where the deal is, how it got there, and where it goes.
//
// The three panels are the stage machine's three load-bearing properties made
// visible - the current state with its win rate, the journal that every change
// writes, and the control that moves it. Splitting them across pages would let
// someone advance a deal without seeing that it has sat in one stage for two
// months, which is the fact the journal exists to surface.
//
// Attribution is shown as READ-ONLY with the reason. campaign_id and account_id
// have no UPDATE grant; presenting them as editable would produce a permission
// denied from the database, and the design intends the field to explain itself
// rather than to fail.

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const store = getPipelineStore();
  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store,
  };

  const opportunity = await store.getOpportunity(session.workspaceId, id);
  if (!opportunity) {
    // Same answer for "does not exist" and "belongs to another workspace" - the
    // store already collapsed the two, and re-separating them here would undo
    // that on the surface a stranger actually reaches.
    return <EmptyState title={SHELL_TEXT.loadFailed} description={OPPORTUNITY_TEXT.notFound} />;
  }

  const history = await stageHistory(ctx, id);

  const probability = probabilityDisplay(opportunity);
  const metrics: MetricGridItem[] = [
    {
      id: "amount",
      label: OPPORTUNITY_TEXT.amount,
      value: formatMoney(opportunity.amount?.amount ?? null, opportunity.currency),
      tone: "neutral",
    },
    {
      id: "probability",
      label: OPPORTUNITY_TEXT.probability,
      value: probability.value == null ? "-" : `${probability.value}%`,
      // The override is called out here too, not only on the board: a reader who
      // opens one deal must not have to remember the list to know whether the
      // number is a machine suggestion or a commitment someone made.
      trend: probability.overridden
        ? PIPELINE_TEXT.probabilityHintOverridden(probability.stageDefault)
        : PIPELINE_TEXT.probabilityHintDefault,
      tone: probability.overridden ? "info" : "neutral",
    },
    {
      id: "close",
      label: opportunity.closedAt ? OPPORTUNITY_TEXT.closedAt : OPPORTUNITY_TEXT.expectedClose,
      value: (opportunity.closedAt ?? opportunity.expectedCloseAt)?.toISOString().slice(0, 10) ?? "-",
      tone: "neutral",
    },
    {
      id: "owner",
      label: OPPORTUNITY_TEXT.owner,
      value: opportunity.ownerSub ?? "-",
      tone: "neutral",
    },
  ];

  return (
    <PageStack>
      <PageHeader
        eyebrow={opportunity.opportunityNo}
        icon="table"
        title={opportunity.name}
        description={opportunity.accountName ?? opportunity.accountId}
        actions={
          <>
            <StatusBadge tone={STAGE_TONE[opportunity.stage as Stage]} dot>
              {STAGE_LABEL[opportunity.stage as Stage] ?? opportunity.stage}
            </StatusBadge>
            <StatusBadge tone={FORECAST_TONE[opportunity.forecastCategory as ForecastCategory]}>
              {FORECAST_LABEL[opportunity.forecastCategory as ForecastCategory]}
            </StatusBadge>
          </>
        }
      />

      <MetricGrid items={metrics} />

      <PageSection title={OPPORTUNITY_TEXT.account} description={OPPORTUNITY_TEXT.attributionFrozen}>
        <Link href={`/account/${opportunity.accountId}`}>
          {opportunity.accountName ?? opportunity.accountId}
        </Link>
        <div>
          <span>{OPPORTUNITY_TEXT.campaign}: </span>
          {opportunity.campaignId ? (
            <StatusBadge tone="neutral">{opportunity.campaignId}</StatusBadge>
          ) : (
            // A blank cell would read as missing data. Not every deal starts as
            // a campaign response, and that is a fact rather than a gap.
            <StatusBadge tone="neutral">{OPPORTUNITY_TEXT.noAttribution}</StatusBadge>
          )}
        </div>
      </PageSection>

      <DealTerms
        opportunityId={id}
        stage={opportunity.stage}
        amount={opportunity.amount?.amount ?? null}
        currency={opportunity.currency}
        probability={opportunity.probability}
        expectedCloseAt={opportunity.expectedCloseAt}
        forecastCategory={opportunity.forecastCategory}
        canEdit={can(session.authz, session.entitlement, "pipeline.opportunity.update", "ui").allowed}
        onSave={repriceOpportunity}
      />

      <StageControl
        opportunityId={id}
        stage={opportunity.stage}
        probability={opportunity.probability}
        canAdvance={can(session.authz, session.entitlement, "pipeline.opportunity.advance", "ui").allowed}
        onAdvance={advanceOpportunityStage}
      />

      {history.ok ? (
        <StageJourney events={history.value} />
      ) : (
        <EmptyState
          title={SHELL_TEXT.loadFailed}
          description={history.violations.map((v) => v.message).join("; ")}
        />
      )}
    </PageStack>
  );
}
