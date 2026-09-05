import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  EmptyState,
  MetricGrid,
  Section,
  StatusBadge,
  ViewHeader,
  ViewLayout,
  type MetricGridItem,
} from "@vxture/design-ui";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import {
  FORECAST_TONE,
  STAGE_TONE,
  formatMoney,
  probabilityDisplay,
} from "../../lib/view-model";
import { can } from "../../../authz/decide";
import {
  getAccountStore,
  getCatalogStore,
  getCopilotStore,
  getDeliveryStore,
  getFieldStore,
  getPipelineStore,
} from "../../../domains/shared/registry";
import {
  getOpportunityDetail,
  stageHistory,
} from "../../../domains/pipeline/service";
import {
  getAccountDetail,
  decisionChainsByOpportunity,
  buyingRolesFor,
} from "../../../domains/account/service";
import { listProjects } from "../../../domains/delivery/service";
import { listProposals } from "../../../domains/copilot/service";
import { cachedFeed } from "../../lib/board";
import { BuyingRoleForm } from "../../components/buying-role-form";
import { saveBuyingRole } from "../buying-role-action";
import { dealBrief } from "../../../domains/pipeline/lib/brief";
import { WarRoom } from "../../components/war-room";
import { CategoryActionCard } from "../../components/category-action-card";
import { CommitmentActionCard } from "../../components/commitment-action-card";
import { ProposalActionCard } from "../../components/proposal-action-card";
import { LinkActionCard } from "../../components/link-action-card";
import { applySuggestedCategory } from "../../forecast/actions";
import { adjudicateProposals } from "../../copilot/actions";
import { DecisionChain } from "../../components/decision-chain";
import { PositionBrief } from "../../components/position-brief";
import type { ForecastCategory } from "../../../domains/pipeline/lib/forecast";
import type { Stage } from "../../../domains/pipeline/lib/stage";
import { DealTerms } from "../../components/deal-terms";
import { NewEntryLink } from "../../components/form-page";
import { LineEditor } from "../../components/line-editor";
import {
  advanceOpportunityStage,
  approveDiscount,
  repriceOpportunity,
  saveOpportunityLines,
} from "../stage-action";
import {
  listOpportunityLines,
  listProducts as listCatalogProducts,
} from "../../../domains/catalog/service";
import { StageControl } from "../../components/stage-control";
import { StageJourney } from "../../components/stage-journey";
import { InteractionTimeline } from "../../components/interaction-timeline";
import { CommitmentList } from "../../components/commitment-list";
import {
  listCommitments,
  listInteractions,
} from "../../../domains/account/field-service";
import {
  recordFollowUp,
  settleCommitment,
} from "../../account/field-actions";
import { loadFailureText } from "../../lib/load-failure";

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
  const {
    FORECAST_LABEL,
    OPPORTUNITY_TEXT,
    PIPELINE_TEXT,
    SHELL_TEXT,
    STAGE_LABEL,
    POSITION_TEXT,
    CHAIN_TEXT,
    WAR_ROOM_TEXT,
    CHANNEL_LABEL,
    LOAD_ERROR,
  } = await getMessages();
  const { id } = await params;
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.pipeline(),
  };

  // Through the service, not the store. A page holding a store handle is how a
  // URL becomes a way around the gate the hidden nav entry only appeared to
  // enforce - the same mistake getAccountDetail() was added to correct.
  const detail = await getOpportunityDetail(ctx, id);
  if (!detail.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={OPPORTUNITY_TEXT.notFound}
      />
    );
  }
  const opportunity = detail.value;

  const history = await stageHistory(ctx, id);

  // Everything the position brief needs. Each read goes through its domain's
  // own service, so this page cannot show what another page would refuse.
  const accountCtx = { ...ctx, store: session.stores.account() };
  // The catalogue reads go through the SERVICE, like every other cross-domain
  // read on this page - a store handle here would skip both gates.
  const catalogCtx = { ...ctx, store: getCatalogStore() };
  const [account, chain, roles, projects, feed, proposals, lineRows, productRows] =
    await Promise.all([
      getAccountDetail(accountCtx, opportunity.accountId),
      // incr/0027. THIS PAGE IS A DEAL, so it asks the deal's question. It used
      // to call the account-level chain, which is the defect ADR-024 opens
      // with: every open deal at one customer rendered the same committee and
      // the same 决策人未触达 badge. Falls back to the customer default when
      // this deal has stated nothing, so a customer with one deal looks exactly
      // as it did.
      // The plural verb even for one deal, because it returns the PEOPLE with
      // this deal's roles resolved onto them - which the full DecisionChain
      // rendering needs and the coverage-only verb does not carry.
      decisionChainsByOpportunity(accountCtx, opportunity.accountId, [
        { id: opportunity.id, name: opportunity.name },
      ]),
      buyingRolesFor(accountCtx, opportunity.id),
      listProjects(
        { ...ctx, store: getDeliveryStore() },
        { accountId: opportunity.accountId },
      ),
      cachedFeed({
        workspaceId: session.workspaceId,
        sub: session.user.sub,
        holder: session.authz,
        entitlement: session.entitlement,
      }),
      listProposals(
        { ...ctx, store: getCopilotStore() },
        { status: "proposed" },
      ),
      listOpportunityLines(catalogCtx),
      listCatalogProducts(catalogCtx),
    ]);
  const plan =
    account.ok && account.value.account.tier === "strategic"
      ? await session.stores.account().getAccountPlan(
          session.workspaceId,
          opportunity.accountId,
        )
      : null;

  const accountName = account.ok
    ? account.value.account.name
    : opportunity.accountId;
  const tier = account.ok ? account.value.account.tier : "standard";

  // THE ONE CHAIN (2026-09-05 convergence). This page used to render it twice
  // in two vocabularies - a verdict cell and four bare counts - which read as
  // contradiction whenever reachability (a path question) disagreed with the
  // counts. Now: the war-room cell is the SUMMARY, and the full DecisionChain
  // below is the one detail rendering, per-deal people included.
  const dealChain = chain.ok ? (chain.value[0] ?? null) : null;
  const cov = dealChain?.coverage ?? null;

  // The problems are the JUDGEMENTS that landed on this account - rules over
  // recorded evidence, not a hand-kept risk list that goes stale.
  const problems = (feed.ok ? feed.value.judgements : [])
    .filter((j) => j.subjectId === opportunity.accountId || j.subjectId === id)
    .map((j) => ({ id: j.id, claim: j.claim, rule: j.rule ?? null }));

  // Proposals for this position, labelled by the capability that produced them
  // (ADR-015) so a reader can see whether they are signing a commercial move or
  // a relationship one.
  const CAP_GROUP: Record<string, string> = {
    "deal.stall_risk": POSITION_TEXT.planCommercial,
    "deal.competition": POSITION_TEXT.planCommercial,
    "pricing.discount_approval": POSITION_TEXT.planCommercial,
    "account.chain_map": POSITION_TEXT.planRelation,
    "account.cadence": POSITION_TEXT.planRelation,
    "delivery.payment_risk": POSITION_TEXT.planTechnical,
  };
  const positionProposals = (proposals.ok ? proposals.value : [])
    .filter((a) => a.subjectId === id || a.subjectId === opportunity.accountId)
    .map((a) => ({
      id: a.id,
      title: POSITION_TEXT.actionLabels[a.actionType] ?? a.actionType,
      group: CAP_GROUP[a.capability ?? ""] ?? POSITION_TEXT.planCommercial,
      rationale: a.rationale,
      confidence: a.confidence,
    }));

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

  // THE BRIEF - the war room's single verdict (owner ruling 2026-09-05).
  // Every input below is a row this page already loaded; the convergence is
  // the only new thing, and it is a tested pure function.
  const lastStageChangeAt = history.ok
    ? (history.value.map((e) => e.occurredAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null)
    : null;
  const briefNow = new Date();
  const brief = dealBrief({
    deal: {
      id,
      stage: opportunity.stage,
      forecastCategory: opportunity.forecastCategory,
      probability: opportunity.probability,
      expectedCloseAt: opportunity.expectedCloseAt,
      lastStageChangeAt,
      status: opportunity.status,
    },
    chain: cov,
    rolesStated: roles.ok && roles.value.length > 0,
    commitments: (commitments.ok ? commitments.value : []).map((c) => ({
      id: c.id,
      direction: c.direction,
      status: c.status,
      dueAt: c.dueAt,
      statement: c.statement,
    })),
    lines: (lineRows.ok ? lineRows.value : [])
      .filter((l) => l.opportunityId === id)
      .map((l) => ({ needsApproval: l.needsApproval, approved: l.approved })),
    // ONLY proposals whose subject is THIS DEAL. Account-level ones stay in
    // the PositionBrief below - adjudicating them from a deal page would sign
    // a customer-wide move under a deal-sized heading.
    proposals: (proposals.ok ? proposals.value : [])
      .filter((a) => a.subjectId === id)
      .map((a) => ({ id: a.id, title: POSITION_TEXT.actionLabels[a.actionType] ?? a.actionType })),
    text: {
      stageMoving: WAR_ROOM_TEXT.stageMoving,
      stageStalled: WAR_ROOM_TEXT.stageStalled,
      stageTerminal: WAR_ROOM_TEXT.stageTerminal,
      forecastAgrees: WAR_ROOM_TEXT.forecastAgrees,
      forecastDisagrees: WAR_ROOM_TEXT.forecastDisagrees,
      forecastSettled: WAR_ROOM_TEXT.forecastSettled,
      forecastWhy: WAR_ROOM_TEXT.forecastWhy,
      chainHealthy: WAR_ROOM_TEXT.chainHealthy,
      chainMissing: WAR_ROOM_TEXT.chainMissing,
      chainUnreachable: WAR_ROOM_TEXT.chainUnreachable,
      chainUnstated: WAR_ROOM_TEXT.chainUnstated,
      commitmentClear: WAR_ROOM_TEXT.commitmentClear,
      commitmentOverdue: WAR_ROOM_TEXT.commitmentOverdue,
      priceClean: WAR_ROOM_TEXT.priceClean,
      pricePending: WAR_ROOM_TEXT.pricePending,
      settleReason: WAR_ROOM_TEXT.settleReason,
      applyCategoryReason: WAR_ROOM_TEXT.applyCategoryReason,
      approveReason: WAR_ROOM_TEXT.approveReason,
      stateRolesReason: WAR_ROOM_TEXT.stateRolesReason,
      adjudicateReason: WAR_ROOM_TEXT.adjudicateReason,
    },
    now: briefNow,
  });

  // Rival mentions, found in the notes rather than inferred. The words are the
  // evidence; naming an opponent nobody wrote down would be fabrication.
  const rivalMentions = (interactions.ok ? interactions.value : [])
    .filter((n: { rawNote: string }) =>
      POSITION_TEXT.rivalWords.some((w) => n.rawNote.includes(w)),
    )
    .slice(0, 3)
    .map((n) => ({
      id: n.id,
      when: n.occurredAt.toISOString().slice(0, 10),
      text: n.rawNote,
    }));

  const canRecord = can(
    fieldCtx.holder,
    fieldCtx.entitlement,
    "account.upsert",
    "data",
  ).allowed;

  const probability = probabilityDisplay(opportunity);
  const metrics: MetricGridItem[] = [
    {
      id: "amount",
      label: OPPORTUNITY_TEXT.amount,
      value: formatMoney(
        opportunity.amount?.amount ?? null,
        opportunity.currency,
      ),
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
      label: opportunity.closedAt
        ? OPPORTUNITY_TEXT.closedAt
        : OPPORTUNITY_TEXT.expectedClose,
      value:
        (opportunity.closedAt ?? opportunity.expectedCloseAt)
          ?.toISOString()
          .slice(0, 10) ?? "-",
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
      {/* THE WAY BACK. With the board gone this page carries no navigation of
          its own, and returning to the list is the most common next action. */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/pipeline">
              {PIPELINE_TEXT.title}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{opportunity.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <ViewHeader
        secondary={opportunity.opportunityNo}
        icon="table"
        title={opportunity.name}
        description={accountName}
        action={
          <>
            <StatusBadge tone={STAGE_TONE[opportunity.stage as Stage]} dot>
              {STAGE_LABEL[opportunity.stage as Stage] ?? opportunity.stage}
            </StatusBadge>
            <StatusBadge
              tone={
                FORECAST_TONE[opportunity.forecastCategory as ForecastCategory]
              }
            >
              {FORECAST_LABEL[opportunity.forecastCategory as ForecastCategory]}
            </StatusBadge>
          </>
        }
      />

      {/* Whose position this is. A strategic account is a different kind of
          pursuit from a one-off deal, and the page should say which before it
          says anything else. */}
      <div className="flex flex-wrap items-center gap-xs">
        <StatusBadge
          tone={
            tier === "strategic"
              ? "brand"
              : tier === "key"
                ? "warning"
                : "neutral"
          }
        >
          {tier === "strategic"
            ? POSITION_TEXT.tierStrategic
            : tier === "key"
              ? POSITION_TEXT.tierKey
              : POSITION_TEXT.tierStandard}
        </StatusBadge>
        {plan ? (
          <>
            <StatusBadge tone="neutral">
              {POSITION_TEXT.planOf(plan.period)}
            </StatusBadge>
            <span className="text-muted-foreground text-body-sm">
              {POSITION_TEXT.triangleOf(
                plan.ownerSub ?? POSITION_TEXT.roleUnset,
                plan.presalesSub ?? POSITION_TEXT.roleUnset,
                plan.deliverySub ?? POSITION_TEXT.roleUnset,
              )}
            </span>
          </>
        ) : null}
      </div>

      {/* columns={2}: the DS's breakpoints watch the viewport while this grid
          sits in a pane of viewport minus a fixed 400px deck. Four money
          figures across that pane clip, and a clipped figure is not a smaller
          number - it is a wrong one that looks exact. */}
      <MetricGrid items={metrics} columns={2} />

      {/* THE WAR ROOM - 判决 → 建议 → 动作 (owner ruling 2026-09-05). Above the
          position brief because the verdict is what the person came to check;
          the evidence panels below are where they go to argue with it. Each
          card is its own client island binding one server action and one error
          dictionary - the granularity reachable-codes.test.ts pairs at. */}
      <WarRoom cells={brief.cells}>
        {brief.actions.map((a) => {
          switch (a.kind) {
            case "apply_category":
              return (
                <CategoryActionCard
                  key="apply-category"
                  opportunityId={id}
                  to={a.to}
                  severity={a.severity}
                  reason={a.reason}
                  onApply={applySuggestedCategory}
                />
              );
            case "settle_commitment":
              return (
                <CommitmentActionCard
                  key={`settle-${a.commitmentId}`}
                  accountId={opportunity.accountId}
                  opportunityId={id}
                  commitmentId={a.commitmentId}
                  statement={a.statement}
                  severity={a.severity}
                  reason={a.reason}
                  onSettle={settleCommitment}
                />
              );
            case "state_roles":
              return (
                <LinkActionCard
                  key="state-roles"
                  severity={a.severity}
                  title={WAR_ROOM_TEXT.stateRolesTitle}
                  reason={a.reason}
                  href="#buying-roles"
                  cta={WAR_ROOM_TEXT.stateRolesCta}
                />
              );
            case "approve_discount":
              return (
                <LinkActionCard
                  key="approve-discount"
                  severity={a.severity}
                  title={WAR_ROOM_TEXT.approveTitle(a.pendingLines)}
                  reason={a.reason}
                  href="#lines"
                  cta={WAR_ROOM_TEXT.approveCta}
                />
              );
            case "adjudicate":
              return (
                <ProposalActionCard
                  key="adjudicate"
                  proposals={brief.actions
                    .filter((x) => x.kind === "adjudicate")
                    .flatMap((x) => (x.kind === "adjudicate" ? x.proposalIds : []))
                    .map((pid) => {
                      const src = (proposals.ok ? proposals.value : []).find((p) => p.id === pid);
                      return {
                        id: pid,
                        title: src ? (POSITION_TEXT.actionLabels[src.actionType] ?? src.actionType) : pid,
                      };
                    })}
                  severity={a.severity}
                  reason={a.reason}
                  onAdjudicate={adjudicateProposals}
                />
              );
          }
        })}
        {/* AI 分析辅助: composed question, person presses send. The copilot
            page grounds the account evidence server-side behind its own gate;
            the URL carries only the question text and the account id. */}
        <LinkActionCard
          severity="good"
          title={WAR_ROOM_TEXT.analyseTitle}
          reason={WAR_ROOM_TEXT.analyseReason}
          href={`/copilot?account=${opportunity.accountId}&ask=${encodeURIComponent(
            WAR_ROOM_TEXT.analyseQuestion(
              opportunity.name,
              brief.cells.filter((c) => c.tone !== "good").length,
            ),
          )}`}
          cta={WAR_ROOM_TEXT.analyseCta}
        />
      </WarRoom>

      <PositionBrief
        projects={(projects.ok ? projects.value : []).map((pr) => ({
          id: pr.id,
          name: pr.name,
          health: pr.health,
          href: `/delivery`,
        }))}
        rivalMentions={rivalMentions}
        problems={problems}
        proposals={positionProposals}
      />

      {/* THE FULL CHAIN, once (2026-09-05 convergence): who is who ON THIS
          DEAL, by name, with reachability - replacing the four bare counts the
          brief used to carry. The relationship EDITOR stays on the account
          page: the graph is the customer's, not any one deal's. */}
      {dealChain ? (
        <DecisionChain
          title={CHAIN_TEXT.forDeal(opportunity.name)}
          coverage={dealChain.coverage}
          contacts={dealChain.people}
        />
      ) : null}

      {/* THE ONLY CONTROL IN THE PRODUCT THAT WRITES A BUYING ROLE - incr/0027.
          It sits on a deal because that is the only place the question has an
          answer, and it renders directly under the chain it changes. Before
          this batch the same question was asked on the customer's roster and
          one answer there was applied to every deal at once. */}
      <BuyingRoleForm
        opportunityId={opportunity.id}
        accountId={opportunity.accountId}
        people={(account.ok ? account.value.contacts : []).map((c) => {
          const stated = (roles.ok ? roles.value : []).find((r) => r.personId === c.id);
          return {
            id: c.id,
            name: c.name,
            buyingRole: stated?.buyingRole ?? "unknown",
            influence: stated?.influence ?? null,
          };
        })}
        canEdit={
          can(session.authz, session.entitlement, "account.contact.upsert", "ui").allowed
        }
        onSave={saveBuyingRole}
      />

      {/* A SMALL FACT BESIDE A SHORT LIST. Both are read, neither is a grid
          and neither is a form, which is what makes them safe to pair - the
          account page learned that a panel which lays itself out across a width
          cannot be given half of one. The two forms below stay full width for
          that reason. */}
      <div className="grid gap-lg xl:grid-cols-2">
        <Section
          title={OPPORTUNITY_TEXT.account}
          description={OPPORTUNITY_TEXT.attributionFrozen}
        >
          {/* The href is the ID and the label is the NAME. They were both the id,
              so the page printed "acc_demo_1" where the customer's name belongs. */}
          <Link href={`/account/${opportunity.accountId}`}>{accountName}</Link>
          <div>
            <span>{OPPORTUNITY_TEXT.campaign}: </span>
            {opportunity.campaignId ? (
              <StatusBadge tone="neutral">{opportunity.campaignId}</StatusBadge>
            ) : (
              // A blank cell would read as missing data. Not every deal starts as
              // a campaign response, and that is a fact rather than a gap.
              <StatusBadge tone="neutral">
                {OPPORTUNITY_TEXT.noAttribution}
              </StatusBadge>
            )}
          </div>
        </Section>

        {/* RecordFollowUp IS GONE from here. The deck beside this page is
            anchored to this deal and captures against it; two capture boxes on
            one screen is not a convenience, it is a question about which one is
            real. The old note argued capture should sit above the controls that
            move the deal - that argument is now served better, because the deck
            is beside them rather than above them and never scrolls away. */}

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
            captureHref={`/capture?account=${opportunity.accountId}&opportunity=${id}&back=/pipeline/${id}`}
            onSettle={settleCommitment}
          />
        ) : null}
      </div>

      {/* BEFORE the commercial terms, because the lines DECIDE the amount that
          the terms panel then shows. Reading them the other way round would put
          the derived number above the thing it is derived from. */}
      <LineEditor
        opportunityId={id}
        lines={(lineRows.ok ? lineRows.value : [])
          .filter((l) => l.opportunityId === id)
          .map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: l.amount,
            needsApproval: l.needsApproval,
            approved: l.approved,
          }))}
        products={(productRows.ok ? productRows.value : []).map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
        }))}
        // READ VIEW since 2026-09-05: the 418-line editor moved to
        // /pipeline/[id]/lines (owner ruling - the heaviest content operation
        // left inline). Display stays with the context; the link below is the
        // way in. Approving stays HERE despite being editing-adjacent, because
        // approval is a flow op made looking at the line - see canApprove.
        canEdit={false}
        canApprove={
          can(
            session.authz,
            session.entitlement,
            "pipeline.discount.approve",
            "ui",
          ).allowed
        }
        closed={opportunity.closedAt !== null}
        onSave={saveOpportunityLines}
        onApprove={approveDiscount}
      />
      {can(
        session.authz,
        session.entitlement,
        "pipeline.opportunity.update",
        "ui",
      ).allowed && opportunity.closedAt === null ? (
        <NewEntryLink href={`/pipeline/${id}/lines`} label={OPPORTUNITY_TEXT.linesEdit} />
      ) : null}

      <DealTerms
        opportunityId={id}
        stage={opportunity.stage}
        amount={opportunity.amount?.amount ?? null}
        currency={opportunity.currency}
        probability={opportunity.probability}
        expectedCloseAt={opportunity.expectedCloseAt}
        forecastCategory={opportunity.forecastCategory}
        canEdit={
          can(
            session.authz,
            session.entitlement,
            "pipeline.opportunity.update",
            "ui",
          ).allowed
        }
        // The bucket is a pro capability the catalog withholds from the rep who
        // owns the deal, so it gets its own gate rather than riding on the
        // editing one.
        canCategorize={
          can(
            session.authz,
            session.entitlement,
            "pipeline.forecast.categorize",
            "ui",
          ).allowed
        }
        onSave={repriceOpportunity}
      />

      <StageControl
        opportunityId={id}
        stage={opportunity.stage}
        probability={opportunity.probability}
        canAdvance={
          can(
            session.authz,
            session.entitlement,
            "pipeline.opportunity.advance",
            "ui",
          ).allowed
        }
        onAdvance={advanceOpportunityStage}
      />

      {/* Deliberately adjacent to the stage journey. One says what we recorded
          about the deal's state, the other says what actually happened - and a
          deal that advanced two stages with nothing beside it in the timeline
          is the single most useful thing this page can show a manager. */}
      {interactions.ok ? (
        <InteractionTimeline items={interactions.value} limit={5} />
      ) : null}

      {history.ok ? (
        <StageJourney events={history.value} />
      ) : (
        <EmptyState
          title={SHELL_TEXT.loadFailed}
          description={loadFailureText(history.violations, LOAD_ERROR)}
        />
      )}
    </ViewLayout>
  );
}
