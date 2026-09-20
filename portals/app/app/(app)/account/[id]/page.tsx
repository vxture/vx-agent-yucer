import {
  EmptyState,
  Icon,
  ViewHeader,
  ViewLayout,
} from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { CircleBadge, DimensionStat } from "../../components/dimension-stat";
import { ScoreRing } from "../../components/score-ring";
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
import { DecisionChainDetail } from "../../components/decision-chain-detail";
import { ChainViewProvider, ChainDetailSlot, ChainSummaryList, type ChainSummaryItem } from "../../components/decision-chain-switch";
// NOT importing ROLE_ORDER from decision-chain-graph.tsx here - that file is
// "use client", and a plain array constant re-exported from a client module
// resolved to a bundler artefact (empty, not undefined - .length read 0
// rather than throwing) when imported from this server component, the same
// class of issue as dimension-stat.tsx's toneSurfaceClasses note. DECISION_ROLES
// is the same fact from a plain (non-"use client") domain lib instead.
import { DECISION_ROLES } from "../../../domains/account/lib/health";
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
import { DEFAULT_STAGE_DEFINITIONS, openStageOrder, type Stage } from "../../../domains/pipeline/lib/stage";
import { daysAtStage } from "../../../domains/pipeline/lib/forecast-rule";
import { listPipeline, listStageDefinitions, stageChangeTimestamps } from "../../../domains/pipeline/service";
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
import { Tag, TIER_ICON_SRC } from "../../components/tag";
import { pricingPolicy } from "../../../domains/catalog/service";
import { DEFAULT_PRICING_POLICY } from "../../../domains/catalog/lib/pricing-policy";

// D4 account detail (owner, 2026-09-20: 严格按照设计实施 - 栏1/栏2排版,
// matching the finished mockup's header + TWO columns, not three).
//
// HEADER, then TWO COLUMNS - nothing mixed across the two. (1) The header
// states who this is and carries every action that CONFIGURES the
// relationship (定级/计划 among them - see below). (2) LEFT (mockup's 栏1) is
// the dossier - facts that do not need reading, stable enough to sit still
// while the right column is worked through. (3) RIGHT (mockup's 栏2) is the
// lifecycle spine - deals, delivery, revenue, contact history, as tabs over
// one line - WITH this account's own decision items appended below it: what
// the copilot has already proposed about THIS relationship, with buttons
// that only ever navigate to the real queue (ADR-003). One column, two
// concerns stacked, rather than a third grid track for the second one - a
// third column was never the mockup's design, and standing a whole grid
// track on a handful of proposal cards read as more important than the
// lifecycle spine beside it.
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

