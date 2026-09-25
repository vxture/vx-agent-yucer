import Link from "next/link";
import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { resolveLocale } from "../../lib/i18n/locale";
import { BOARD_PANE_CLASS, CENTRE_PANE_CLASS } from "../../lib/sidebar-slot";
import {
  FORECAST_TONE,
  STAGE_TONE,
  compactParts,
  formatMoney,
  probabilityDisplay,
  stageLabelFor,
} from "../../lib/view-model";
import { can } from "../../../authz/decide";
import {
  getCatalogStore,
  getCopilotStore,
  getDeliveryStore,
  getFieldStore,
  getPlanningStore,
  getStrategyStore,
} from "../../../domains/shared/registry";
import {
  getOpportunityDetail,
  listBusinessForms,
  listContractTypes,
  listPipeline,
  listStageDefinitions,
  stageHistory,
  claimHistory,
  evidenceOf,
  dealExit,
  listWinLossReasons,
  stallRules,
  winLossReviewOf,
} from "../../../domains/pipeline/service";
import { toStageCatalog } from "../../../domains/pipeline/store";
import {
  getAccountDetail,
  decisionChainsByOpportunity,
  buyingRolesFor,
  recomputeHealth,
} from "../../../domains/account/service";
import { listTerritories } from "../../../domains/planning/service";
import { listContracts, listProjects, projectView } from "../../../domains/delivery/service";
import { dealShare } from "../../../domains/pipeline/lib/wallet-share";
import { DealWalletLine } from "../../components/wallet-share";
import { listProposals } from "../../../domains/copilot/service";
import { cachedFeed } from "../../lib/board";
import { saveBuyingRole } from "../buying-role-action";
import { getAuthzStore } from "../../../authz/store";
import { listCampaigns } from "../../../domains/strategy/service";
import { nameCitations } from "../../lib/name-citations";
import { dealBrief } from "../../../domains/pipeline/lib/brief";
import { WarRoom } from "../../components/war-room";
import { DealReview } from "../../components/deal-review";
import { recordReview } from "../winloss-action";
import { CategoryActionCard } from "../../components/category-action-card";
import { CommitmentActionCard } from "../../components/commitment-action-card";
import { LinkActionCard } from "../../components/link-action-card";
import { applySuggestedCategory } from "../../forecast/actions";
import { DealJudgements, RivalMentions } from "../../components/position-brief";
import type { ForecastCategory } from "../../../domains/pipeline/lib/forecast";
import { DEFAULT_STAGE_DEFINITIONS, type Stage } from "../../../domains/pipeline/lib/stage";
import { DealTerms } from "../../components/deal-terms";
import { LineEditor } from "../../components/line-editor";
import {
  abandonDeal,
  advanceOpportunityStage,
  approveDiscount,
  repriceOpportunity,
  saveOpportunityLines,
} from "../stage-action";
import {
  listOpportunityLines,
  listSolutions,
  listProducts as listCatalogProducts,
  listProductUnits as listCatalogUnits,
} from "../../../domains/catalog/service";
import { ChangeHistory } from "../../components/change-history";
import { EvidenceSlots, type EvidenceRow } from "../../components/evidence-slots";
import { AdvisorFinding } from "../../components/advisor-finding";
import { adjudicateProposals } from "../../copilot/actions";
import { EVIDENCE_ACTION_TYPE } from "../../../domains/copilot/lib/action";
import { canDecideProposal } from "../../../domains/copilot/lib/advisor-gate";
import { recordEvidenceAction } from "../evidence-action";
import { PROCESS_SLOTS, REASON_SLOTS, type EvidenceSlot } from "../../../domains/pipeline/lib/evidence";
import { suggestCategory } from "../../../domains/pipeline/lib/forecast-rule";
import { InteractionTimeline } from "../../components/interaction-timeline";
import { CommitmentList } from "../../components/commitment-list";
import {
  chainRecency,
  listCommitments,
  listInteractions,
} from "../../../domains/account/field-service";
import { settleCommitment } from "../../account/field-actions";
import { loadFailureText } from "../../lib/load-failure";
import { Tag } from "../../components/tag";
import { AmountCoin, DimensionStat } from "../../components/dimension-stat";
import { DealEditProvider } from "../../components/deal-edit-context";
import { DealRolesDrawer } from "../../components/deal-roles-drawer";
import { DealStageDrawer } from "../../components/deal-stage-drawer";
import {
  DealCustomerPanel,
  DealDecisionPanel,
  DealDossierPanel,
  DealHeaderMenu,
  DealPanel,
  DealSolutionPanel,
  PanelSub,
} from "../../components/deal-panels";

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
    EXIT_REASON_LABEL,
    CHANNEL_LABEL,
    LOAD_ERROR,
    DOMAIN_LABEL,
    DEAL_PAGE_TEXT,
    COLLAPSE_TEXT,
    WALLET_TEXT,
    ACCOUNT_TEXT,
    DECISION_ROLE_LABEL,
    STANCE_LABEL,
    PANEL_MENU_TEXT,
  } = await getMessages();
  const { id } = await params;
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.

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
    // Both panes even here: the shell leaves them to this route.
    return (
      <>
        <aside className={BOARD_PANE_CLASS} />
        <div className={CENTRE_PANE_CLASS}>
          <EmptyState title={SHELL_TEXT.loadFailed} description={OPPORTUNITY_TEXT.notFound} />
        </div>
      </>
    );
  }
  const opportunity = detail.value;

  const [history, stall, exit, claims] = await Promise.all([
    stageHistory(ctx, id),
    stallRules(ctx),
    // Why it ended, for a lost or abandoned deal (YC-065 R6).
    opportunity.status === "lost" || opportunity.status === "abandoned" ? dealExit(ctx, id) : Promise.resolve(null),
    // 声明变更日志 and slippage (incr/0084, YC-065 R2).
    claimHistory(ctx, id),
  ]);
  // 购买证据槽 (incr/0085).
  const evidence = await evidenceOf(ctx, id);

  // NAMES, NOT IDS (polish, 2026-09-24): the owner card printed usr_demo_m010,
  // the plan triangle three raw subs and 来源战役 camp_demo_1. The member
  // directory and the campaign list are the same reads the customer page and
  // /strategy already make; a refused campaign read keeps the id rather than
  // inventing a name.
  const memberNameOf = new Map(
    (await getAuthzStore().listMembers(session.workspaceId)).map((m) => [m.sub, m.displayName]),
  );
  const nameOf = (sub: string | null) => (sub ? (memberNameOf.get(sub) ?? sub) : null);
  const campaignsRead = opportunity.campaignId
    ? await listCampaigns({ ...ctx, store: getStrategyStore() }).catch(() => null)
    : null;
  const campaignName = opportunity.campaignId
    ? ((campaignsRead?.ok ? campaignsRead.value.find((c) => c.id === opportunity.campaignId)?.name : null) ??
      opportunity.campaignId)
    : null;

  // 钱包份额 (§9.6): a won deal counts its signed contracts, so they are read
  // for it - through the delivery service's own gate; a refused or failed read
  // falls back to the deal amount, which is what dealOurs does with none.
  const walletContracts =
    opportunity.status === "won"
      ? await listContracts({ ...ctx, store: getDeliveryStore() }, { accountId: opportunity.accountId }).catch(() => null)
      : null;
  const walletShareOfDeal = dealShare(
    {
      id: opportunity.id,
      status: opportunity.status,
      currency: opportunity.currency,
      amount: opportunity.amount?.amount ?? null,
      budget: opportunity.customerBudget ?? null,
    },
    walletContracts?.ok ? walletContracts.value : [],
  );

  // Built here rather than inline in DealTerms' props: reachable-codes.test
  // binds an action to the nearest JSX tag above it, and an inline element
  // there would claim DealTerms' onSave.
  const walletLine = (
    <DealWalletLine
      share={walletShareOfDeal}
      currency={opportunity.currency}
      byName={nameOf(opportunity.customerBudgetBySub ?? null)}
      at={opportunity.customerBudgetAt ? opportunity.customerBudgetAt.toISOString().slice(0, 10) : null}
    />
  );

  // Everything the position brief needs. Each read goes through its domain's
  // own service, so this page cannot show what another page would refuse.
  const accountCtx = { ...ctx, store: session.stores.account() };
  // The catalogue reads go through the SERVICE, like every other cross-domain
  // read on this page - a store handle here would skip both gates.
  const catalogCtx = { ...ctx, store: getCatalogStore() };
  const [account, chain, roles, projects, feed, proposals, lineRows, productRows, unitRows, stageRows, contractTypeRows, businessFormRows] =
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
      listCatalogUnits(catalogCtx),
      listStageDefinitions(ctx),
      listContractTypes(ctx),
      listBusinessForms(ctx),
    ]);
  const unitName = new Map(
    (unitRows.ok ? unitRows.value : []).map((u) => [u.id, u.name]),
  );
  // The workspace's own stage catalog (incr/0057) - falls back to the shipped
  // seven only if the gate somehow refuses here, which it should not: anyone
  // who can view this deal already holds pipeline.read, and pipeline.stage.view
  // resolves to the same permission.
  const stageDefinitions = stageRows.ok ? toStageCatalog(stageRows.value) : DEFAULT_STAGE_DEFINITIONS;
  // incr/0067 - the workspace's own two catalogs, for the pickers. Empty
  // rather than defaulted on a gate refusal: unlike the stage catalog, an
  // opportunity has no fallback on either axis that needs a matching row.
  const contractTypes = contractTypeRows.ok ? contractTypeRows.value : [];
  const businessForms = businessFormRows.ok ? businessFormRows.value : [];
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
  // 客户上下文 (YC-070 S1): the customer's health and whether it hangs on one
  // person, read-only, linking to the customer page - nothing about the
  // customer is edited from a deal.
  // Derived exactly as the customer page derives it (persist: false - a read
  // must not write), so the two pages cannot show different numbers; the
  // stored column is not kept current.
  const healthRead = opportunity.accountId
    ? await recomputeHealth(accountCtx, opportunity.accountId, { persist: false }).catch(() => null)
    : null;
  const accountHealth = healthRead?.ok ? healthRead.value.score : null;
  const accountSingleThread = (feed.ok ? feed.value.judgements : []).some(
    (j) => j.id === `singlethread:${opportunity.accountId}`,
  );
  // 结局与复盘, in place on a closed deal (YC-065 R7).
  const closedDeal = opportunity.status !== "open";
  const [review, reviewReasons] = closedDeal
    ? await Promise.all([winLossReviewOf(ctx, id), listWinLossReasons(ctx)])
    : [null, null];

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
    .map((j) => ({
      id: j.id,
      claim: j.claim,
      rule: j.rule ?? null,
      // 证据新鲜度 + 判断到证据跳转 (YC-021 底座): the same judgement reads the
      // same here as on the home and customer pages - dropping these two made
      // an old claim look current and an evidenced one look asserted.
      freshness: j.freshness ?? null,
      source: j.source,
      citations: nameCitations(j.citations, (s) => memberNameOf.get(s)),
    }));

  // THE DERIVED HEALTH, as on the customer page (#378): an overdue instalment
  // or a missed milestone pulls a reported green down, and the stored column
  // does not know that. An unreadable view falls back to what was reported.
  const projectHealth = await Promise.all(
    (projects.ok ? projects.value : []).map(async (pr) => {
      const pv = await projectView({ ...ctx, store: getDeliveryStore() }, pr.id);
      return pv.ok ? pv.value.derivedHealth : pr.health;
    }),
  );

  // THIS DEAL'S OWN, not the customer's (YC-021 L6 客户级与商机级分层). The
  // customer's relationship proposals used to be mixed in here as if they
  // were moves on this deal; they belong on the customer page, and this page
  // says how many are waiting there and links to them.
  const accountLevelCount = opportunity.accountId
    ? (proposals.ok ? proposals.value : []).filter((a) => a.subjectId === opportunity.accountId).length
    : 0;
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
  // For 卡在谁身上: names for the people a commitment or the chain points at,
  // and when anyone last spoke with this deal's buyers.
  const contactName = new Map((account.ok ? account.value.contacts : []).map((c) => [c.id, c.name]));
  const buyerRecency =
    opportunity.accountId && dealChain
      ? await chainRecency(fieldCtx, opportunity.accountId, dealChain.people, [], { now: briefNow })
      : ({ ok: false } as const);
  const brief = dealBrief({
    deal: {
      id,
      stage: opportunity.stage,
      forecastCategory: opportunity.forecastCategory,
      probability: opportunity.probability,
      expectedCloseAt: opportunity.expectedCloseAt,
      lastStageChangeAt,
      status: opportunity.status,
      // The workspace's own stall line for this deal's business form (R3) -
      // the same resolution the forecast review uses, so the two screens
      // cannot disagree about whether this deal is stalled.
      stallDaysOverride: stall.ok ? stall.value.overrideFor(opportunity.businessFormId) : null,
    },
    thresholds: stall.ok ? stall.value.thresholds : undefined,
    stageCatalog: stall.ok ? stall.value.stageCatalog : undefined,
    chain: cov,
    rolesStated: roles.ok && roles.value.length > 0,
    commitments: (commitments.ok ? commitments.value : []).map((c) => ({
      id: c.id,
      direction: c.direction,
      status: c.status,
      dueAt: c.dueAt,
      statement: c.statement,
      counterpartName: c.counterpartContactId ? (contactName.get(c.counterpartContactId) ?? null) : null,
    })),
    economicBuyers: (dealChain?.people ?? [])
      .filter((p) => p.decisionRole === "economic" && p.status === "active")
      .map((p) => ({
        name: contactName.get(p.id) ?? CHAIN_TEXT.unnamedPerson,
        lastContactAt: buyerRecency.ok ? (buyerRecency.value.lastContactAt.get(p.id) ?? null) : null,
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
      stallOnUs: WAR_ROOM_TEXT.stallOnUs,
      stallOnThem: WAR_ROOM_TEXT.stallOnThem,
      stallOnBuyer: WAR_ROOM_TEXT.stallOnBuyer,
      stallUnknown: WAR_ROOM_TEXT.stallUnknown,
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

  // ---- 栏1 ----------------------------------------------------------------
  // THE DEAL PAGE IS THE CUSTOMER PAGE'S SIBLING (deal batch 2; owner,
  // 2026-09-25: 参考客户详情页样式, 这两个是同一级别的). Same two panes rendered
  // by the page itself (lib/sidebar-slot.ts), same panel grammar: 栏1 holds
  // what stays still while the deal is worked (交易档案 / 决策流程 / 客户引用;
  // 产品方案 joins in 2b), 栏2 what changes (YC-069). Every fact in one place:
  // the old metric strip (amount, win rate, close date, owner) and the header
  // tags are gone - each figure now sits in the one panel that owns it.
  const locale = await resolveLocale();
  const probability = probabilityDisplay(opportunity, stageDefinitions);
  const canEditTerms = can(session.authz, session.entitlement, "pipeline.opportunity.update", "ui").allowed;
  const linesHref = canEditTerms && opportunity.closedAt === null ? `/pipeline/${id}/lines` : null;
  const amountValue = opportunity.amount?.amount ?? null;
  const amountParts = amountValue !== null ? compactParts(amountValue, opportunity.currency, locale) : null;
  const territoryRead = opportunity.territoryId
    ? await listTerritories({ ...ctx, store: getPlanningStore() }).catch(() => null)
    : null;
  const territoryName = opportunity.territoryId
    ? ((territoryRead?.ok ? territoryRead.value.find((t) => t.id === opportunity.territoryId)?.name : null) ?? null)
    : null;
  const tierLabel =
    tier === "strategic" ? POSITION_TEXT.tierStrategic : tier === "key" ? POSITION_TEXT.tierKey : POSITION_TEXT.tierStandard;
  const nameOfType = (list: readonly { id: string; name: string }[], typeId: string | null | undefined) =>
    typeId ? (list.find((t) => t.id === typeId)?.name ?? null) : null;
  const contractTypeName = nameOfType(contractTypes, opportunity.contractTypeId);
  const businessFormName = nameOfType(businessForms, opportunity.businessFormId);
  const notSet = <span className="text-muted-foreground">{DEAL_PAGE_TEXT.notSet}</span>;

  const dossierBadges = (
    <div className="flex items-center justify-center gap-md">
      <DimensionStat
        figure={
          <AmountCoin
            figure={amountParts ? amountParts.figure : null}
            label={`${DEAL_PAGE_TEXT.amountLabel} ${formatMoney(amountValue, opportunity.currency)}`}
          />
        }
        label={DEAL_PAGE_TEXT.amountLabel}
        value={
          amountValue === null
            ? DEAL_PAGE_TEXT.amountNone
            : `${formatMoney(amountValue, opportunity.currency)}${amountParts ? ` · ${POSITION_TEXT.amountUnit(amountParts.unit, amountParts.currency)}` : ""}`
        }
      />
    </div>
  );
  const dossierFacts = [
    {
      label: DEAL_PAGE_TEXT.factCustomer,
      value: opportunity.accountId ? (
        <span className="inline-flex items-center gap-xs" title={OPPORTUNITY_TEXT.attributionFrozen}>
          <Link href={`/account/${opportunity.accountId}`} className="truncate hover:underline">
            {accountName}
          </Link>
          <Tag tone={tier === "strategic" ? "brand" : tier === "key" ? "warning" : "neutral"}>{tierLabel}</Tag>
        </span>
      ) : (
        notSet
      ),
    },
    { label: DEAL_PAGE_TEXT.factOwner, value: nameOf(opportunity.ownerSub) ?? notSet },
    { label: DEAL_PAGE_TEXT.factContractType, value: contractTypeName ?? notSet },
    { label: DEAL_PAGE_TEXT.factBusinessForm, value: businessFormName ?? notSet },
    {
      label: DEAL_PAGE_TEXT.factSource,
      // Attribution is frozen (no UPDATE grant); the tooltip says so rather
      // than an edit that would fail at the database.
      value: (
        <span title={OPPORTUNITY_TEXT.attributionFrozen}>
          {campaignName ? DEAL_PAGE_TEXT.sourceCampaign(campaignName) : DEAL_PAGE_TEXT.sourceDirect}
        </span>
      ),
    },
  ];
  const dossierMore = [
    ...(territoryName ? [{ label: DEAL_PAGE_TEXT.factTerritory, value: territoryName }] : []),
    { label: DEAL_PAGE_TEXT.factCreated, value: opportunity.createdAt.toISOString().slice(0, 10) },
    {
      label: DEAL_PAGE_TEXT.factBudget,
      value:
        opportunity.customerBudget != null ? formatMoney(opportunity.customerBudget, opportunity.currency) : notSet,
    },
    { label: WALLET_TEXT.title, value: walletLine },
    ...(plan
      ? [
          {
            label: DEAL_PAGE_TEXT.factTeam,
            value: `${nameOf(plan.presalesSub) ?? POSITION_TEXT.roleUnset} / ${nameOf(plan.deliverySub) ?? POSITION_TEXT.roleUnset}`,
          },
        ]
      : []),
  ];
  const dossierSummary = [
    opportunity.opportunityNo,
    accountName,
    amountValue === null ? DEAL_PAGE_TEXT.amountNone : formatMoney(amountValue, opportunity.currency),
  ].join(COLLAPSE_TEXT.separator);

  // 产品方案 (YC-069 §04b): the combination and this deal's customisation,
  // no prices. The source is the solution the lines were expanded from
  // (opportunity_line.solution_id, provenance only); a refused catalogue read
  // shows the combination without naming its source rather than guessing.
  const solutionLines = (lineRows.ok ? lineRows.value : []).filter((l) => l.opportunityId === id);
  const sourceId = solutionLines.find((l) => l.solutionId)?.solutionId ?? null;
  const solutionsRead = sourceId ? await listSolutions(catalogCtx).catch(() => null) : null;
  const sourceView = sourceId && solutionsRead?.ok ? (solutionsRead.value.find((v) => v.solution.id === sourceId) ?? null) : null;
  const productName = new Map((productRows.ok ? productRows.value : []).map((p) => [p.id, p]));
  const solutionRows = solutionLines.map((l) => {
    const product = productName.get(l.productId);
    const item = sourceView && l.solutionId === sourceId ? sourceView.items.find((i) => i.productId === l.productId) : undefined;
    return {
      id: l.id,
      product: product?.name ?? l.productId,
      quantity: `${l.quantity} ${product ? (unitName.get(product.unitId) ?? "") : ""}`.trim(),
      optional: item ? item.optional : null,
      customNote: l.customNote,
    };
  });
  const solutionSummary =
    solutionRows.length === 0
      ? DEAL_PAGE_TEXT.solutionNone
      : [
          sourceView ? sourceView.solution.name : DEAL_PAGE_TEXT.solutionCustom,
          DEAL_PAGE_TEXT.solutionItems(solutionRows.length),
          ...(solutionRows.some((r) => r.optional) ? [DEAL_PAGE_TEXT.solutionOptionalCount(solutionRows.filter((r) => r.optional).length)] : []),
          ...(solutionRows.some((r) => r.customNote) ? [DEAL_PAGE_TEXT.solutionCustomCount(solutionRows.filter((r) => r.customNote).length)] : []),
        ].join(COLLAPSE_TEXT.separator);

  // 决策流程: the people on THIS deal, as the customer page's contact cards.
  const contactOf = new Map((account.ok ? account.value.contacts : []).map((c) => [c.id, c]));
  const warmIds = new Set(buyerRecency.ok ? buyerRecency.value.warm.map((c) => c.id) : []);
  const chainPeople = (dealChain?.people ?? []).filter((p) => p.status === "active");
  const decisionPeople = chainPeople.map((p) => {
    const c = contactOf.get(p.id);
    const name = c?.name ?? CHAIN_TEXT.unnamedPerson;
    const last = buyerRecency.ok ? (buyerRecency.value.lastContactAt.get(p.id) ?? null) : null;
    const days = last ? Math.max(0, Math.floor((briefNow.getTime() - last.getTime()) / 86_400_000)) : null;
    return {
      id: p.id,
      name,
      role: DEAL_PAGE_TEXT.decisionRole(c?.title ?? null, DECISION_ROLE_LABEL[p.decisionRole] ?? p.decisionRole),
      stance: p.stance
        ? {
            label: STANCE_LABEL[p.stance] ?? p.stance,
            tone: (p.stance === "champion" || p.stance === "supporter"
              ? "success"
              : p.stance === "antagonist"
                ? "danger"
                : "neutral") as "success" | "danger" | "neutral",
          }
        : null,
      recency: buyerRecency.ok
        ? days !== null
          ? {
              text: ACCOUNT_TEXT.contactRecencyDays(days),
              warm: warmIds.has(p.id),
              tooltip: ACCOUNT_TEXT.contactRecencyTooltip(name, days),
              date: last!.toISOString().slice(0, 10),
            }
          : { text: ACCOUNT_TEXT.contactRecencyUnrecorded, warm: false, tooltip: ACCOUNT_TEXT.contactRecencyTooltipUnrecorded(name) }
        : undefined,
    };
  });
  const hasEconomic = chainPeople.some((p) => p.decisionRole === "economic");
  const decisionWarning = !cov || chainPeople.length === 0
    ? null
    : !hasEconomic
      ? DEAL_PAGE_TEXT.decisionNoEconomic(chainPeople.length)
      : cov.economicBuyerUnreachable
        ? DEAL_PAGE_TEXT.decisionUnreachable(chainPeople.length)
        : null;
  const decisionSummary =
    chainPeople.length === 0
      ? DEAL_PAGE_TEXT.decisionNone
      : [
          decisionWarning ?? DEAL_PAGE_TEXT.decisionReachable(chainPeople.length),
          ...(cov && cov.blockers.length > 0 ? [DEAL_PAGE_TEXT.decisionBlockers(cov.blockers.length)] : []),
        ].join(COLLAPSE_TEXT.separator);

  // 客户引用: read-only, linking out.
  const accountDeals = opportunity.accountId
    ? await listPipeline(ctx, { accountId: opportunity.accountId }).catch(() => null)
    : null;
  const otherOpenDeals = accountDeals?.ok
    ? accountDeals.value.filter((o) => o.status === "open" && o.id !== id).length
    : null;
  const customerRows = [
    { label: DEAL_PAGE_TEXT.customerTier, value: tierLabel },
    {
      label: DEAL_PAGE_TEXT.customerHealth,
      value:
        accountHealth === null ? (
          notSet
        ) : (
          <span className="inline-flex items-center gap-xs">
            {accountSingleThread ? <Tag tone="warning">{WAR_ROOM_TEXT.accountSingleThread}</Tag> : null}
            <Tag tone={accountHealth < 40 ? "danger" : accountHealth < 70 ? "warning" : "success"}>{accountHealth}</Tag>
          </span>
        ),
    },
    ...(otherOpenDeals !== null ? [{ label: DEAL_PAGE_TEXT.customerOpenDeals, value: DEAL_PAGE_TEXT.dealsCount(otherOpenDeals) }] : []),
  ];
  const customerSummary = [
    tierLabel,
    ...(accountHealth !== null ? [WAR_ROOM_TEXT.accountHealth(accountHealth)] : []),
    ...(accountSingleThread ? [WAR_ROOM_TEXT.accountSingleThread] : []),
  ].join(COLLAPSE_TEXT.separator);

  // ---- 栏2 ----------------------------------------------------------------
  const findings = brief.cells.filter((c) => c.tone !== "good").length;
  const verdictSummary =
    findings === 0
      ? WAR_ROOM_TEXT.allClear(brief.cells.length)
      : brief.cells
          .filter((c) => c.tone !== "good")
          .map((c) => c.headline)
          .join(COLLAPSE_TEXT.separator);
  const stageText = stageLabelFor(opportunity.stage, stageDefinitions, STAGE_LABEL);
  const daysInStage =
    opportunity.status === "open"
      ? Math.max(0, Math.floor((briefNow.getTime() - (lastStageChangeAt ?? opportunity.createdAt).getTime()) / 86_400_000))
      : null;
  const closeDate = (opportunity.closedAt ?? opportunity.expectedCloseAt)?.toISOString().slice(0, 10) ?? null;
  const slip = claims.ok ? claims.value.slippage : null;
  const progressSummary = [
    DEAL_PAGE_TEXT.progressSummary(stageText, daysInStage),
    ...(probability.value !== null ? [DEAL_PAGE_TEXT.probability(probability.value)] : []),
    ...(closeDate ? [DEAL_PAGE_TEXT.closeOn(closeDate)] : []),
    ...(slip && slip.pushes > 0 ? [DEAL_PAGE_TEXT.slipped(slip.pushes, slip.pushedDays)] : []),
  ].join(COLLAPSE_TEXT.separator);
  const dealLines = (lineRows.ok ? lineRows.value : []).filter((l) => l.opportunityId === id);
  const pendingLines = dealLines.filter((l) => l.needsApproval && !l.approved).length;
  const interactionList = interactions.ok ? interactions.value : [];
  const lastTouch = interactionList.reduce<Date | null>(
    (m, n) => (m === null || n.occurredAt > m ? n.occurredAt : m),
    null,
  );
  const recentTouches = interactionList.filter((n) => briefNow.getTime() - n.occurredAt.getTime() <= 30 * 86_400_000).length;
  const requirement = opportunity.requirement?.trim() || null;

  // 购买证据槽 rows (incr/0085): the latest version per slot, its history, and
  // what it may cite - this deal's follow-ups.
  const noteLabel = new Map(
    interactionList.map((i) => [i.id, `${i.occurredAt.toISOString().slice(0, 10)} ${CHANNEL_LABEL[i.channel] ?? i.channel}`]),
  );
  const shortDate = (d: Date) => d.toISOString().slice(5, 10);
  // 证据抽取's pending proposals, per slot, decided in place (batch 4b).
  const evidenceProposals = (proposals.ok ? proposals.value : []).filter(
    (a) => a.actionType === EVIDENCE_ACTION_TYPE && a.subjectId === id,
  );
  const findingsFor = (slot: EvidenceSlot) => {
    const items = evidenceProposals
      .filter((a) => a.payload.slot === slot)
      .map((a) => ({
        id: a.id,
        text: String(a.payload.statement ?? ""),
        quote: typeof a.payload.quote === "string" ? a.payload.quote : null,
        source: typeof a.payload.interactionId === "string" ? (noteLabel.get(a.payload.interactionId) ?? null) : null,
        decidable: canDecideProposal(session.authz, session.entitlement, a.capability, "ui").allowed,
      }));
    return items.length === 0 ? undefined : <AdvisorFinding items={items} onAdjudicate={adjudicateProposals} />;
  };
  const evidenceRows = (slots: readonly EvidenceSlot[]): EvidenceRow[] =>
    slots.map((slot) => {
      const state = evidence.ok ? evidence.value[slot] : null;
      const cur = state?.current ?? null;
      return {
        slot,
        statement: state?.filled ? cur!.statement : null,
        grounded: state?.grounded ?? false,
        meta: cur && state?.filled ? `${nameOf(cur.authorSub) ?? cur.authorSub} · ${shortDate(cur.recordedAt)}` : null,
        cite: cur?.interactionId ? (noteLabel.get(cur.interactionId) ?? null) : null,
        citeId: cur?.interactionId ?? null,
        accepted: cur?.source === "model_accepted",
        pending: findingsFor(slot),
        history: (state?.history ?? []).slice(1).map((h) => ({
          id: h.id,
          statement: h.statement,
          meta: `${nameOf(h.authorSub) ?? h.authorSub} · ${shortDate(h.recordedAt)}`,
        })),
      };
    });
  const citable = interactionList.map((i) => ({
    id: i.id,
    label: `${noteLabel.get(i.id)} · ${i.rawNote.slice(0, 24)}`,
  }));
  const canRecordEvidence = can(session.authz, session.entitlement, "pipeline.evidence.record", "ui").allowed;
  const reasonRows = evidenceRows(REASON_SLOTS);
  const processRows = evidenceRows(PROCESS_SLOTS);
  const reasonsSummary = [
    DEAL_PAGE_TEXT.reasonsFilled(reasonRows.filter((r) => r.statement).length, reasonRows.length),
    ...(reasonRows.find((r) => r.slot === "status_quo")?.statement ? [DEAL_PAGE_TEXT.statusQuoSignal] : []),
  ].join(COLLAPSE_TEXT.separator);
  // Built here, not inline in DealDecisionPanel's props: reachable-codes.test
  // binds an action to the nearest tag opened before it.
  const processSlots = (
    <EvidenceSlots
      opportunityId={id}
      rows={processRows}
      citable={citable}
      canRecord={canRecordEvidence}
      compact
      onRecord={recordEvidenceAction}
    />
  );
  // The rule's category, for the terms dialog's reason field (YC-065 R9) -
  // the same resolution the brief above used.
  const ruleVerdict = suggestCategory(
    {
      id,
      stage: opportunity.stage,
      forecastCategory: opportunity.forecastCategory,
      probability: opportunity.probability,
      expectedCloseAt: opportunity.expectedCloseAt,
      lastStageChangeAt,
      stallDaysOverride: stall.ok ? stall.value.overrideFor(opportunity.businessFormId) : null,
    },
    briefNow,
    stall.ok ? stall.value.thresholds : undefined,
    stall.ok ? stall.value.stageCatalog : undefined,
  );
  const ruleCategory = ruleVerdict.kind === "suggested" ? ruleVerdict.category : null;

  return (
    // TWO PANES, BOTH SERVER-RENDERED - lib/sidebar-slot.ts. DealEditProvider
    // renders no DOM, so the aside and the centre stay direct children of the
    // shell's body row while sharing the editors' state.
    <DealEditProvider
      can={{
        terms: canEditTerms,
        roles:
          can(session.authz, session.entitlement, "account.contact.upsert", "ui").allowed &&
          (account.ok ? account.value.contacts.length : 0) > 0,
        stage: can(session.authz, session.entitlement, "pipeline.opportunity.advance", "ui").allowed,
      }}
    >
      <aside className={BOARD_PANE_CLASS}>
        <div className="flex flex-col gap-lg">
          <DealDossierPanel
            title={opportunity.name}
            opportunityNo={opportunity.opportunityNo}
            badges={dossierBadges}
            summary={dossierSummary}
            facts={dossierFacts}
            more={dossierMore}
            open={opportunity.status === "open"}
          />
          <DealSolutionPanel
            source={sourceView ? sourceView.solution.name : null}
            scenario={sourceView ? sourceView.solution.scenario : null}
            rows={solutionRows}
            summary={solutionSummary}
            editHref={linesHref}
            editHint={opportunity.closedAt !== null ? OPPORTUNITY_TEXT.lineClosedHint : PANEL_MENU_TEXT.noEditRight}
          />
          <DealDecisionPanel
            summary={
              processRows.every((r) => !r.statement)
                ? [decisionSummary, DEAL_PAGE_TEXT.processUnwritten].join(COLLAPSE_TEXT.separator)
                : decisionSummary
            }
            people={decisionPeople}
            warning={decisionWarning}
            process={processSlots}
          />
          {opportunity.accountId ? (
            <DealCustomerPanel
              name={accountName}
              href={`/account/${opportunity.accountId}`}
              summary={customerSummary}
              rows={customerRows}
              projects={(projects.ok ? projects.value : []).map((pr, i) => {
                const h = projectHealth[i] ?? pr.health;
                return { id: pr.id, name: pr.name, tone: h === "red" ? "danger" : h === "amber" ? "warning" : "success" };
              })}
              accountLevel={
                accountLevelCount > 0
                  ? { label: POSITION_TEXT.planAccountLevel(accountLevelCount), href: `/account/${opportunity.accountId}` }
                  : null
              }
            />
          ) : null}
        </div>
      </aside>

      <div className={CENTRE_PANE_CLASS}>
        <ViewLayout>
          <div className="flex min-w-0 flex-col gap-lg">
            {/* Crumbs INSIDE 栏2 (owner, 2026-09-24: 只有 header 可以跨栏), the
                page's editors on the right - the customer page's crumbs row. */}
            <div className="flex items-center justify-between gap-sm">
              <PageCrumbs trail={[{ label: DOMAIN_LABEL.pipeline, href: "/pipeline" }]} current={opportunity.name} />
              <DealHeaderMenu linesHref={linesHref} />
              {/* The editors, shared by the crumbs "⋮" and the panels' own -
                  rendered here so they add no child to the shell's row. */}
              <DealTerms
                opportunityId={id}
                stage={opportunity.stage}
                stageDefinitions={stageDefinitions}
                amount={amountValue}
                currency={opportunity.currency}
                probability={opportunity.probability}
                expectedCloseAt={opportunity.expectedCloseAt}
                forecastCategory={opportunity.forecastCategory}
                canEdit={canEditTerms}
                // The bucket is a pro capability the catalog withholds from the
                // rep who owns the deal, so it has its own gate.
                canCategorize={can(session.authz, session.entitlement, "pipeline.forecast.categorize", "ui").allowed}
                contractTypeId={opportunity.contractTypeId}
                businessFormId={opportunity.businessFormId}
                contractTypes={contractTypes.map((t) => ({ id: t.id, name: t.name }))}
                businessForms={businessForms.map((f) => ({ id: f.id, name: f.name }))}
                // updateCommercialTerms gates these two on the editing gate,
                // not on the vocabulary's own permission (incr/0063).
                canSetDealType={canEditTerms}
                customerBudget={opportunity.customerBudget ?? null}
                suggestedCategory={ruleCategory}
                onSave={repriceOpportunity}
              />
              <DealRolesDrawer
                opportunityId={opportunity.id}
                accountId={opportunity.accountId}
                people={(account.ok ? account.value.contacts : []).map((c) => {
                  const stated = (roles.ok ? roles.value : []).find((r) => r.personId === c.id);
                  return {
                    id: c.id,
                    name: c.name,
                    buyingRole: stated?.buyingRole ?? "unknown",
                    influence: stated?.influence ?? null,
                    stance: stated?.stance ?? null,
                  };
                })}
                canEdit={can(session.authz, session.entitlement, "account.contact.upsert", "ui").allowed}
                onSave={saveBuyingRole}
              />
              <DealStageDrawer
                opportunityId={id}
                stage={opportunity.stage}
                status={opportunity.status}
                probability={opportunity.probability}
                stageDefinitions={stageDefinitions}
                canAbandon={can(session.authz, session.entitlement, "pipeline.opportunity.abandon", "ui").allowed}
                canAdvance={can(session.authz, session.entitlement, "pipeline.opportunity.advance", "ui").allowed}
                onAdvance={advanceOpportunityStage}
                onAbandon={abandonDeal}
              />
            </div>

            {/* 态势判决 - 判决 → 建议 → 动作 (owner ruling 2026-09-05). The five
                cells stand until batch 8's five-dimension cards; the judgements
                and this deal's proposals sit under them, where the verdict is
                argued with. Each action card is its own client island binding
                one server action and one error dictionary. */}
            <DealPanel
              id="verdict"
              icon="target"
              title={WAR_ROOM_TEXT.title}
              summary={verdictSummary}
              viewHref={opportunity.accountId ? `/copilot?account=${opportunity.accountId}` : undefined}
              editHint={PANEL_MENU_TEXT.derived}
            >
              <WarRoom cells={brief.cells} actionsLabel={<PanelSub>{DEAL_PAGE_TEXT.todo}</PanelSub>}>
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
                          href="#buying-roles-panel"
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
                          href="#quote"
                          cta={WAR_ROOM_TEXT.approveCta}
                        />
                      );
                    // "adjudicate" is not rendered here: this deal's proposals
                    // are decided in 栏3 本单参谋 (deal batch 2c) - one place.
                    default:
                      return null;
                  }
                })}
                {/* AI 分析辅助: composed question, person presses send. */}
                <LinkActionCard
                  severity="good"
                  title={WAR_ROOM_TEXT.analyseTitle}
                  reason={WAR_ROOM_TEXT.analyseReason}
                  href={`/copilot?account=${opportunity.accountId}&ask=${encodeURIComponent(
                    WAR_ROOM_TEXT.analyseQuestion(opportunity.name, findings),
                  )}`}
                  cta={WAR_ROOM_TEXT.analyseCta}
                />
              </WarRoom>
              <PanelSub>{DEAL_PAGE_TEXT.judgements}</PanelSub>
              <DealJudgements problems={problems} />
            </DealPanel>

            {/* 结局与复盘, above the progress on a closed deal (YC-072). */}
            {closedDeal ? (
              <DealReview
                opportunityId={id}
                status={opportunity.status}
                entitled={can(session.authz, session.entitlement, "pipeline.winloss.view", "ui").allowed}
                canRecord={can(session.authz, session.entitlement, "pipeline.winloss.record", "ui").allowed}
                exitReason={exit?.ok && exit.value ? (EXIT_REASON_LABEL[exit.value.reasonCode] ?? exit.value.reasonCode) : null}
                review={review?.ok && review.value ? review.value : null}
                reasons={(reviewReasons?.ok ? reviewReasons.value : []).map((r) => ({
                  id: r.id,
                  name: r.name,
                  forWon: r.forWon,
                  forLost: r.forLost,
                }))}
                onRecord={recordReview}
              />
            ) : null}

            {/* 推进进程 - the single home of stage, win rate, close date and the
                forecast bucket; the plan is the two sides' commitments; the
                stage journal is its history. 推进阶段 opens the drawer. */}
            <DealPanel
              id="progress"
              icon="flag"
              title={DEAL_PAGE_TEXT.progressTitle}
              summary={progressSummary}
              tags={
                <>
                  <Tag tone={STAGE_TONE[opportunity.stage as Stage]} dot>
                    {stageText}
                  </Tag>
                  <Tag tone={FORECAST_TONE[opportunity.forecastCategory as ForecastCategory]}>
                    {FORECAST_LABEL[opportunity.forecastCategory as ForecastCategory]}
                  </Tag>
                </>
              }
              editor="stage"
              primary={opportunity.status === "open" ? { label: OPPORTUNITY_TEXT.advanceTitle, editor: "stage" } : undefined}
            >
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-md gap-y-2xs text-body-sm">
                <span>{DEAL_PAGE_TEXT.progressSummary(stageText, daysInStage)}</span>
                <span title={probability.overridden ? PIPELINE_TEXT.probabilityHintOverridden(probability.stageDefault) : PIPELINE_TEXT.probabilityHintDefault}>
                  {probability.value === null ? "-" : DEAL_PAGE_TEXT.probability(probability.value)}
                </span>
                {closeDate ? (
                  <span>{opportunity.closedAt ? `${OPPORTUNITY_TEXT.closedAt} ${closeDate}` : DEAL_PAGE_TEXT.closeOn(closeDate)}</span>
                ) : null}
                {/* 滑动史 (YC-065 R2): pushes beside the date they moved;
                    each push is a row in 变更史 below. */}
                {slip && slip.pushes > 0 ? (
                  <a href="#change-history">
                    <Tag tone={slip.pushes >= 2 || slip.crossedQuarter ? "danger" : "warning"}>
                      {DEAL_PAGE_TEXT.slipped(slip.pushes, slip.pushedDays)}
                    </Tag>
                  </a>
                ) : null}
              </div>
              <PanelSub>{DEAL_PAGE_TEXT.plan}</PanelSub>
              {commitments.ok ? (
                <CommitmentList
                  accountId={opportunity.accountId}
                  opportunityId={id}
                  items={commitments.value}
                  evidence={interactionList.map((i) => ({
                    id: i.id,
                    label: `${i.occurredAt.toISOString().slice(0, 10)} ${CHANNEL_LABEL[i.channel] ?? i.channel}`,
                  }))}
                  canWrite={canRecord}
                  captureHref={`/capture?account=${opportunity.accountId}&opportunity=${id}&back=/pipeline/${id}`}
                  onSettle={settleCommitment}
                  hideTitle
                  hideDescription
                />
              ) : null}
              <span id="change-history" />
              <PanelSub>{DEAL_PAGE_TEXT.history}</PanelSub>
              {history.ok ? (
                <ChangeHistory
                  claims={claims.ok ? claims.value.events : []}
                  stages={history.value}
                  stageDefinitions={stageDefinitions}
                  actorNames={Object.fromEntries([...memberNameOf].filter((e): e is [string, string] => e[1] != null))}
                  categoryLabel={FORECAST_LABEL}
                />
              ) : (
                <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(history.violations, LOAD_ERROR)} />
              )}
            </DealPanel>

            {/* 购买理由 (YC-069 §07) - why they would buy, and the pull of doing
                nothing: 痛点 / 量化价值 / 不作为 (购买证据槽, incr/0085), under
                the requirement stated when the deal was opened. */}
            <DealPanel
              id="reasons"
              icon="lightbulb"
              title={DEAL_PAGE_TEXT.reasonsTitle}
              summary={reasonsSummary}
              editHint={canRecordEvidence ? PANEL_MENU_TEXT.noEntryHere : PANEL_MENU_TEXT.noEditRight}
            >
              <p className={`text-body-sm whitespace-pre-wrap ${requirement ? "text-foreground" : "text-muted-foreground"}`}>
                <span className="text-muted-foreground">{DEAL_PAGE_TEXT.requirement}：</span>
                {requirement ?? DEAL_PAGE_TEXT.requirementNone}
              </p>
              <EvidenceSlots
                opportunityId={id}
                rows={reasonRows}
                citable={citable}
                canRecord={canRecordEvidence}
                onRecord={recordEvidenceAction}
              />
            </DealPanel>

            {/* 竞争态势 - verbatim rival mentions until the competitor record
                (batch 7, 0089). */}
            <DealPanel
              id="competition"
              icon="shield"
              title={DEAL_PAGE_TEXT.competitionTitle}
              summary={
                rivalMentions.length > 0
                  ? DEAL_PAGE_TEXT.competitionMentions(rivalMentions.length)
                  : POSITION_TEXT.competitionNoMention
              }
            >
              <RivalMentions mentions={rivalMentions} />
            </DealPanel>

            {/* 报价与审批 - the lines decide the amount the dossier shows.
                Approving stays here, a flow op made looking at the line; the
                editor itself is its own page (/lines). */}
            <DealPanel
              id="quote"
              icon="stack"
              title={DEAL_PAGE_TEXT.quoteTitle}
              summary={
                dealLines.length === 0 ? DEAL_PAGE_TEXT.quoteNone : DEAL_PAGE_TEXT.quoteSummary(dealLines.length, pendingLines)
              }
              tags={pendingLines > 0 ? <StatusBadge tone="warning">{OPPORTUNITY_TEXT.lineBelowFloor}</StatusBadge> : null}
              editHref={linesHref ?? undefined}
              editHint={opportunity.closedAt !== null ? OPPORTUNITY_TEXT.lineClosedHint : undefined}
            >
              <LineEditor
                hideTitle
                opportunityId={id}
                lines={dealLines.map((l) => ({
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
                  unit: unitName.get(p.unitId) ?? "",
                }))}
                canEdit={false}
                canApprove={can(session.authz, session.entitlement, "pipeline.discount.approve", "ui").allowed}
                closed={opportunity.closedAt !== null}
                onSave={saveOpportunityLines}
                onApprove={approveDiscount}
              />
            </DealPanel>

            {/* 沟通记录 (renamed from 记录, YC-069): follow-ups only. Capture is
                the deck beside this page, anchored to this deal. */}
            <DealPanel
              id="comms"
              icon="chat-dots"
              title={DEAL_PAGE_TEXT.commsTitle}
              summary={
                lastTouch
                  ? DEAL_PAGE_TEXT.commsSummary(
                      Math.max(0, Math.floor((briefNow.getTime() - lastTouch.getTime()) / 86_400_000)),
                      recentTouches,
                    )
                  : DEAL_PAGE_TEXT.commsNone
              }
              editHint={PANEL_MENU_TEXT.noEntryHere}
            >
              {interactions.ok ? (
                <InteractionTimeline
                  items={interactions.value.map((i) => ({ ...i, actorName: memberNameOf.get(i.actorSub) ?? null }))}
                  limit={20}
                  hideTitle
                  hideDescription
                />
              ) : (
                <EmptyState title={SHELL_TEXT.loadFailed} description={loadFailureText(interactions.violations, LOAD_ERROR)} />
              )}
            </DealPanel>
          </div>
        </ViewLayout>
      </div>
    </DealEditProvider>
  );
}
