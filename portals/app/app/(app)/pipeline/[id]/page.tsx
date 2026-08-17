import Link from "next/link";
import { EmptyState, MetricGrid, Section, StatusBadge, ViewHeader, ViewLayout, type MetricGridItem } from "@vxture/design-ui";
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
import { getFieldStore, getPipelineStore } from "../../../domains/shared/registry";
import { getOpportunityDetail, stageHistory } from "../../../domains/pipeline/service";
import type { ForecastCategory } from "../../../domains/pipeline/lib/forecast";
import type { Stage } from "../../../domains/pipeline/lib/stage";
import { DealTerms } from "../../components/deal-terms";
import { StageControl } from "../../components/stage-control";
import { StageJourney } from "../../components/stage-journey";
import { RecordFollowUp } from "../../components/record-follow-up";
import { InteractionTimeline } from "../../components/interaction-timeline";
import { CommitmentList } from "../../components/commitment-list";
import { listCommitments, listInteractions } from "../../../domains/account/field-service";
import { CHANNEL_LABEL } from "../../lib/messages";
import { addCommitment, recordFollowUp, settleCommitment } from "../../account/field-actions";
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

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPipelineStore(),
  };

  // Through the service, not the store. A page holding a store handle is how a
  // URL becomes a way around the gate the hidden nav entry only appeared to
  // enforce - the same mistake getAccountDetail() was added to correct.
  const detail = await getOpportunityDetail(ctx, id);
  if (!detail.ok) {
    return <EmptyState title={SHELL_TEXT.loadFailed} description={OPPORTUNITY_TEXT.notFound} />;
  }
  const opportunity = detail.value;

  const history = await stageHistory(ctx, id);

  // The evidence plane, scoped to THIS deal.
  //
  // Capture lives here and not only on the account page for one reason: the
  // kill criterion (ADR-012) counts confirmed interactions per
  // OPPORTUNITY per week, and a rep working a deal is on this page, not on the
  // customer record. A metric that measures a behaviour the interface does not
  // afford measures the interface, not the idea.
  const fieldCtx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getFieldStore(),
  };
  const [interactions, commitments] = await Promise.all([
    listInteractions(fieldCtx, { opportunityId: id, limit: 50 }),
    listCommitments(fieldCtx, { opportunityId: id }),
  ]);
  const canRecord = can(fieldCtx.holder, fieldCtx.entitlement, "account.upsert", "data").allowed;

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
    <ViewLayout>
      <ViewHeader
        secondary={opportunity.opportunityNo}
        icon="table"
        title={opportunity.name}
        description={opportunity.accountName ?? opportunity.accountId}
        action={
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

      <Section title={OPPORTUNITY_TEXT.account} description={OPPORTUNITY_TEXT.attributionFrozen}>
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
      </Section>

      {/* Capture sits ABOVE the controls that move the deal. Recording what
          happened is what a rep came here to do after a meeting; deciding the
          stage is a conclusion drawn from it, and putting the conclusion first
          is how a stage gets advanced on optimism. */}
      <RecordFollowUp
        accountId={opportunity.accountId}
        opportunityId={id}
        canRecord={canRecord}
        onRecord={recordFollowUp}
      />

      <DealTerms
        opportunityId={id}
        stage={opportunity.stage}
        amount={opportunity.amount?.amount ?? null}
        currency={opportunity.currency}
        probability={opportunity.probability}
        expectedCloseAt={opportunity.expectedCloseAt}
        forecastCategory={opportunity.forecastCategory}
        canEdit={can(session.authz, session.entitlement, "pipeline.opportunity.update", "ui").allowed}
        // The bucket is a pro capability the catalog withholds from the rep who
        // owns the deal, so it gets its own gate rather than riding on the
        // editing one.
        canCategorize={
          can(session.authz, session.entitlement, "pipeline.forecast.categorize", "ui").allowed
        }
        onSave={repriceOpportunity}
      />

      <StageControl
        opportunityId={id}
        stage={opportunity.stage}
        probability={opportunity.probability}
        canAdvance={can(session.authz, session.entitlement, "pipeline.opportunity.advance", "ui").allowed}
        onAdvance={advanceOpportunityStage}
      />

      {commitments.ok ? (
        <CommitmentList
          accountId={opportunity.accountId}
          opportunityId={id}
          items={commitments.value}
          evidence={(interactions.ok ? interactions.value : []).map((i) => ({
            id: i.id,
            label: `${i.occurredAt.toISOString().slice(0, 10)} ${CHANNEL_LABEL[i.channel] ?? i.channel}`,
          }))}
          canWrite={canRecord}
          onCreate={addCommitment}
          onSettle={settleCommitment}
        />
      ) : null}

      {/* Deliberately adjacent to the stage journey. One says what we recorded
          about the deal's state, the other says what actually happened - and a
          deal that advanced two stages with nothing beside it in the timeline
          is the single most useful thing this page can show a manager. */}
      {interactions.ok ? <InteractionTimeline items={interactions.value} /> : null}

      {history.ok ? (
        <StageJourney events={history.value} />
      ) : (
        <EmptyState
          title={SHELL_TEXT.loadFailed}
          description={history.violations.map((v) => v.message).join("; ")}
        />
      )}
    </ViewLayout>
  );
}
