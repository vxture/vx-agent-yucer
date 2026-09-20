import {
  EmptyState,
  ViewHeader,
  ViewLayout,
} from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { can } from "../../../authz/decide";
import {
  getCopilotStore,
  getDeliveryStore,
  getFieldStore,
  getPlanningStore,
  getStrategyStore,
  getCatalogStore,
} from "../../../domains/shared/registry";
import {
  accountCompleteness,
  accountRelations,
  decisionChainsByOpportunity,
  getAccountDetail,
  listAccounts,
  recomputeHealth,
} from "../../../domains/account/service";
import { DecisionChain } from "../../components/decision-chain";
import { ChainRecencyPanel } from "../../components/chain-recency";
import { HealthPanel } from "../../components/health-panel";
import { LinkContacts } from "../../components/link-contacts";
import { ContactRoster } from "../../components/contact-roster";
import { InteractionTimeline } from "../../components/interaction-timeline";
import { CommitmentList } from "../../components/commitment-list";
import { RelationshipEvidencePanel } from "../../components/relationship-evidence";
import {
  listCommitments,
  listInteractions,
  chainRecency,
  relationshipEvidence,
} from "../../../domains/account/field-service";
import { getMessages } from "../../lib/i18n/server";
import { DEFAULT_STAGE_DEFINITIONS, type Stage } from "../../../domains/pipeline/lib/stage";
import { listPipeline, listStageDefinitions } from "../../../domains/pipeline/service";
import { toStageCatalog } from "../../../domains/pipeline/store";
import { healthTone, stageLabelFor } from "../../lib/view-model";
import { listProjects, projectView } from "../../../domains/delivery/service";
import { listProposals } from "../../../domains/copilot/service";
import { capabilityLabel } from "../../../domains/copilot/lib/capability";
import { AccountCompleteness } from "../../components/account-completeness";
import { fillField } from "./completeness-action";
import { askToComplete } from "./ask-complete-action";
import { cachedFeed } from "../../lib/board";
import { OrgUnitPanel } from "../../components/org-unit-panel";
import { DecisionChainGraph } from "../../components/decision-chain-graph";
import { AnalysisTabs } from "../../components/analysis-tabs";
import {
  DealLifecyclePanel,
  ProjectLifecyclePanel,
  RevenueLifecyclePanel,
  type DealLifecycleRow,
  type ProjectMilestoneRow,
  type RevenueRow,
} from "../../components/account-lifecycle";
import { TheatrePlan } from "../../components/theatre-plan";
import { DesignateAccount } from "../../components/designate-account";
import { DEFAULT_PERIOD } from "../../lib/periods";
import {
  designateAccountTier,
  linkAccountContacts,
  moveContactAction,
  recomputeAccountHealth,
  setAccountParentAction,
} from "../actions";
import {
  recordFollowUp,
  settleCommitment,
} from "../field-actions";
import { loadFailureText } from "../../lib/load-failure";
import { Tag, TierBadge } from "../../components/tag";
import { pricingPolicy } from "../../../domains/catalog/service";
import { DEFAULT_PRICING_POLICY } from "../../../domains/catalog/lib/pricing-policy";

// D4 account detail (owner, 2026-09-18: 客户全景视图重排).
//
// HEADER, then THREE COLUMNS - nothing mixed across the two. (1) The header
// states who this is and carries every action that CONFIGURES the
// relationship (定级/计划 among them - see below). (2) LEFT is the dossier -
// facts that do not need reading, stable enough to sit still while the
// centre is worked through. (3) CENTRE is the pure lifecycle spine - deals,
// delivery, revenue, contact history - as tabs over one line, and nothing
// else: a reader asking "how is this account doing" needs all of it without
// four separate pages, and without a config form or a decision list breaking
// the spine up. (4) RIGHT is this account's own decision items - what the
// copilot has already proposed about THIS relationship, with buttons that
// only ever navigate to the real queue (ADR-003).
//
// THE COPILOT'S CONVERSATION IS NOT A COLUMN HERE. The shell's own right pane
// (app-shell.tsx's `deck`, filled for this route by
// `@deck/account/[id]/page.tsx` -> AgentPanel/AssistantDeck) is ALREADY the
// account-scoped chat. A second CopilotChat inside the page content put two
// chat boxes on one screen and squeezed the real content into a
// three-column-inside-a-three-column layout - this page defers to the
// existing deck instead of rebuilding it.
//
// 定级/计划 IS CONFIGURATION, so it is a header button + Drawer
// (designate-account.tsx), never an always-open form sitting in a display
// column - the same defect market-scope-control.tsx already fixed once
// (owner, 2026-09-09: 把展示页面和配置子页混合在一起... 用一个按钮，展开面板选择
// 一项即可).
//
// Health is computed WITHOUT persisting (persist: false). Opening a page is a
// read, and a page render that writes would mean a member with only account.read
// silently mutating a row by looking at it - and it would put a write on every
// navigation. The button persists; the view does not.

