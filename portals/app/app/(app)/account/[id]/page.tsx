import {
  EmptyState,
  Icon,
  ViewLayout,
} from "@vxture/design-ui";
import { DealsSummaryBadge, DimensionStat } from "../../components/dimension-stat";
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
  accountStatuses,
  decisionChainsByOpportunity,
  getAccountDetail,
  listAccounts,
  listAccountCollaborators,
  listCustomerNatures,
  listCustomerSizes,
  listCustomerTypes,
  listIndustries,
  recomputeHealth,
  resolveAccountOwner,
} from "../../../domains/account/service";
import { listSegments } from "../../../domains/strategy/service";
import { getAuthzStore } from "../../../authz/store";
import { LinkContactDrawer } from "../../components/link-contact-drawer";
import { OrgRelationsEditor } from "../../components/org-relations-editor";
import { DecisionChainDetail } from "../../components/decision-chain-detail";
import { ChainViewProvider, ChainCrumbs, ChainDetailSlot, ChainSummaryList, type ChainSummaryItem } from "../../components/decision-chain-switch";
// NOT importing ROLE_ORDER from decision-chain-graph.tsx here - that file is
// "use client", and a plain array constant re-exported from a client module
// resolved to a bundler artefact (empty, not undefined - .length read 0
// rather than throwing) when imported from this server component, the same
// class of issue as dimension-stat.tsx's toneSurfaceClasses note. DECISION_ROLES
// is the same fact from a plain (non-"use client") domain lib instead.
import { DECISION_ROLES } from "../../../domains/account/lib/health";
import { HealthPanel } from "../../components/health-panel";
import { JudgementNote } from "../../components/judgement-note";
import { ContactRoster } from "../../components/contact-roster";
import { ContactManagementList } from "../../components/contact-management-list";
import { InteractionTimeline } from "../../components/interaction-timeline";
import { PasteNotesButton } from "../../components/paste-notes-button";
import { CommitmentList } from "../../components/commitment-list";
import {
  listCommitments,
  listInteractions,
  chainRecency,
} from "../../../domains/account/field-service";
import { getMessages } from "../../lib/i18n/server";
import { resolveLocale } from "../../lib/i18n/locale";
import { DEFAULT_STAGE_DEFINITIONS, openStageOrder, type Stage } from "../../../domains/pipeline/lib/stage";
import { daysAtStage } from "../../../domains/pipeline/lib/forecast-rule";
import { listPipeline, listStageDefinitions, stageChangeTimestamps, stageHistory } from "../../../domains/pipeline/service";
import { isReviewable, reviewOutcome } from "../../../domains/copilot/lib/outcome-review";
import { toStageCatalog } from "../../../domains/pipeline/store";
import { formatMoney, formatMoneyCompact, healthTone, stageLabelFor } from "../../lib/view-model";
import { listContracts, listProjects, projectView } from "../../../domains/delivery/service";
import { isOverdue } from "../../../domains/delivery/lib/revenue";
import {
  contractPhase,
  daysToTermEnd,
  noticeDeadline,
  installedRevenue,
  ownedProducts,
} from "../../../domains/delivery/lib/contract";
import { ContractRoster, type ContractReadState, type ContractRow } from "../../components/contract-roster";
import {
  deleteContractLine,
  recordRenewalOutcomeAction,
  renewContractAction,
  saveContract,
  saveContractLine,
} from "../contract-actions";
import { listProposals } from "../../../domains/copilot/service";
import { capabilityLabel } from "../../../domains/copilot/lib/capability";
import { AccountCompleteness } from "../../components/account-completeness";
import { fillField } from "./completeness-action";
import { askToComplete } from "./ask-complete-action";
import { structureMeetingNotes } from "./paste-notes-action";
import { checkConsistency } from "./consistency-action";
import { ConsistencyCheck, type PendingConflict } from "../../components/consistency-check";
import { CONFLICT_ACTION_TYPE, lastConsistencyCheck } from "../../../domains/copilot/lib/conflict";
import { cachedFeed } from "../../lib/board";
import { OrgUnitPanel } from "../../components/org-unit-panel";
import { BOARD_PANE_CLASS, CENTRE_PANE_CLASS } from "../../lib/sidebar-slot";
import { AnalysisTabs } from "../../components/analysis-tabs";
import {
  DealLifecyclePanel,
  ProjectLifecyclePanel,
  RevenueLifecyclePanel,
  type DealLifecycleRow,
  type ProjectMilestoneRow,
  type RevenueRow,
} from "../../components/account-lifecycle";
import { TheatrePlan, type PlanReview } from "../../components/theatre-plan";
import { AccountHeaderMenu } from "../../components/account-header-menu";
import { AccountEditDrawers, AccountEditProvider } from "../../components/account-edit-context";
import { DEFAULT_PERIOD } from "../../lib/periods";
import {
  designateAccountTier,
  linkAccountContacts,
  moveContactAction,
  recomputeAccountHealth,
  setAccountParentAction,
  updateAccountBasicsAction,
  searchContactsAction,
  linkExistingContactAction,
  unlinkContactAction,
  searchColleaguesAction,
  addCollaboratorAction,
  removeCollaboratorAction,
  accountFootprintAction,
  deleteAccountAction,
} from "../actions";
import {
  recordFollowUp,
  settleCommitment,
} from "../field-actions";
import { loadFailureText } from "../../lib/load-failure";
import { Tag, TIER_ICON_SRC } from "../../components/tag";
import { CapBadge, CapFooter, LayerLabel, PanoramaLegend } from "../../components/panorama-annotations";
import { listProductStatuses, listProducts, pricingPolicy } from "../../../domains/catalog/service";
import { whitespace } from "../../../domains/delivery/lib/whitespace";
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
    FIELD_TEXT,
    PROJECT_HEALTH_LABEL,
    MILESTONE_STATUS_LABEL,
    REVENUE_STATUS_LABEL,
    SHELL_TEXT,
    STAGE_LABEL,
    LOAD_ERROR,
    DOMAIN_LABEL,
    ACCOUNT_TEXT,
    healthReasonText,
    healthOverrideText,
    POSITION_TEXT,
    COLLAPSE_TEXT,
    PANEL_MENU_TEXT,
    CONTRACT_TEXT,
    CONTRACT_ERROR,
  } = await getMessages();
  const { id } = await params;
  // 累计合同额需要 Intl.NumberFormat 的 locale (owner, 2026-09-21: 补充 -
  // 商机数/累计合同额). getMessages() 只给字典, 不给 locale 本身 - 见
  // lib/i18n/server.ts 自己的注释: 要格式化数字/日期要单独调 resolveLocale()。
  const locale = await resolveLocale();
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
    // The shell hands this route its whole body row (lib/sidebar-slot.ts),
    // so even the refusal sits in the centre pane rather than bare in the row.
    return (
      <div className={CENTRE_PANE_CLASS}>
        <EmptyState
          title={SHELL_TEXT.loadFailed}
          description={loadFailureText(detail.violations, LOAD_ERROR)}
        />
      </div>
    );
  }
  const { account, contacts } = detail.value;
  const contactNameById = Object.fromEntries(contacts.map((c) => [c.id, c.name]));

  const canWrite = can(
    session.authz,
    session.entitlement,
    "account.upsert",
    "ui",
  ).allowed;

  const canRecord = can(
    session.authz,
    session.entitlement,
    "account.interaction.record",
    "ui",
  ).allowed;

  const fieldCtx = { ...ctx, store: getFieldStore() };
  const now = new Date();
  const [interactions, commitments, accountsRead] = await Promise.all([
    listInteractions(fieldCtx, { accountId: id, limit: 50 }),
    listCommitments(fieldCtx, { accountId: id }),
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

  const memberList = await getAuthzStore().listMembers(ctx.workspaceId);
  const memberNameOf = new Map(memberList.map((m) => [m.sub, m.displayName]));

  // WHO WAS THERE (YC-021 跟进: 时间线 + 渠道 + 参与人). Their people by name,
  // and OUR colleagues too - capture writes the recorder and anyone else of
  // ours as member rows, and only contacts and outside names were resolved,
  // so a colleague who was in the meeting never appeared. The recorder is
  // left out here: the row already names them as its author. A contact since
  // unlinked from this customer has no name on this page's roster and is
  // skipped (no by-id person read exists yet).
  const actorOf = new Map((interactions.ok ? interactions.value : []).map((i) => [i.id, i.actorSub]));
  const participantsByInteraction = new Map<string, readonly string[]>();
  if (interactions.ok && interactions.value.length > 0) {
    const allParticipants = await fieldCtx.store.listParticipantsBulk(
      ctx.workspaceId,
      interactions.value.map((i) => i.id),
    );
    for (const p of allParticipants) {
      const name = p.contactId
        ? (contactNameById[p.contactId] ?? null)
        : p.memberSub
          ? p.memberSub === actorOf.get(p.interactionId)
            ? null
            : (memberNameOf.get(p.memberSub) ?? null)
          : p.externalName;
      if (!name) continue;
      const existing = participantsByInteraction.get(p.interactionId) ?? [];
      participantsByInteraction.set(p.interactionId, [...existing, name]);
    }
  }

  const [health, relations, industriesRead, customerTypesRead, customerSizesRead, customerNaturesRead, segmentsRead] =
    await Promise.all([
      // persist:false - a READ, so every member who can see the customer sees
      // the score WITH its factors (YC-021 L5: 分数始终与因子拆解同时出现);
      // it used to need the write gate, which left read-only members a status
      // tag and nothing else. A THROWN source read means NO score (§5: 宁可
      // 没有, 不要给一个少算了一项的分) - the card then falls back to status tag
      // + judgement. It must not take the page down.
      recomputeHealth(ctx, id, { persist: false }).catch(() => null),
      accountRelations(ctx, id),
      // 基础信息表单的四个词表 (owner, 2026-09-20: 先做基础信息表单) - only a
      // writer ever sees the form, but the reads are cheap account.view-gated
      // lists already used elsewhere (admin config pages), not a new query
      // shape.
      canWrite ? listIndustries(ctx) : Promise.resolve(null),
      // customerTypesRead/customerNaturesRead are UNCONDITIONAL now (owner,
      // 2026-09-20: 补充 - 性质/类型 需要显示在单位信息卡上, 一张纯展示卡,
      // 不看 account.upsert). Both are gated on account.view at the service
      // layer, same as the page itself, so a read-only member resolves the
      // same id->name lookup a writer's edit form already used - this is not
      // a new permission surface, just the same read no longer withheld from
      // someone who cannot also write.
      listCustomerTypes(ctx),
      listCustomerSizes(ctx),
      listCustomerNatures(ctx),
      canWrite
        ? listSegments({ ...ctx, store: getStrategyStore() })
        : Promise.resolve(null),
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

  const [deals, projects, feed, proposals, stageRows, stageChanges, contractsRead, productsRead, statusesRead, statusRead] = await Promise.all([
    listPipeline({ ...base, store: session.stores.pipeline() }, { accountId: id }),
    listProjects({ ...base, store: getDeliveryStore() }, { accountId: id }),
    cachedFeed(base),
    listProposals(
      { ...base, store: getCopilotStore() },
      { status: "proposed" },
    ),
    listStageDefinitions({ ...base, store: session.stores.pipeline() }),
    stageChangeTimestamps({ ...base, store: session.stores.pipeline() }),
    // 合同 (incr/0076). A THROWN read is caught to null here rather than
    // failing the page: the tab has to be able to say "could not read" as its
    // own sentence, distinct from "refused" and from "none" (design Q2.3).
    listContracts({ ...base, store: getDeliveryStore() }, { accountId: id }).catch(() => null),
    // Product names for the lines and 已购态, and the options the line
    // drawer offers - the page composes D7 with D9, D7 never reads D9.
    listProducts({ ...base, store: getCatalogStore() }),
    // 白地 (L4 batch six) needs to know which products are SELLABLE - the
    // `active` status - not merely which exist.
    listProductStatuses({ ...base, store: getCatalogStore() }),
    // 状态标签, derived from the facts (YC-021 L5) - the stored column was never
    // written after creation. A failed read shows no tag, never the stale one.
    accountStatuses(
      { ...base, store: session.stores.account(), pipeline: session.stores.pipeline(), delivery: getDeliveryStore() },
      [id],
      now,
    ).catch(() => null),
  ]);
  const derivedStatus = statusRead?.ok ? (statusRead.value.get(id) ?? null) : null;
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
  const collectionTotals = new Map<string, { planned: number; collected: number }>();
  projectViews.forEach((pv, i) => {
    const pr = (projects.ok ? projects.value : [])[i];
    if (!pv.ok || !pr) return;
    if (pv.value.collections) {
      const c = pv.value.collections;
      const tally = collectionTotals.get(c.planned.currency) ?? { planned: 0, collected: 0 };
      tally.planned += c.planned.amount;
      tally.collected += c.collected.amount;
      collectionTotals.set(c.planned.currency, tally);
    }
    // 每个里程碑自己挂的那笔回款金额 (owner, 2026-09-20: 逐个板块对照设计图
    // 核实 - mockup 的每一行里程碑都带着金额, 这里之前硬编码成 null). 一个
    // milestone 最多对应一个 instalment (incr/0032, milestone_id 是那笔
    // 回款的释放条件, 不是反过来) - 找不到就是这个里程碑本来没有挂钱, 不是
    // 数据缺失。
    const amountByMilestone = new Map(
      pv.value.instalments.map((inst) => [inst.milestoneId, inst.plannedAmount]),
    );
    milestonesByProject.set(
      pr.id,
      pv.value.milestones.map((m) => {
        const amount = amountByMilestone.get(m.id) ?? null;
        return {
          id: m.id,
          name: m.name,
          statusLabel: MILESTONE_STATUS_LABEL[m.status] ?? m.status,
          dueAt: m.dueAt ? m.dueAt.toISOString().slice(0, 10) : null,
          overdue: m.status !== "done" && m.status !== "missed" && m.dueAt != null && m.dueAt < now,
          amount: amount?.amount ?? null,
          currency: amount?.currency ?? defaultCurrency,
        };
      }),
    );
    pv.value.instalments.forEach((inst) => {
      const milestone = pv.value.milestones.find((m) => m.id === inst.milestoneId);
      revenueRows.push({
        id: `${pr.id}:${inst.sequence}`,
        milestoneName: milestone?.name ?? pr.name,
        statusLabel: REVENUE_STATUS_LABEL[inst.status] ?? inst.status,
        // The domain's own rule (summarizeCollections): marked overdue OR past
        // due and unsettled. Checking the status alone missed every instalment
        // nobody had got round to marking.
        overdue: inst.status === "overdue" || isOverdue(inst, now),
        dueAt: inst.dueAt ? inst.dueAt.toISOString().slice(0, 10) : null,
        amount: inst.plannedAmount.amount,
        currency: inst.plannedAmount.currency,
      });
    });
  });
  // THE DERIVED HEALTH, not the reported one (YC-021 L3 交付项目与里程碑).
  // projectView() already computes it - an overdue instalment or a missed
  // milestone pulls a manager's "green" down - and this page printed the
  // stored column anyway, so a project with money overdue read healthy here
  // while /delivery said otherwise. When the view could not be read, the
  // reported value is shown and the milestones say they could not be read,
  // rather than rendering as "no milestones".
  const rosterProjects = (projects.ok ? projects.value : []).map((pr, i) => {
    const pv = projectViews[i];
    const health = pv?.ok ? pv.value.derivedHealth : pr.health;
    return {
      id: pr.id,
      name: pr.name,
      healthLabel: PROJECT_HEALTH_LABEL[health] ?? health,
      healthTone: (health === "green"
        ? "success"
        : health === "amber"
          ? "warning"
          : "danger") as "success" | "warning" | "danger",
      healthNote: pv?.ok ? healthOverrideText(pv.value.healthOverriddenBecause) || null : null,
      milestonesReadable: pv?.ok === true,
    };
  });

  const revenueOutstanding =
    collectionTotals.size === 1
      ? (([currency, t]) => ({ amount: t.planned - t.collected, currency }))(
          [...collectionTotals.entries()][0],
        )
      : null;


  // 合同 tab view model. Dates cross to the client as yyyy-mm-dd strings.
  const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const productNameOf = new Map((productsRead.ok ? productsRead.value : []).map((p) => [p.id, p.name]));
  const contractRead: ContractReadState =
    contractsRead === null
      ? { kind: "failed" }
      : contractsRead.ok
        ? { kind: "ok" }
        : { kind: "refused", text: loadFailureText(contractsRead.violations, CONTRACT_ERROR) };
  const contractRecords = contractsRead?.ok ? contractsRead.value : [];
  // Lineage numbers come from the same read: the predecessor and successor of
  // an account's contract are that account's contracts too.
  const contractNoOf = new Map(contractRecords.map((c) => [c.id, c.contractNo]));
  const contractRows: ContractRow[] = contractRecords.map((c) => {
    const lineCurrencies = new Set(c.lines.map((l) => l.currency));
    return {
      id: c.id,
      contractNo: c.contractNo,
      name: c.name,
      status: c.status,
      phase: contractPhase(c, now),
      renewedFromNo: c.renewedFromContractId ? (contractNoOf.get(c.renewedFromContractId) ?? null) : null,
      renewedByNo: c.renewedBy ? (contractNoOf.get(c.renewedBy) ?? null) : null,
      events: c.events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        successorNo: e.successorContractId ? (contractNoOf.get(e.successorContractId) ?? null) : null,
        reason: e.reason,
        occurredAt: e.occurredAt.toISOString().slice(0, 10),
        actorName: e.actorSub ? (memberNameOf.get(e.actorSub) ?? null) : null,
      })),
      opportunityId: c.opportunityId,
      totalAmount: c.totalAmount,
      currency: c.currency,
      termStart: ymd(c.termStart),
      termEnd: ymd(c.termEnd),
      daysLeft: daysToTermEnd(c, now),
      noticeBy: ymd(noticeDeadline(c)),
      noticeDays: c.noticeDays,
      signedAt: ymd(c.signedAt),
      lines: c.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        productName: productNameOf.get(l.productId) ?? null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        amount: l.amount,
        currency: l.currency,
        termEnd: ymd(l.termEnd),
      })),
      // Summed in minor units, and only when the lines share one currency.
      lineTotal:
        lineCurrencies.size <= 1
          ? c.lines.reduce((sum, l) => sum + Math.round(l.amount * 100), 0) / 100
          : null,
    };
  });
  const ownedRows = ownedProducts(contractRecords, now).map((o) => ({
    productId: o.productId,
    productName: productNameOf.get(o.productId) ?? null,
    quantity: o.quantity,
    runsUntil: ymd(o.runsUntil),
  }));
  // 白地 (§9.3): sellable minus 已购态. An unreadable catalogue is `unknown`,
  // never "everything" - see lib/whitespace.ts.
  const activeStatus = new Set(
    (statusesRead.ok ? statusesRead.value : []).filter((s) => s.statusCode === "active").map((s) => s.id),
  );
  const sellableIds =
    productsRead.ok && statusesRead.ok
      ? productsRead.value.filter((p) => activeStatus.has(p.statusId)).map((p) => p.id)
      : null;
  const space = whitespace(sellableIds, new Set(ownedRows.map((o) => o.productId)));
  const whitespaceView =
    space.state === "known"
      ? { state: "known" as const, items: space.productIds.map((pid) => ({ id: pid, name: productNameOf.get(pid) ?? pid })) }
      : { state: "unknown" as const };

  const canRenewContract = can(
    session.authz,
    session.entitlement,
    "delivery.contract.renew",
    "ui",
  ).allowed;
  const canWriteContract = can(
    session.authz,
    session.entitlement,
    "delivery.contract.upsert",
    "ui",
  ).allowed;


  const chainedDealIds = new Set((chain.ok ? chain.value : []).map((c) => c.opportunityId));
  const dealRows: DealLifecycleRow[] = (deals.ok ? deals.value : []).map((d) => {
    const j = relevantJudgements.find((x) => x.subjectType === "opportunity" && x.subjectId === d.id);
    const stageIndex = openStages.indexOf(d.stage);
    return {
      id: d.id,
      name: d.name,
      opportunityNo: d.opportunityNo,
      stageLabel: stageLabelFor(d.stage, stageDefinitions, STAGE_LABEL),
      ownerName: memberNameOf.get(d.ownerSub) ?? null,
      amount: d.amount?.amount ?? null,
      currency: d.currency,
      status: d.status as "open" | "won" | "lost",
      insight: j
        ? {
            claim: j.claim,
            rule: j.rule ?? null,
            tone: j.urgency === "today" ? "danger" : j.urgency === "week" ? "warning" : "neutral",
            source: j.source,
          }
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
      capabilityKey: a.capability,
      rationale: a.rationale,
      confidence: a.confidence,
    }));

  // 采纳后成效回看 (L6 batch four). Accepted decisions on this account or one
  // of its deals, newest first, the last 90 days, at most five - a review is
  // for recent decisions a person still remembers making.
  const REVIEW_LOOKBACK_DAYS = 90;
  const decidedReads = await Promise.all([
    listProposals({ ...base, store: getCopilotStore() }, { status: "accepted" }),
    listProposals({ ...base, store: getCopilotStore() }, { status: "executed" }),
  ]);
  const reviewable = decidedReads
    .flatMap((r) => (r.ok ? r.value : []))
    .filter((a) => a.subjectId === id || dealIds.has(a.subjectId))
    .filter(isReviewable)
    .filter((a) => now.getTime() - a.decidedAt.getTime() <= REVIEW_LOOKBACK_DAYS * 86_400_000)
    .sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime())
    .slice(0, 5);
  // Only when there is something to review: the full interaction history
  // (the page's own read stops at the newest 50, which could cut a window
  // off) and each deal's stage log. One stageHistory per deal - the same
  // small-N the page already accepts for projectView.
  const [reviewInteractions, reviewStages] =
    reviewable.length === 0
      ? [null, []]
      : await Promise.all([
          listInteractions(fieldCtx, { accountId: id }),
          Promise.all(
            (deals.ok ? deals.value : []).map((d) =>
              stageHistory({ ...base, store: session.stores.pipeline() }, d.id),
            ),
          ),
        ]);
  const dealNameOf = new Map((deals.ok ? deals.value : []).map((d) => [d.id, d.name]));
  const stageMovesAll = reviewStages.flatMap((r) => (r.ok ? r.value : []));
  const reviewSourcesFailed =
    reviewable.length > 0 &&
    (!reviewInteractions?.ok || !commitments.ok || reviewStages.some((r) => !r.ok));
  const stageName = (s: string | null) => (s ? stageLabelFor(s, stageDefinitions, STAGE_LABEL) : "");
  const planReviews: PlanReview[] = reviewable.map((a) => {
    // A deal-level decision is judged on that deal's own rows; an
    // account-level one on everything at the account.
    const oppOnly = a.subjectType === "opportunity" ? a.subjectId : null;
    const mine = <T extends { opportunityId: string | null }>(rows: readonly T[]) =>
      oppOnly ? rows.filter((r) => r.opportunityId === oppOnly) : rows;
    const interactionRows = reviewInteractions?.ok ? reviewInteractions.value : [];
    const commitmentRows = commitments.ok ? commitments.value : [];
    const review = reviewOutcome(a, {
      stageMoves: mine(stageMovesAll),
      interactions: mine(interactionRows),
      commitments: mine(commitmentRows),
    }, now);
    const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
    const interactionById = new Map(interactionRows.map((i) => [i.id, i]));
    const commitmentById = new Map(commitmentRows.map((c) => [c.id, c]));
    return {
      id: a.id,
      title: AGENT_ACTION_LABEL[a.actionType] ?? a.actionType,
      subjectName: oppOnly ? (dealNameOf.get(oppOnly) ?? null) : null,
      decidedAt: ymdOf(a.decidedAt),
      windowEnd: ymdOf(review.windowEnd),
      windowClosed: review.windowClosed,
      readFailed: reviewSourcesFailed,
      nothingFollowed: review.nothingFollowed,
      stageMoves: review.stageMoves.map((s) => ({
        id: s.id,
        opportunityId: s.opportunityId,
        opportunityName: dealNameOf.get(s.opportunityId) ?? null,
        from: stageName(s.fromStage),
        to: stageName(s.toStage),
        date: ymdOf(s.occurredAt),
      })),
      interactions: review.interactions.map((i) => {
        const row = interactionById.get(i.id)!;
        return {
          id: i.id,
          date: ymdOf(i.occurredAt),
          channel: CHANNEL_LABEL[row.channel] ?? row.channel,
          // The original, verbatim - the review's evidence is the record itself.
          text: row.summary ?? row.subject ?? row.rawNote,
        };
      }),
      commitmentsMet: review.commitmentsMet.map((c) => ({
        id: c.id,
        statement: commitmentById.get(c.id)?.statement ?? "",
        date: ymdOf(c.metAt!),
      })),
      commitmentsMissed: review.commitmentsMissed.map((c) => ({
        id: c.id,
        statement: commitmentById.get(c.id)?.statement ?? "",
        date: ymdOf(c.dueAt),
      })),
    };
  });

  // 说法核对 (L2 batch 7b). The last check is read from this member's own
  // copilot sessions - the store lists sessions per member - so the sentence
  // says when YOU last checked. Pending conflicts are the flag_conflict
  // proposals already in the page's proposal read.
  const canCheckConsistency = can(session.authz, session.entitlement, "copilot.suggest", "ui").allowed;
  const mySessions = canCheckConsistency
    ? await getCopilotStore().listSessions(session.workspaceId, session.user.sub, 50).catch(() => [])
    : [];
  const lastCheckedAt = lastConsistencyCheck(mySessions, id);
  const lastChecked = lastCheckedAt ? lastCheckedAt.toISOString().slice(0, 10) : null;
  const interactionDate = new Map(
    (interactions.ok ? interactions.value : []).map((i) => [i.id, i.occurredAt.toISOString().slice(0, 10)]),
  );
  const pendingConflicts: PendingConflict[] = (proposals.ok ? proposals.value : [])
    .filter((a) => a.actionType === CONFLICT_ACTION_TYPE && a.subjectId === id)
    .map((a) => {
      const p = a.payload as { topic?: string; a?: { interactionId?: string; quote?: string }; b?: { interactionId?: string; quote?: string } };
      return {
        id: a.id,
        topic: p.topic ?? "",
        a: { date: interactionDate.get(p.a?.interactionId ?? "") ?? null, quote: p.a?.quote ?? "" },
        b: { date: interactionDate.get(p.b?.interactionId ?? "") ?? null, quote: p.b?.quote ?? "" },
      };
    });

  const rosterSummary = (() => {
    const parts: string[] = [];
    const openDeals = (deals.ok ? deals.value : []).filter((d) => d.status === "open").length;
    if (openDeals > 0) parts.push(COLLAPSE_TEXT.dealsOpen(openDeals));
    const overdue = revenueRows.filter((r) => r.overdue).length;
    if (overdue > 0) parts.push(COLLAPSE_TEXT.revenueOverdue(overdue));
    if (contractRows.some((c) => c.phase === "lapsed")) parts.push(COLLAPSE_TEXT.contractLapsed);
    const soonest = contractRows
      .filter((c) => c.phase === "in_force" && c.daysLeft !== null && c.daysLeft <= 90)
      .map((c) => c.daysLeft as number)
      .sort((a, b) => a - b)[0];
    if (soonest !== undefined) parts.push(COLLAPSE_TEXT.contractDue(soonest));
    if (pendingConflicts.length > 0) parts.push(COLLAPSE_TEXT.conflictsPending(pendingConflicts.length));
    // Norm: never empty - a quiet roster says it is quiet.
    return parts.length > 0 ? parts.join(COLLAPSE_TEXT.separator) : COLLAPSE_TEXT.rosterQuiet;
  })();

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

  // 联系人和最近跟进合并 (owner, 2026-09-20: mockup - 一个最近跟进天数,
  // 不是分开的两个事实). chainRecency() only needs `id` to look up
  // lastContactByContact() - decisionRole/influence are carried through
  // unused here, so "unknown" is a type placeholder, not a claim about the
  // roster's decision roles (which are per-deal, not per-account: see
  // ContactRecord's own comment for why the roster carries none).
  const rosterRecency = relations.ok
    ? await chainRecency(
        fieldCtx,
        id,
        contacts.map((c) => ({ id: c.id, decisionRole: "unknown" as const, influence: null, status: c.status, stance: null })),
        relations.value,
        { now },
      )
    : null;
  // 精准天数, 不是 windowDays 分档 (owner, 2026-09-21: "90天内有跟进"表达
  // 很差，应该精准显示（nn天）前联系) - lastContactAt 是 analyzeChainRecency
  // 已经算过的同一张 Map(见 health.ts 同名字段的注释), 这里只是多读一次
  // 已经在手上的数据算天数差, 不是新读一次。
  const contactRecencyText: Record<string, { text: string; warm: boolean; tooltip: string }> = {};
  if (rosterRecency && rosterRecency.ok) {
    const lastByContact = rosterRecency.value.lastContactAt;
    const warmIds = new Set(rosterRecency.value.warm.map((c) => c.id));
    contacts.forEach((c) => {
      const last = lastByContact.get(c.id) ?? null;
      if (last) {
        const days = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86_400_000));
        contactRecencyText[c.id] = {
          text: ACCOUNT_TEXT.contactRecencyDays(days),
          warm: warmIds.has(c.id),
          tooltip: ACCOUNT_TEXT.contactRecencyTooltip(c.name, days),
        };
      } else {
        contactRecencyText[c.id] = {
          text: ACCOUNT_TEXT.contactRecencyUnrecorded,
          warm: false,
          tooltip: ACCOUNT_TEXT.contactRecencyTooltipUnrecorded(c.name),
        };
      }
    });
  }

  const canAsk = can(session.authz, session.entitlement, "copilot.ask", "ui").allowed;
  const canLinkGraph = can(session.authz, session.entitlement, "account.graph.link", "ui").allowed;
  const canLinkContact = can(session.authz, session.entitlement, "account.contact.upsert", "ui").allowed;
  const canManageCollaborators = can(session.authz, session.entitlement, "account.collaborator.manage", "ui").allowed;
  const [collaboratorsRead, ownerRead] = await Promise.all([
    listAccountCollaborators(
      { ...base, store: session.stores.account(), authz: getAuthzStore() },
      id,
    ),
    resolveAccountOwner(
      { ...base, store: session.stores.account(), authz: getAuthzStore() },
      account.ownerSub,
    ),
  ]);

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
          facts: {
            covered: c.coverage.covered,
            missing: c.coverage.missing,
            personIds: c.people.filter((p) => p.status === "active").map((p) => p.id),
          },
          detail: (
            <DecisionChainDetail
              key={c.opportunityId}
              title={CHAIN_TEXT.forDeal(c.opportunityName)}
              coverage={c.coverage}
              people={c.people}
              contacts={contacts}
              relations={relations.ok ? relations.value : []}
              recency={recencyRead}
              editHref={`/pipeline/${c.opportunityId}`}
              linkForm={
                i === 0
                  ? {
                      accountId: id,
                      contacts: c.people,
                      contactNames: contactNameById,
                      canLink: canLinkGraph,
                      unreachable: c.coverage.economicBuyerUnreachable,
                      onLink: linkAccountContacts,
                    }
                  : undefined
              }
            />
          ),
        };
      })
    : [];

  // header 的三个动态维度 (owner, 2026-09-18: header 三维度顺序 - 商机数量 /
  // 客户级别 / 健康评估), 都是已有真实数据的读数, 不是新字段。
  const openDealsCount = dealRows.filter((d) => d.status === "open").length;
  // 累计合同额 (owner, 2026-09-21: 徽章区第一块补充商机数/累计合同额两行
  // 信息) - 跟 openDealsCount 同一个口径, 只统计 status=open 的商机, 不是
  // 这个客户全部历史成交额。只在这批开放商机的金额能合并成"同一个币种的
  // 一个数"时才给出总额 (跟 revenueOutstanding 的 collectionTotals 同一个
  // 处理方式) - 混币种或全部未定价时给 null, 徽章只显示商机数, 不硬凑一个
  // 会误导的合计。
  const openDealAmountTotals = new Map<string, number>();
  dealRows
    .filter((d) => d.status === "open" && d.amount != null)
    .forEach((d) => {
      openDealAmountTotals.set(d.currency, (openDealAmountTotals.get(d.currency) ?? 0) + d.amount!);
    });
  const openDealsAmount =
    openDealAmountTotals.size === 1
      ? (([currency, amount]) => ({ amount, currency }))([...openDealAmountTotals.entries()][0])
      : null;
  const tierLabel =
    account.tier === "strategic"
      ? POSITION_TEXT.tierStrategic
      : account.tier === "key"
        ? POSITION_TEXT.tierKey
        : POSITION_TEXT.tierStandard;

  // 性质/类型 resolved to display names (owner: 补充 - 性质/类型/行业/区域/
  // 地址). account.customerNatureId/customerTypeId 早就存在, 词表读也早就
  // 存在(给编辑表单用) - 这里只是第一次把 id 解析成名字用于只读展示, 不是
  // 新读一次。
  const customerNatureName =
    account.customerNatureId && customerNaturesRead.ok
      ? (customerNaturesRead.value.find((n) => n.id === account.customerNatureId)?.name ?? null)
      : account.customerNature;
  const customerTypeName =
    account.customerTypeId && customerTypesRead.ok
      ? (customerTypesRead.value.find((t) => t.id === account.customerTypeId)?.name ?? null)
      : account.customerType;
  const customerSizeName =
    account.customerSizeId && customerSizesRead.ok
      ? (customerSizesRead.value.find((s) => s.id === account.customerSizeId)?.name ?? null)
      : account.customerSize;

  // 状态标签是"动态评估" (owner: 补充 - status tag 不能在 sidebar, 应该在
  // content) - 搬进 health-panel.tsx 的卡头, 跟客户评估同一张卡; health 不可用
  // (只读成员, 见上面 persist:false 的说明)时退化成不挂卡片的纯文本, 而不是
  // 整个消失。
  const statusTag = derivedStatus ? (
    <Tag tone={derivedStatus === "churned" ? "danger" : "neutral"} dot>
      {ACCOUNT_STATUS_LABEL[derivedStatus] ?? derivedStatus}
    </Tag>
  ) : null;

  // 销售负责人, 纯文本, footer 专用 (owner, 2026-09-21: 销售负责人迁移到
  // card 最底部 - ACC-0001 不再跟它同一行, 见下面 title 那一侧). 没有负责人
  // 时是 null, OrgUnitPanel 整段 footer 不渲染。OwnerEditor 自己的编辑
  // 触发器已经搬进侧栏顶部的"客户总编辑", 这一行不带任何按钮。
  // 协作人 ON THE CARD, for everyone who can see the customer (YC-021 单位信息:
  // 协作人). They were listed only inside the 编辑销售负责人 drawer, which a
  // member without the manage right never opens - so who else works this
  // customer was invisible to exactly the people who needed to ask them.
  const collaboratorNames = (collaboratorsRead.ok ? collaboratorsRead.value : [])
    .map((c) => c.displayName ?? c.memberSub);
  const ownerName = ownerRead.ok ? ownerRead.value : null;
  const ownerRow =
    ownerName || collaboratorNames.length > 0 ? (
      <span className="flex flex-col gap-2xs text-body-sm">
        {ownerName ? <span>{ACCOUNT_TEXT.headerOwner(ownerName)}</span> : null}
        {collaboratorNames.length > 0 ? (
          <span className="text-muted-foreground">{ACCOUNT_TEXT.collaboratorsLine(collaboratorNames)}</span>
        ) : null}
      </span>
    ) : null;

  // 徽章区: 开放商机(累计合同额) / 客户级别 / 健康评估 (owner, 2026-09-21:
  // 三个图形区域起个名字，叫徽章区；三个徽章整体居中显示 - 之前默认靠左)。
  const badges = (
    <div className="flex items-center justify-center gap-md">
      <DealsSummaryBadge
        count={openDealsCount}
        countLabel={POSITION_TEXT.planDeals}
        amountText={openDealsAmount ? formatMoneyCompact(openDealsAmount.amount, openDealsAmount.currency, locale) : null}
        amountLabel={POSITION_TEXT.openDealsAmountLabel}
        amountFullText={openDealsAmount ? formatMoney(openDealsAmount.amount, openDealsAmount.currency, locale) : null}
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
    </div>
  );

  // 定向自动分析 (owner, 2026-09-18): 判断题放 sidebar - 单位信息卡的最下方,
  // 不再是独立的横幅。
  const judgement = topJudgement
    ? {
        claim: topJudgement.claim,
        rule: topJudgement.rule ?? null,
        freshness: topJudgement.freshness ?? null,
        source: topJudgement.source,
        citations: topJudgement.citations,
      }
    : null;

  return (
    // TWO PANES, BOTH SERVER-RENDERED (fix, 2026-09-23 - lib/sidebar-slot.ts).
    // ChainViewProvider renders no DOM, so the aside and the centre stay
    // direct children of the shell's body row while sharing one context.
    <AccountEditProvider canWrite={canWrite}>
    <ChainViewProvider chains={chainSummaryItems}>
      {/* HEADER 没了 (owner, 2026-09-20: 补充 - 把中部第一块-客户信息卡整合
          进 sidebar-单位信息). ViewHeader 原来管的三件事 - 标题/状态、
          ACC-0001+销售负责人、三个动态维度+"···"菜单 - 现在分别落到:
          单位信息卡(标题+徽章区+ownerRow, 侧栏, 纯展示), 客户评估卡
          的卡头(状态标签, 内容区, 因为它是"动态评估"), 内容区面包屑行的
          右侧操作区里的"客户总编辑"(三个配置动作合并成一个, owner: 展示/
          编辑拆解)。判断题横幅也没了 - 挪进单位信息卡最下方(owner: 判断题
          放sidebar)。PageCrumbs 挪进内容区(owner: 面包屑放content), 不再是
          跨两栏的页面级横条 - "客户总编辑"最初挂在侧栏顶部的功能条(返回、
          收起/展开、客户总编辑三个按钮), 那条功能条在 2026-09-21 整条撤掉
          (owner: 聚焦客户全景图页面 - 全局 header 的战况板开关恢复后, 返回/
          收起展开都变得多余), 只有"客户总编辑"跟着搬到这里, 见下面面包屑行
          自己的说明。 */}
      <aside className={BOARD_PANE_CLASS}>
      <div className="flex flex-col gap-lg">
        {/* ======== 单位信息 + 联系人 + 决策链摘要 + 档案缺口, portaled into
            the shell's left sidebar. 目标 div 自己已经是 flex flex-col
            gap-lg(app-shell.tsx), 这里不再重复包一层。 ======== */}
        <OrgUnitPanel
          title={account.name}
          accountNo={account.accountNo}
          ownerRow={ownerRow}
          badges={badges}
          parentId={account.parentId}
          parentName={parentName}
          children={childUnits}
          industry={account.industry}
          region={account.region}
          customerNatureName={customerNatureName}
          customerTypeName={customerTypeName}
          scaleName={customerSizeName}
          more={{
            province: account.province,
            creditCode: account.creditCode,
            website: account.website,
            employeeCount: account.employeeCount,
          }}
          remove={
            canWrite
              ? { accountId: id, onFootprint: accountFootprintAction, onDelete: deleteAccountAction }
              : undefined
          }
        />

        <ContactRoster
          contacts={contacts}
          canEdit={canLinkContact}
          editHref={`/contact/new?account=${id}&back=/account/${id}`}
          recencyText={contactRecencyText}
          link={
            canLinkContact
              ? { accountId: id, onSearch: searchContactsAction, onLink: linkExistingContactAction }
              : undefined
          }
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
      </aside>

      <div className={CENTRE_PANE_CLASS}>
      <ViewLayout>

        {/* ======== content: 面包屑行, then 栏2 - the lifecycle spine, then
            this account's own decision items. 面包屑放这里(owner: 判断题
            放sidebar，面包屑放content), 不再是跨两栏的页面级横条。
            面包屑行拆成左右两块(owner, 2026-09-21: 聚焦客户全景图页面 -
            sidebar 顶部的功能条撤掉了, 操作按钮=客户总编辑跟着搬到这里) -
            左边面包屑, 右边操作区, 目前只有客户总编辑这一个按钮; 不再经过
            AccountSidebarPortal - 这里已经是 page.tsx 直接渲染的内容区,
            不需要传送门。 ======== */}
        <div className="flex min-w-0 flex-col gap-lg">
          <div className="flex items-center justify-between gap-sm">
            <ChainCrumbs trail={[{ label: DOMAIN_LABEL.account, href: "/account" }]} current={account.name} />
            <AccountHeaderMenu />
            {/* The three editors, shared with the panels' own menus
                (account-edit-context.tsx) - rendered here, inside the
                centre pane, so they add no child to the shell's row. */}
            <AccountEditDrawers
              tier={{
                accountId: id,
                tier: detail.value.account.tier,
                period: DEFAULT_PERIOD,
                onDesignate: designateAccountTier,
              }}
              basics={{
                accountId: id,
                accountNo: account.accountNo,
                name: account.name,
                region: account.region,
                province: account.province,
                industryId: account.industryId,
                segmentCode: account.segmentCode,
                customerTypeId: account.customerTypeId,
                customerSizeId: account.customerSizeId,
                customerNatureId: account.customerNatureId,
                creditCode: account.creditCode,
                website: account.website,
                employeeCount: account.employeeCount,
                industries: industriesRead && industriesRead.ok ? industriesRead.value.map((i) => ({ id: i.id, name: i.name })) : [],
                segments: segmentsRead && segmentsRead.ok ? segmentsRead.value.map((s) => ({ id: s.segmentCode, name: s.name })) : [],
                customerTypes: customerTypesRead.ok ? customerTypesRead.value.map((t) => ({ id: t.id, name: t.name })) : [],
                customerSizes: customerSizesRead && customerSizesRead.ok ? customerSizesRead.value.map((s) => ({ id: s.id, name: s.name })) : [],
                customerNatures: customerNaturesRead.ok ? customerNaturesRead.value.map((n) => ({ id: n.id, name: n.name })) : [],
                canWrite,
                onSave: updateAccountBasicsAction,
                orgRelations: (
                  <OrgRelationsEditor
                    accountId={id}
                    parentId={account.parentId}
                    children={childUnits}
                    accounts={accountRows}
                    onSetParent={setAccountParentAction}
                  />
                ),
                contactManagement: (
                  <ContactManagementList
                    accountId={id}
                    contacts={contacts}
                    canEdit={canLinkContact}
                    editHref={`/contact/new?account=${id}&back=/account/${id}`}
                    onMove={moveContactAction}
                    onUnlink={canLinkContact ? unlinkContactAction : undefined}
                    recencyText={contactRecencyText}
                    linkForm={
                      canLinkContact ? (
                        <LinkContactDrawer
                          accountId={id}
                          onSearch={searchContactsAction}
                          onLink={linkExistingContactAction}
                        />
                      ) : undefined
                    }
                  />
                ),
              }}
              owner={{
                accountId: id,
                ownerName: ownerRead.ok ? ownerRead.value : null,
                collaborators: collaboratorsRead.ok ? collaboratorsRead.value : [],
                canManage: canManageCollaborators,
                onSearch: searchColleaguesAction,
                onAdd: addCollaboratorAction,
                onRemove: removeCollaboratorAction,
              }}
            />
          </div>

          <PanoramaLegend
            basicLabel={ACCOUNT_TEXT.capBasic}
            proLabel="Pro"
            pendingLabel={ACCOUNT_TEXT.capPending}
            layerLabels={{
              L1: ACCOUNT_TEXT.panoramaLayerL1,
              L2: ACCOUNT_TEXT.panoramaLayerL2,
              L3: ACCOUNT_TEXT.panoramaLayerL3,
              L4: ACCOUNT_TEXT.panoramaLayerL4,
              L5: ACCOUNT_TEXT.panoramaLayerL5,
              L6: ACCOUNT_TEXT.panoramaLayerL6,
              EV: ACCOUNT_TEXT.panoramaLayerEV,
            }}
            coreLabel={ACCOUNT_TEXT.panoramaCapCore}
            highLabel={ACCOUNT_TEXT.panoramaCapHigh}
            designedLabel={ACCOUNT_TEXT.panoramaCapDesigned}
          />

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
              statusTag={statusTag}
              judgement={judgement}
            />
          ) : (
            // 只读成员没有 health(见上面 persist:false 的说明), 状态标签和
            // 判定信息仍然要显示 - 退化成不挂卡片的纯文本/独立一行, 而不是
            // 整个消失 (owner: 判定信息应该移到客户评估板块 - health 不可用
            // 时也不能跟着 HealthPanel 一起消失, judgement-note.tsx 抽成
            // 共享组件正是为了这里)。
            <div className="flex flex-col gap-sm">
              <div className="flex items-center gap-xs">{statusTag}</div>
              {judgement ? <JudgementNote judgement={judgement} /> : null}
            </div>
          )}

          {/* 没有 description - 去掉所有垃圾说明 (owner, 2026-09-20; 理由见
              components/org-unit-panel.tsx 同名注释). icon 换成 map-pin, 不用
              AnalysisTabs 原来给三个图表切换块留的 chart-bar - 这五个 tab 是
              清单, 不是图表 (owner, 2026-09-21: 梳理全景图中心区域)。 */}
          <AnalysisTabs
            id="account-lifecycle"
            icon="map-pin"
            // 收起后的一行重点 (owner, 2026-09-23): what is still in the air
            // across both layers - open deals and overdue money (L3), a
            // contract lapsed or coming up within 90 days (L4), and any
            // conflicting statements waiting to be confirmed.
            collapsible={{ summary: rosterSummary }}
            title={
              <span className="inline-flex items-center gap-xs whitespace-nowrap">
                <span>{ACCOUNT_TEXT.roster}</span>
                {/* L3 · L4 (owner, 2026-09-23): 增量与存量是同一个板块 -
                    商机/交付/回款是在打的(L3), 合同 tab 是已经占住的(L4,
                    L4 批一 owner 裁定合一卡)。两个色标并排, 跟页面图例的
                    分层配色一致, 不合成一个单色标。 */}
                <span className="inline-flex items-center gap-3xs">
                  <LayerLabel layer="L3" />
                  <LayerLabel layer="L4" />
                </span>
              </span>
            }
            // 默认展开第一个有内容的 tab, 而不是死板地永远停在"商机"
            // (owner, 2026-09-21: 梳理全景图中心区域 - 阵地清单默认展开的
            // tab) - 商机是这张清单最想展示的对象, 但一个没有开放商机的
            // 账户打开这张卡, 第一眼看到的不该是一个空 tab。
            defaultKey={
              dealRows.length > 0
                ? "deals"
                : rosterProjects.length > 0
                  ? "projects"
                  : revenueRows.length > 0
                    ? "revenue"
                    : contractRows.length > 0
                      ? "contracts"
                    : (commitments.ok ? commitments.value.length : 0) > 0
                      ? "commitments"
                      : "interactions"
            }
            tabs={[
              {
                key: "deals",
                // This tab's 查看 / 编辑 in the roster's "⋮" (owner, 2026-09-23).
                view: { href: "/pipeline" }, edit: { hint: PANEL_MENU_TEXT.noEntryHere },
                label: `${ACCOUNT_TEXT.lifecycleDeals} (${dealRows.length})`,
                content: <>
                  <DealLifecyclePanel deals={dealRows} defaultCurrency={defaultCurrency} />
                  <CapFooter>
                    <CapBadge tier="basic">{ACCOUNT_TEXT.capBasic}</CapBadge> {ACCOUNT_TEXT.capDealBasic}
                    <br />
                    <CapBadge tier="pro">Pro</CapBadge> {ACCOUNT_TEXT.capDealPro}
                  </CapFooter>
                </>,
              },
              {
                key: "projects",
                // This tab's 查看 / 编辑 in the roster's "⋮" (owner, 2026-09-23).
                view: { href: "/delivery" }, edit: { hint: PANEL_MENU_TEXT.noEntryHere },
                label: `${ACCOUNT_TEXT.lifecycleProjects} (${rosterProjects.length})`,
                content: <>
                  {rosterProjects.length === 0 ? (
                    <p className="text-muted-foreground text-body-sm">{ACCOUNT_TEXT.rosterNoProjects}</p>
                  ) : (
                    <div className="flex flex-col gap-md">
                      {rosterProjects.map((pr) => (
                        <ProjectLifecyclePanel
                          key={pr.id}
                          projectName={pr.name}
                          healthLabel={pr.healthLabel}
                          healthTone={pr.healthTone}
                          healthNote={pr.healthNote}
                          milestones={pr.milestonesReadable ? (milestonesByProject.get(pr.id) ?? []) : null}
                        />
                      ))}
                    </div>
                  )}
                  <CapFooter>
                    <CapBadge tier="basic">{ACCOUNT_TEXT.capBasic}</CapBadge> {ACCOUNT_TEXT.capProjectBasic}
                    <br />
                    <CapBadge tier="pro">Pro</CapBadge> {ACCOUNT_TEXT.capProjectPro}
                  </CapFooter>
                </>,
              },
              {
                key: "revenue",
                // This tab's 查看 / 编辑 in the roster's "⋮" (owner, 2026-09-23).
                // 查看 opens THIS customer's schedule on /collection, where the
                // status moves (YC-021 回款: 回款状态流转) - not the workspace's.
                view: { href: `/collection?account=${id}` }, edit: { href: `/collection?account=${id}` },
                label: `${ACCOUNT_TEXT.lifecycleRevenue} (${revenueRows.length})`,
                content: <>
                  <RevenueLifecyclePanel rows={revenueRows} outstanding={revenueOutstanding} />
                  <CapFooter>
                    <CapBadge tier="basic">{ACCOUNT_TEXT.capBasic}</CapBadge> {ACCOUNT_TEXT.capRevenueBasic}
                    <br />
                    <CapBadge tier="pro">Pro</CapBadge> {ACCOUNT_TEXT.capRevenuePro}
                  </CapFooter>
                </>,
              },
              {
                // 合同 - 排在回款之后, 钱相关的挨着 (L4 批一, owner
                // 2026-09-22: 存量资产合成一张卡, 是阵地清单里的一个 tab,
                // 不是第四张卡)。
                key: "contracts",
                // This tab's 查看 / 编辑 in the roster's "⋮" (owner, 2026-09-23).
                view: { hint: PANEL_MENU_TEXT.noListPage }, edit: canWriteContract ? ("contract-create" as const) : { hint: PANEL_MENU_TEXT.noEditRight },
                label: `${CONTRACT_TEXT.tab} (${contractRows.length})`,
                content: (
                  <ContractRoster
                    accountId={id}
                    read={contractRead}
                    contracts={contractRows}
                    owned={ownedRows}
                    revenue={installedRevenue(contractRecords, now)}
                    whitespace={whitespaceView}
                    products={(productsRead.ok ? productsRead.value : []).map((p) => ({ id: p.id, name: p.name }))}
                    deals={dealRows.filter((d) => d.status !== "lost").map((d) => ({ id: d.id, name: d.name }))}
                    defaultCurrency={defaultCurrency}
                    canWrite={canWriteContract}
                    onSaveContract={saveContract}
                    onSaveLine={saveContractLine}
                    onRemoveLine={deleteContractLine}
                    canRenew={canRenewContract}
                    onRenew={renewContractAction}
                    onRecordOutcome={recordRenewalOutcomeAction}
                  />
                ),
              },
              {
                // 承诺和跟进记录拆成两个 tab (owner, 2026-09-20: 先做跟进
                // 记录和承诺拆分) - mockup 的跟进记录 tab 从来只有跟进原文,
                // 承诺(commitment)是 mockup 完全没有的概念, 之前挤进同一个
                // tab 是这页自己的历史遗留, 不是设计要求。
                key: "commitments",
                // This tab's 查看 / 编辑 in the roster's "⋮" (owner, 2026-09-23).
                view: { hint: PANEL_MENU_TEXT.noListPage }, edit: { hint: PANEL_MENU_TEXT.noEntryHere },
                label: `${FIELD_TEXT.commitTitle} (${commitments.ok ? commitments.value.length : 0})`,
                content: commitments.ok ? (
                  <>
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
                      hideTitle
                    />
                    <CapFooter>
                      <CapBadge tier="basic">{ACCOUNT_TEXT.capBasic}</CapBadge> {ACCOUNT_TEXT.capCommitBasic}
                      <br />
                      <CapBadge tier="pro">Pro</CapBadge> {ACCOUNT_TEXT.capCommitPro}
                    </CapFooter>
                  </>
                ) : null,
              },
              {
                key: "interactions",
                // This tab's 查看 / 编辑 in the roster's "⋮" (owner, 2026-09-23).
                view: { hint: PANEL_MENU_TEXT.noListPage }, edit: { hint: PANEL_MENU_TEXT.noEntryHere },
                label: `${ACCOUNT_TEXT.lifecycleInteractions} (${interactions.ok ? interactions.value.length : 0})`,
                content: interactions.ok ? (
                  <>
                    <InteractionTimeline
                      items={interactions.value.map((i) => ({ ...i, actorName: memberNameOf.get(i.actorSub) ?? null, participantNames: participantsByInteraction.get(i.id) }))}
                      limit={20} hideDescription hideTitle
                      action={
                        canRecord || canCheckConsistency ? (
                          <span className="flex flex-col items-end gap-xs">
                            {canRecord ? (
                              <PasteNotesButton
                                accountId={id}
                                onPaste={structureMeetingNotes}
                              />
                            ) : null}
                            {canCheckConsistency ? (
                              <ConsistencyCheck
                                accountId={id}
                                lastChecked={lastChecked}
                                pending={pendingConflicts}
                                onCheck={checkConsistency}
                              />
                            ) : null}
                          </span>
                        ) : null
                      }
                    />
                    <CapFooter>
                      <CapBadge tier="basic">{ACCOUNT_TEXT.capBasic}</CapBadge> {ACCOUNT_TEXT.capTimelineBasic}
                      <br />
                      <CapBadge tier="pro">Pro</CapBadge> {ACCOUNT_TEXT.capTimelinePro}
                    </CapFooter>
                  </>
                ) : null,
              },
            ]}
          />

          <TheatrePlan proposals={planProposals} accountId={id} reviews={planReviews} />
          </>
          } />
        </div>
      </ViewLayout>
      </div>
    </ChainViewProvider>
    </AccountEditProvider>
  );
}