// "unknown" is a catch-all for an unset decisionRole, not a sixth role the
// coverage math counts toward - the "N/5" the decision-chain summary and
// detail views both show is real roles only.
const TOTAL_DECISION_ROLES = DECISION_ROLES.filter((r) => r !== "unknown").length;

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
    healthReasonText,
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

  const [deals, projects, feed, proposals, stageRows, stageChanges] = await Promise.all([
    listPipeline({ ...base, store: session.stores.pipeline() }, { accountId: id }),
    listProjects({ ...base, store: getDeliveryStore() }, { accountId: id }),
    cachedFeed(base),
    listProposals(
      { ...base, store: getCopilotStore() },
      { status: "proposed" },
    ),
    listStageDefinitions({ ...base, store: session.stores.pipeline() }),
    stageChangeTimestamps({ ...base, store: session.stores.pipeline() }),
  ]);
  const stageDefinitions = stageRows.ok ? toStageCatalog(stageRows.value) : DEFAULT_STAGE_DEFINITIONS;
  const openStages = openStageOrder(stageDefinitions);

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

  const chainedDealIds = new Set((chain.ok ? chain.value : []).map((c) => c.opportunityId));
  const dealRows: DealLifecycleRow[] = (deals.ok ? deals.value : []).map((d) => {
    const j = relevantJudgements.find((x) => x.subjectType === "opportunity" && x.subjectId === d.id);
    const stageIndex = openStages.indexOf(d.stage);
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
      stagePosition: d.status === "open" && stageIndex >= 0 ? { index: stageIndex, total: openStages.length } : null,
      daysInStage: daysAtStage(
        { lastStageChangeAt: stageChanges.ok ? (stageChanges.value.get(d.id) ?? null) : null },
        now,
      ),
      hasChain: chainedDealIds.has(d.id),
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

  // 决策链主从视图 (owner, 2026-09-20: 设计图严格对齐 - 先做，别再等我确认):
  // 栏1 只要摘要, 详情内容在这里就地建好当作 ReactNode 传下去, 跟 linkForm
  // 一直以来的做法一样 - decision-chain-switch.tsx 的 Context 只决定"现在
  // 显示哪一个", 不重新拿数据。
  const chainSummaryItems: ChainSummaryItem[] = chain.ok
    ? chain.value.map((c, i) => {
        const hasEconomicBuyer = c.people.some(
          (p) => p.decisionRole === "economic" && p.status === "active",
        );
        const recencyRead = recencies[i]?.ok ? recencies[i].value : null;
        // 未触达阻碍者的真实人数: 这个阻碍者不在 warm 名单里 (recency 没读到
        // 就不算, 不是"默认都未触达"). 跟摘要行的一句话小结配对, 不是编的。
        const unreachedBlockers = recencyRead
          ? c.coverage.blockers.filter((b) => !recencyRead.warm.some((w) => w.id === b.id)).length
          : 0;
        return {
          id: c.opportunityId,
          title: c.opportunityName,
          coveredCount: c.coverage.covered.length,
          totalRoles: TOTAL_DECISION_ROLES,
          reachable: !c.coverage.economicBuyerUnreachable,
          hasEconomicBuyer,
          unreachedBlockers,
          detail: (
            <DecisionChainDetail
              key={c.opportunityId}
              title={CHAIN_TEXT.forDeal(c.opportunityName)}
              coverage={c.coverage}
              people={c.people}
              contacts={contacts}
              recency={recencyRead}
              linkForm={
                i === 0 ? (
                  <LinkContacts
                    key={c.opportunityId}
                    accountId={id}
                    contacts={c.people}
                    canLink={canLinkGraph}
                    unreachable={c.coverage.economicBuyerUnreachable}
                    onLink={linkAccountContacts}
                  />
                ) : undefined
              }
            />
          ),
        };
      })
    : [];

  // header 的三个动态维度 (owner, 2026-09-18: header 三维度顺序 - 商机数量 /
  // 客户级别 / 健康评估), 都是已有真实数据的读数, 不是新字段。
  const openDealsCount = dealRows.filter((d) => d.status === "open").length;
  const tierLabel =
    account.tier === "strategic"
      ? POSITION_TEXT.tierStrategic
      : account.tier === "key"
        ? POSITION_TEXT.tierKey
        : POSITION_TEXT.tierStandard;

  return (
    <ViewLayout>
      <PageCrumbs trail={[{ label: DOMAIN_LABEL.account, href: "/account" }]} current={account.name} />

      <ViewHeader
        icon="buildings"
        title={account.name}
        // `secondary` IS the DS's own slot for "a status tag beside the
        // title" (PageHeaderProps: 标题行内的附加物，通常是 StatusBadge) -
        // this was sitting in `action` (the right-side button area) before,
        // which is why 状态 rendered on the opposite side of the header
        // from where the mockup puts it (owner, 2026-09-20: 严格按照设计
        // 实施).
        secondary={
          <Tag tone={account.status === "churned" ? "danger" : "neutral"} dot>
            {ACCOUNT_STATUS_LABEL[account.status] ?? account.status}
          </Tag>
        }
        description={account.accountNo}
        action={
          <div className="flex items-center gap-md">
            {/* 三个动态维度, 固定顺序: 商机数量 -> 客户级别 -> 健康评估 (owner,
                2026-09-18: header 三维度顺序). 图形 + 两行文字, 不是彩色
                胶囊 (owner, 2026-09-20: 严格按照设计实施 - mockup 的
                `.health-mini`) - 都读现成的数据, 客户级别现在连普通级也
                显示, 不再只在非 standard 时才出现. */}
            <DimensionStat
              figure={<CircleBadge tone="brand">{openDealsCount}</CircleBadge>}
              label={POSITION_TEXT.planDeals}
              value={ACCOUNT_TEXT.openDealsCount(openDealsCount)}
            />
            <DimensionStat
              figure={
                <img src={TIER_ICON_SRC[account.tier]} alt="" className="h-[2.875rem] w-10 flex-none" />
              }
              label={POSITION_TEXT.tierDimensionLabel}
              value={tierLabel}
            />
            {health && health.ok ? (
              <DimensionStat
                last
                figure={
                  <ScoreRing
                    score={health.value.score}
                    tone={healthTone(health.value.score)}
                    label={`${CHAIN_TEXT.healthShort} ${health.value.score}`}
                    size={46}
                  />
                }
                label={CHAIN_TEXT.healthShort}
                value={
                  health.value.primaryConcern ? (
                    <span className="text-destructive-text flex items-center gap-2xs">
                      <Icon name="warning" size="sm" />
                      {healthReasonText(health.value.primaryConcern.reason)}
                    </span>
                  ) : (
                    health.value.score
                  )
                }
              />
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

      {/* TWO COLUMNS below the header, not three (owner, 2026-09-20: 严格
          按照设计实施 - 栏3是平台全局的智能副驾，不是每个页面自己构建的三分
          之一). Left is the dossier (facts that hold still); right is
          everything else this account's own page owns - the lifecycle spine
          AND this account's own decision items, stacked in one column
          instead of a third grid track. The copilot conversation itself is
          still never a column here (see the file-level note above; a second
          chat box was the defect that comment describes, and folding 栏3
          into 栏2 does not reopen it - TheatrePlan is a proposal LIST, not a
          chat). */}
      {/* ChainViewProvider spans both columns - 栏1 的摘要行点击要改栏2 显示
          什么, 状态得提到两栏共同的父级 (owner: 决策链主从视图). */}
      {/* 20rem, 不是 18rem (owner: 其他页面的三栏布局/边距/gap，客户详情页
          是不是一致了) - 18rem 是这页重排前就有的老数字, 查了一圈发现整个
          产品里唯一真的写了理由的侧栏宽度是 form-page.tsx 的 20rem
          ("The 20rem second column is reserved..."), 18rem 在别处找不到
          出处。gap-lg 本来就和 pipeline/[id]/page.tsx 的两栏一致, 不用改;
          只有这一个数字是孤立的, 改成跟已有惯例对齐。 */}
      <ChainViewProvider chains={chainSummaryItems}>
      <div className="grid gap-lg xl:grid-cols-[20rem_1fr]">

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
            industry={account.industry}
            region={account.region}
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
              的关系结构上。
              栏1 只放摘要行 (owner, 2026-09-20: 设计图严格对齐) - 点开某一条
              后, 详情在栏2 展开 (ChainDetailSlot), 不再是三个组件平铺在这里。 */}
          {chain.ok ? (
            <ChainSummaryList
              emptyTitle={CHAIN_TEXT.noOpenDealTitle}
              emptyDescription={CHAIN_TEXT.noOpenDealDescription}
            />
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

        {/* ======== RIGHT (mockup's 栏2): the lifecycle spine, then this
            account's own decision items - one column, two concerns, matching
            the mockup's 栏2 (default view: 健康拆解 + 阵地清单) with
            TheatrePlan appended rather than given its own track. ======== */}
        <div className="flex min-w-0 flex-col gap-lg">
          {/* lifecycle 视图和某条决策链的详情视图二选一 (owner: 决策链展示时
              健康拆解也去除) - ChainDetailSlot 从 Context 里的 activeId 决定
              渲染哪一个, 这个 div 本身两种情况下都还是栏2 唯一的容器。 */}
          <ChainDetailSlot lifecycle={
          <>
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

          {/* 没有 description - 去掉所有垃圾说明 (owner, 2026-09-20; 理由见
              components/org-unit-panel.tsx 同名注释). */}
          <AnalysisTabs
            id="account-lifecycle"
            title={ACCOUNT_TEXT.roster}
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
                        hideDescription
                      />
                    ) : null}
                    {interactions.ok ? (
                      <InteractionTimeline items={interactions.value} limit={20} hideDescription />
                    ) : null}
                  </div>
                ),
              },
            ]}
          />

          <TheatrePlan proposals={planProposals} accountId={id} />
          </>
          } />
        </div>
      </div>
      </ChainViewProvider>
    </ViewLayout>
  );
}