export const dynamic = "force-dynamic";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const {
    ACCOUNT_STATUS_LABEL,
    AGENT_ACTION_LABEL,
    BOARD_TEXT,
    CHAIN_TEXT,
    CHANNEL_LABEL,
    PROJECT_HEALTH_LABEL,
    MILESTONE_STATUS_LABEL,
    REVENUE_STATUS_LABEL,
    SHELL_TEXT,
    STAGE_LABEL,
    LOAD_ERROR,
    DOMAIN_LABEL,
    ACCOUNT_TEXT,
    POSITION_TEXT,
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
    store: session.stores.account(),
  };

  // Through the service, not the store. The page holding a store handle is how
  // a URL becomes a way around the entitlement gate that the hidden nav entry
  // only appeared to enforce.
  const detail = await getAccountDetail(ctx, id);
  if (!detail.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(detail.violations, LOAD_ERROR)}
      />
    );
  }
  const { account, contacts } = detail.value;

  const canWrite = can(
    session.authz,
    session.entitlement,
    "account.upsert",
    "ui",
  ).allowed;

  const fieldCtx = { ...ctx, store: getFieldStore() };
  const now = new Date();
  const [interactions, commitments, evidence, accountsRead] = await Promise.all([
    listInteractions(fieldCtx, { accountId: id, limit: 50 }),
    listCommitments(fieldCtx, { accountId: id }),
    relationshipEvidence(fieldCtx, id, now),
    // 上级公司 (incr/0025): the picker's candidate list and the current
    // parent's display name both come off the same workspace-wide read -
    // setAccountParent's own cycle guard loads exactly this same list. The
    // same list also answers "who is BELOW this account" (单位信息's other
    // half) - filter by parentId, no second read.
    listAccounts(ctx, {}),
  ]);
  const accountRows = (accountsRead.ok ? accountsRead.value : []).map((a) => ({
    id: a.id,
    name: a.name,
    parentId: a.parentId,
  }));
  const parentName = account.parentId
    ? (accountRows.find((a) => a.id === account.parentId)?.name ?? null)
    : null;
  const childUnits = accountRows.filter((a) => a.parentId === id);

  const [health, relations] = await Promise.all([
    // persist:false - see the note above. It still needs the write gate, so a
    // read-only member gets no panel rather than a silently failing one.
    canWrite
      ? recomputeHealth(ctx, id, { persist: false })
      : Promise.resolve(null),
    accountRelations(ctx, id),
  ]);

  // THE POSITIONS ON THIS THEATRE, and the theatre-level plan over them.
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  /* 计价规则 (incr/0044): the currency a total is in when no row carries one. */
  const policyRead = await pricingPolicy({ ...base, store: getCatalogStore() });
  const defaultCurrency = policyRead.ok
    ? policyRead.value.defaultCurrency
    : DEFAULT_PRICING_POLICY.defaultCurrency;

  const [deals, projects, feed, proposals, stageRows] = await Promise.all([
    listPipeline({ ...base, store: session.stores.pipeline() }, { accountId: id }),
    listProjects({ ...base, store: getDeliveryStore() }, { accountId: id }),
    cachedFeed(base),
    listProposals(
      { ...base, store: getCopilotStore() },
      { status: "proposed" },
    ),
    listStageDefinitions({ ...base, store: session.stores.pipeline() }),
  ]);
  const stageDefinitions = stageRows.ok ? toStageCatalog(stageRows.value) : DEFAULT_STAGE_DEFINITIONS;

  // AFTER the deals, because a chain now belongs to one.
  const chain = await decisionChainsByOpportunity(
    ctx,
    id,
    (deals.ok ? deals.value : [])
      .filter((d) => d.status === "open")
      .map((d) => ({ id: d.id, name: d.name })),
  );

  // ONE REAL READ, TWO USES. cachedFeed() was already being fetched on this
  // page and rendered nowhere - every account-detail load paid for a judgement
  // scan that never reached the screen. This puts it to work instead of
  // fetching something new: the top-of-page banner takes the single highest-
  // urgency judgement about this account or one of its own open deals, and
  // the deals tab attaches each opportunity's own judgement (if the rules
  // engine produced one) as its AI insight line.
  const dealIds = new Set((deals.ok ? deals.value : []).map((d) => d.id));
  const relevantJudgements = feed.ok
    ? feed.value.judgements.filter(
        (j) => (j.subjectType === "account" && j.subjectId === id) ||
          (j.subjectType === "opportunity" && dealIds.has(j.subjectId)),
      )
    : [];
  const URGENCY_RANK: Record<string, number> = { today: 0, week: 1, watch: 2 };
  const topJudgement = [...relevantJudgements].sort(
    (a, b) => (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9),
  )[0] ?? null;

  const rosterProjects = (projects.ok ? projects.value : []).map((pr) => ({
    id: pr.id,
    name: pr.name,
    healthLabel: PROJECT_HEALTH_LABEL[pr.health] ?? pr.health,
    healthTone: (pr.health === "green"
      ? "success"
      : pr.health === "amber"
        ? "warning"
        : "danger") as "success" | "warning" | "danger",
  }));

  // 交付/回款 tabs' real data. One projectView() per project - the same N+1
  // the layout already accepts for the same reason (small N at this
  // catalogue's size; see layout.tsx's downgradedProjects read).
  const projectViews = await Promise.all(
    (projects.ok ? projects.value : []).map((pr) =>
      projectView({ ...base, store: getDeliveryStore() }, pr.id, { now }),
    ),
  );
  const milestonesByProject = new Map<string, ProjectMilestoneRow[]>();
  const revenueRows: RevenueRow[] = [];
  projectViews.forEach((pv, i) => {
    const pr = (projects.ok ? projects.value : [])[i];
    if (!pv.ok || !pr) return;
    milestonesByProject.set(
      pr.id,
      pv.value.milestones.map((m) => ({
        id: m.id,
        name: m.name,
        statusLabel: MILESTONE_STATUS_LABEL[m.status] ?? m.status,
        dueAt: m.dueAt ? m.dueAt.toISOString().slice(0, 10) : null,
        overdue: m.status !== "done" && m.status !== "missed" && m.dueAt != null && m.dueAt < now,
        amount: null,
        currency: defaultCurrency,
      })),
    );
    pv.value.instalments.forEach((inst) => {
      const milestone = pv.value.milestones.find((m) => m.id === inst.milestoneId);
      revenueRows.push({
        id: `${pr.id}:${inst.sequence}`,
        milestoneName: milestone?.name ?? pr.name,
        statusLabel: REVENUE_STATUS_LABEL[inst.status] ?? inst.status,
        overdue: inst.status === "overdue",
        dueAt: inst.dueAt ? inst.dueAt.toISOString().slice(0, 10) : null,
        amount: inst.plannedAmount.amount,
        currency: inst.plannedAmount.currency,
      });
    });
  });

  const dealRows: DealLifecycleRow[] = (deals.ok ? deals.value : []).map((d) => {
    const j = relevantJudgements.find((x) => x.subjectType === "opportunity" && x.subjectId === d.id);
    return {
      id: d.id,
      name: d.name,
      stageLabel: stageLabelFor(d.stage, stageDefinitions, STAGE_LABEL),
      amount: d.amount?.amount ?? null,
      currency: d.currency,
      status: d.status as "open" | "won" | "lost",
      insight: j
        ? { claim: j.claim, rule: j.rule ?? null, tone: j.urgency === "today" ? "danger" : j.urgency === "week" ? "warning" : "neutral" }
        : null,
    };
  });

  // THEATRE-LEVEL proposals: those whose subject is this account. A proposal
  // about one of its deals belongs on that deal's page - mixing them here would
  // ask a reader to sign a tactical move from a page about a relationship.
  const planProposals = (proposals.ok ? proposals.value : [])
    .filter((a) => a.subjectId === id)
    .map((a) => ({
      id: a.id,
      title: AGENT_ACTION_LABEL[a.actionType] ?? a.actionType,
      group: capabilityLabel(
        a.capability,
        BOARD_TEXT.capabilityLabels,
        BOARD_TEXT.capUnlabelled,
      ),
      rationale: a.rationale,
      confidence: a.confidence,
    }));

  const completeness = await accountCompleteness(
    {
      ...fieldCtx,
      store: session.stores.account(),
      pipeline: session.stores.pipeline(),
      planning: getPlanningStore(),
      strategy: getStrategyStore(),
    },
    id,
  );

  const recencies =
    relations.ok && chain.ok
      ? await Promise.all(
          chain.value.map((c) => chainRecency(fieldCtx, id, c.people, relations.value, { now })),
        )
      : [];

  const canAsk = can(session.authz, session.entitlement, "copilot.ask", "ui").allowed;
  const canLinkGraph = can(session.authz, session.entitlement, "account.graph.link", "ui").allowed;

  // header 的三个动态维度 (owner, 2026-09-18: header 三维度顺序 - 商机数量 /
  // 客户级别 / 健康评估), 都是已有真实数据的读数, 不是新字段。
  const openDealsCount = dealRows.filter((d) => d.status === "open").length;
  const tierLabel =
    account.tier === "strategic"
      ? POSITION_TEXT.tierStrategic
      : account.tier === "key"
        ? POSITION_TEXT.tierKey
        : POSITION_TEXT.tierStandard;
  const tierTone =
    account.tier === "strategic" ? "brand" : account.tier === "key" ? "warning" : "neutral";

  return (
    <ViewLayout>
      <PageCrumbs trail={[{ label: DOMAIN_LABEL.account, href: "/account" }]} current={account.name} />

      <ViewHeader
        secondary={account.accountNo}
        icon="buildings"
        title={account.name}
        description={[account.industry, account.region]
          .filter(Boolean)
          .join(" / ")}
        action={
          <div className="flex items-center gap-xs">
            <Tag tone={account.status === "churned" ? "danger" : "neutral"} dot>
              {ACCOUNT_STATUS_LABEL[account.status] ?? account.status}
            </Tag>
            {/* 三个动态维度, 固定顺序: 商机数量 -> 客户级别 -> 健康评估 (owner,
                2026-09-18: header 三维度顺序). 都读现成的数据, 客户级别现在
                连普通级也显示, 不再只在非 standard 时才出现. */}
            <Tag icon="target">
              {POSITION_TEXT.planDeals} {openDealsCount}
            </Tag>
            <TierBadge tier={account.tier} tone={tierTone}>
              {tierLabel}
            </TierBadge>
            {health && health.ok ? (
              <Tag tone={healthTone(health.value.score)}>
                {CHAIN_TEXT.healthShort} {health.value.score}
              </Tag>
            ) : null}
            {/* 定级/计划 IS CONFIGURATION, not a fact to display - it lives
                behind one button, never as an open form on the page (see
                designate-account.tsx's own note). */}
            <DesignateAccount
              accountId={id}
              tier={detail.value.account.tier}
              period={DEFAULT_PERIOD}
              canWrite={
                can(session.authz, session.entitlement, "account.upsert", "ui")
                  .allowed
              }
              onDesignate={designateAccountTier}
            />
          </div>
        }
      />

      {/* 定向自动分析 (owner, 2026-09-18): the single highest-urgency real
          judgement about this account or one of its open deals - not a
          restated fact, a rule's own claim, the same text the home feed
          would show for it. Renders nothing when the rules engine has not
          fired one, rather than inventing a placid summary to fill the
          space. */}
      {topJudgement ? (
        <div className="border-primary/30 bg-primary/5 flex items-start gap-sm rounded-lg border p-md">
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-medium">{topJudgement.claim}</p>
            {topJudgement.rule ? (
              <p className="text-muted-foreground mt-2xs text-body-sm">{topJudgement.rule}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* THREE COLUMNS below the header. xl:grid-cols-[18rem_1fr_20rem]:
          left is the dossier (facts that hold still), centre is the pure
          lifecycle spine, right is this account's own decision items - NOT
          the copilot conversation, which stays exclusively the shell's job
          (see the file-level note above; a second chat box here is the
          defect this replaced). */}
      <div className="grid gap-lg xl:grid-cols-[18rem_1fr_20rem]">

        {/* ======== LEFT: the dossier ======== */}
        <div className="flex min-w-0 flex-col gap-lg">
          <OrgUnitPanel
            accountId={id}
            parentId={account.parentId}
            parentName={parentName}
            accounts={accountRows}
            canWrite={canWrite}
            onSetParent={setAccountParentAction}
            children={childUnits}
          />

          <ContactRoster
            accountId={id}
            contacts={contacts}
            canEdit={
              can(
                session.authz,
                session.entitlement,
                "account.contact.upsert",
                "ui",
              ).allowed
            }
            editHref={`/contact/new?account=${id}&back=/account/${id}`}
            onMove={moveContactAction}
          />

          {/* 决策链在档案缺口前面 (owner, 2026-09-18: 栏1 排版 - 单位信息 /
              联系人 / 决策链 / 档案缺口), 因为决策链是这张客户档案的展示重点
              (owner: 决策链需要客户层级的视角...这是展示重点) - 缺口是"还没
              填的", 排在后面才不会把注意力先引到缺什么, 而不是引到已经知道
              的关系结构上。 */}
          {chain.ok ? (
            chain.value.length === 0 ? (
              <EmptyState
                title={CHAIN_TEXT.noOpenDealTitle}
                description={CHAIN_TEXT.noOpenDealDescription}
              />
            ) : (
              chain.value.map((c, i) => (
                <div key={c.opportunityId} className="flex flex-col gap-sm">
                  <DecisionChain
                    title={CHAIN_TEXT.forDeal(c.opportunityName)}
                    coverage={c.coverage}
                    contacts={c.people}
                    linkForm={
                      i === 0 ? (
                        <LinkContacts
                          accountId={id}
                          contacts={c.people}
                          canLink={canLinkGraph}
                          unreachable={c.coverage.economicBuyerUnreachable}
                          onLink={linkAccountContacts}
                        />
                      ) : undefined
                    }
                  />
                  {recencies[i]?.ok ? (
                    <ChainRecencyPanel
                      recency={recencies[i].value}
                      nameOf={(x) => contacts.find((y) => y.id === x.id)?.name ?? x.id}
                    />
                  ) : null}
                  <DecisionChainGraph
                    dealName={c.opportunityName}
                    coverage={c.coverage}
                    people={c.people}
                    contacts={contacts}
                  />
                </div>
              ))
            )
          ) : (
            <EmptyState
              title={SHELL_TEXT.loadFailed}
              description={loadFailureText(chain.violations, LOAD_ERROR)}
            />
          )}

          {completeness.ok ? (
            <AccountCompleteness
              accountId={id}
              gaps={completeness.value.gaps}
              canFill={can(session.authz, session.entitlement, "account.upsert", "ui").allowed}
              onFill={fillField}
              onAsk={askToComplete}
              canAsk={canAsk}
            />
          ) : null}
        </div>

        {/* ======== CENTRE: the lifecycle spine ======== */}
        <div className="flex min-w-0 flex-col gap-lg">
          {health && health.ok ? (
            <HealthPanel
              accountId={id}
              health={health.value}
              canRecompute={canWrite}
              onRecompute={recomputeAccountHealth}
            />
          ) : null}

          {evidence.ok ? (
            <RelationshipEvidencePanel evidence={evidence.value} now={now} />
          ) : null}

          <AnalysisTabs
            id="account-lifecycle"
            title={ACCOUNT_TEXT.roster}
            description={ACCOUNT_TEXT.rosterWhy}
            tabs={[
              {
                key: "deals",
                label: `${ACCOUNT_TEXT.lifecycleDeals} (${dealRows.length})`,
                content: <DealLifecyclePanel deals={dealRows} defaultCurrency={defaultCurrency} />,
              },
              {
                key: "projects",
                label: `${ACCOUNT_TEXT.lifecycleProjects} (${rosterProjects.length})`,
                content:
                  rosterProjects.length === 0 ? (
                    <p className="text-muted-foreground text-body-sm">{ACCOUNT_TEXT.rosterNoProjects}</p>
                  ) : (
                    <div className="flex flex-col gap-md">
                      {rosterProjects.map((pr) => (
                        <ProjectLifecyclePanel
                          key={pr.id}
                          projectName={pr.name}
                          healthLabel={pr.healthLabel}
                          healthTone={pr.healthTone}
                          milestones={milestonesByProject.get(pr.id) ?? []}
                        />
                      ))}
                    </div>
                  ),
              },
              {
                key: "revenue",
                label: ACCOUNT_TEXT.lifecycleRevenue,
                content: <RevenueLifecyclePanel rows={revenueRows} />,
              },
              {
                key: "interactions",
                label: ACCOUNT_TEXT.lifecycleInteractions,
                content: (
                  <div className="flex flex-col gap-md">
                    {commitments.ok ? (
                      <CommitmentList
                        accountId={id}
                        items={commitments.value}
                        evidence={(interactions.ok ? interactions.value : []).map(
                          (i) => ({
                            id: i.id,
                            label: `${i.occurredAt.toISOString().slice(0, 10)} ${CHANNEL_LABEL[i.channel] ?? i.channel}`,
                          }),
                        )}
                        canWrite={canWrite}
                        captureHref={`/capture?account=${id}&back=/account/${id}`}
                        onSettle={settleCommitment}
                      />
                    ) : null}
                    {interactions.ok ? (
                      <InteractionTimeline items={interactions.value} limit={20} />
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </div>

        {/* ======== RIGHT: this account's own decision items ======== */}
        <div className="flex min-w-0 flex-col gap-lg">
          <TheatrePlan proposals={planProposals} accountId={id} />
        </div>
      </div>
    </ViewLayout>
  );
}
