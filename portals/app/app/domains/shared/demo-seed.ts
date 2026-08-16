// Demo dataset for the offline path.
//
// Without this, every page renders an empty state and the product cannot be
// seen or demonstrated. More importantly, the CHAIN cannot be seen: the whole
// product thesis is that strategy -> campaign -> signal -> lead -> opportunity
// -> project -> revenue are linked by data rather than by a spreadsheet, and a
// screenshot of seven empty tables does not show that.
//
// SAFETY: this can never touch a real database. The function accepts the
// IN-MEMORY store classes by type, not the ports they implement, so passing a
// Prisma store is a compile error rather than a runtime disaster. The registry
// additionally refuses to seed when DATABASE_URL is set. Two independent
// mechanisms, because "demo data appeared in production" is the kind of mistake
// that is discovered by a customer.
//
// The ids are literal and cross-referenced on purpose: opportunity opp_demo_1
// really does carry campaign camp_demo_1, so campaignReturn() computes a real
// number from a real join rather than from a fixture that agrees with itself by
// coincidence.

import { money } from "./money";
import type { InMemoryAccountStore } from "../account/store";
import type { InMemoryCopilotStore } from "../copilot/store";
import type { InMemoryDeliveryStore } from "../delivery/store";
import type { InMemoryPipelineStore } from "../pipeline/store";
import type { InMemoryPlanningStore } from "../planning/store";
import type { InMemorySignalStore } from "../signal/store";
import type { InMemoryStrategyStore } from "../strategy/store";

/** Anchored so the demo reads the same on every run rather than drifting. */
const NOW = new Date("2026-08-15T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const CNY = "CNY";
const OWNER = "usr_demo_rep";
const MANAGER = "usr_demo_pm";

export interface DemoStores {
  strategy: InMemoryStrategyStore;
  planning: InMemoryPlanningStore;
  account: InMemoryAccountStore;
  signal: InMemorySignalStore;
  pipeline: InMemoryPipelineStore;
  delivery: InMemoryDeliveryStore;
  copilot: InMemoryCopilotStore;
}

/**
 * Populate a workspace with one complete, traceable chain plus enough
 * surrounding data for each list to look like a real working set.
 *
 * The chain: plan_demo_1 -> camp_demo_1 -> sig_demo_1 -> lead_demo_1 ->
 * opp_demo_1 -> prj_demo_1 -> two instalments, one of them overdue (which is
 * what makes the delivery page demonstrate the overdue-forbids-green rule
 * instead of just asserting it).
 */
export function seedDemoWorkspace(workspaceId: string, stores: DemoStores): void {
  // --- D1 strategy ---------------------------------------------------------
  stores.strategy.seed({
    plans: [
      {
        id: "plan_demo_1",
        workspaceId,
        planNo: "PLAN-2026H2",
        name: "2026 H2 - attack mid-market retail",
        period: "2026H2",
        objective: "Win 12 mid-market retail logos with the POS replacement play.",
        ownerSub: "usr_demo_cro",
        status: "active",
        approvedAt: daysAgo(60),
      },
      {
        id: "plan_demo_2",
        workspaceId,
        planNo: "PLAN-2026H1",
        name: "2026 H1 - manufacturing beachhead",
        period: "2026H1",
        objective: null,
        ownerSub: "usr_demo_cro",
        status: "closed",
        approvedAt: daysAgo(240),
      },
    ],
    campaigns: [
      {
        id: "camp_demo_1",
        workspaceId,
        campaignNo: "CAMP-0001",
        name: "Retail POS replacement - outbound",
        planId: "plan_demo_1",
        segmentId: null,
        channel: "outbound",
        budgetAmount: money(200_000, CNY),
        ownerSub: "usr_demo_mkt",
        startsAt: daysAgo(45),
        endsAt: daysAhead(45),
        status: "running",
        currency: CNY,
      },
      {
        id: "camp_demo_2",
        workspaceId,
        campaignNo: "CAMP-0002",
        name: "Manufacturing webinar series",
        planId: "plan_demo_2",
        segmentId: null,
        channel: "event",
        budgetAmount: money(80_000, CNY),
        ownerSub: "usr_demo_mkt",
        startsAt: daysAgo(200),
        endsAt: daysAgo(120),
        status: "completed",
        currency: CNY,
      },
    ],
    executions: [
      { id: "exec_1", campaignId: "camp_demo_1", title: "Tier-1 outbound sequence", actionType: "outreach", assigneeSub: "usr_demo_mkt", dueAt: daysAgo(20), status: "done", workspaceId },
      { id: "exec_2", campaignId: "camp_demo_1", title: "POS migration guide", actionType: "content", assigneeSub: "usr_demo_mkt", dueAt: daysAgo(5), status: "done", workspaceId },
      { id: "exec_3", campaignId: "camp_demo_1", title: "Regional roadshow", actionType: "event", assigneeSub: "usr_demo_mkt", dueAt: daysAhead(15), status: "pending", workspaceId },
      { id: "exec_4", campaignId: "camp_demo_2", title: "Webinar 1", actionType: "event", assigneeSub: "usr_demo_mkt", dueAt: daysAgo(180), status: "done", workspaceId },
      { id: "exec_5", campaignId: "camp_demo_2", title: "Follow-up nurture", actionType: "nurture", assigneeSub: null, dueAt: daysAgo(150), status: "skipped", workspaceId },
    ],
    attributed: {
      // The join campaignReturn() reads. These ids match the pipeline seed
      // below, so the ROI on the campaign page is computed, not fabricated.
      [`${workspaceId}|camp_demo_1`]: [
        { id: "opp_demo_1", amount: money(2_400_000, CNY), status: "open" },
        { id: "opp_demo_4", amount: money(760_000, CNY), status: "won" },
      ],
      [`${workspaceId}|camp_demo_2`]: [{ id: "opp_demo_5", amount: money(320_000, CNY), status: "lost" }],
    },
  });

  // --- D2 planning ---------------------------------------------------------
  const period = "2026Q3";
  stores.planning.seed({
    territories: [
      { id: "terr_east", workspaceId, territoryCode: "EAST", name: "East China", parentId: null, ownerSub: OWNER, status: "active" },
      { id: "terr_north", workspaceId, territoryCode: "NORTH", name: "North China", parentId: null, ownerSub: "usr_demo_rep2", status: "active" },
    ],
    targets: [
      { id: "tgt_ws", workspaceId, period, scopeType: "workspace", territoryId: null, ownerSub: null, metric: "revenue", targetAmount: money(8_000_000, CNY), status: "committed", planId: "plan_demo_1" },
      { id: "tgt_east", workspaceId, period, scopeType: "territory", territoryId: "terr_east", ownerSub: null, metric: "revenue", targetAmount: money(5_000_000, CNY), status: "committed", planId: "plan_demo_1" },
      // Deliberately has NO snapshot, so the planning page demonstrates that
      // "not forecast yet" renders differently from "0% attained".
      { id: "tgt_north", workspaceId, period, scopeType: "territory", territoryId: "terr_north", ownerSub: null, metric: "revenue", targetAmount: money(3_000_000, CNY), status: "draft", planId: "plan_demo_1" },
    ],
    closed: {
      [`${workspaceId}|${period}|workspace||`]: money(3_160_000, CNY),
      [`${workspaceId}|${period}|territory|terr_east|`]: money(2_800_000, CNY),
    },
  });

  // --- D4 accounts ---------------------------------------------------------
  stores.account.seed({
    accounts: [
      { id: "acc_demo_1", workspaceId, accountNo: "ACC-0001", name: "East China Retail Group", industry: "Retail", region: "East", segmentCode: "MIDMARKET", ownerSub: OWNER, healthScore: 34, status: "active" },
      { id: "acc_demo_2", workspaceId, accountNo: "ACC-0002", name: "Southwest Manufacturing", industry: "Manufacturing", region: "Southwest", segmentCode: "ENTERPRISE", ownerSub: "usr_demo_rep2", healthScore: 78, status: "active" },
      { id: "acc_demo_3", workspaceId, accountNo: "ACC-0003", name: "Northern Telecom", industry: "Telecom", region: "North", segmentCode: "ENTERPRISE", ownerSub: OWNER, healthScore: null, status: "prospect" },
    ],
    contacts: [
      { id: "ct_1", workspaceId, accountId: "acc_demo_1", name: "Wang Lei", title: "CFO", department: "Finance", decisionRole: "economic", influence: 90, status: "active" },
      { id: "ct_2", workspaceId, accountId: "acc_demo_1", name: "Chen Hao", title: "IT Director", department: "IT", decisionRole: "technical", influence: 70, status: "active" },
      { id: "ct_3", workspaceId, accountId: "acc_demo_1", name: "Liu Min", title: "Ops Manager", department: "Operations", decisionRole: "coach", influence: 55, status: "active" },
      { id: "ct_4", workspaceId, accountId: "acc_demo_1", name: "Zhao Qiang", title: "Procurement", department: "Procurement", decisionRole: "blocker", influence: 60, status: "active" },
    ],
    relations: [
      // The coach can reach the economic buyer, so the chain analysis reports
      // reachable rather than merely "an economic buyer is on file".
      { workspaceId, accountId: "acc_demo_1", fromContactId: "ct_3", toContactId: "ct_1", relationType: "reports_to" },
      { workspaceId, accountId: "acc_demo_1", fromContactId: "ct_2", toContactId: "ct_1", relationType: "reports_to" },
      { workspaceId, accountId: "acc_demo_1", fromContactId: "ct_4", toContactId: "ct_1", relationType: "opposed_to" },
    ],
    healthInputs: {
      [`${workspaceId}|acc_demo_1`]: {
        openOpportunities: [{ stage: "negotiate" }],
        lastInteractionAt: daysAgo(48),
        projectHealth: ["amber"],
        overdueRevenueCount: 1,
      },
      [`${workspaceId}|acc_demo_2`]: {
        openOpportunities: [{ stage: "validate" }],
        lastInteractionAt: daysAgo(4),
        projectHealth: ["green"],
        overdueRevenueCount: 0,
      },
    },
  });

  // --- D5 signals and leads ------------------------------------------------
  stores.signal.seed({
    signals: [
      { id: "sig_demo_1", workspaceId, source: "campaign", sourceRef: "camp_demo_1", signalType: "intent", subject: "East China Retail Group evaluating POS replacements", payload: {}, detectedAt: daysAgo(40), accountId: "acc_demo_1", score: 88, status: "promoted" },
      // Unmatched: the new-logo case the inbox renders as "new logo".
      { id: "sig_demo_2", workspaceId, source: "news", sourceRef: "https://news.example/funding/992", signalType: "funding", subject: "Fresh Foods Chain raises Series C", payload: {}, detectedAt: daysAgo(6), accountId: null, score: 71, status: "scored" },
      { id: "sig_demo_3", workspaceId, source: "web", sourceRef: "https://jobs.example/8821", signalType: "hiring", subject: "Northern Telecom hiring 20 retail ops engineers", payload: {}, detectedAt: daysAgo(95), accountId: "acc_demo_3", score: 26, status: "scored" },
      { id: "sig_demo_4", workspaceId, source: "partner", sourceRef: "ref-4471", signalType: "referral", subject: "Partner referral: Yangtze Logistics", payload: {}, detectedAt: daysAgo(2), accountId: null, score: null, status: "new" },
    ],
    leads: [
      { id: "lead_demo_1", workspaceId, leadNo: "LEAD-00001", companyName: "East China Retail Group", contactName: "Liu Min", accountId: "acc_demo_1", signalId: "sig_demo_1", campaignId: "camp_demo_1", score: 88, ownerSub: OWNER, status: "converted", convertedOpportunityId: "opp_demo_1" },
      { id: "lead_demo_2", workspaceId, leadNo: "LEAD-00002", companyName: "Fresh Foods Chain", contactName: null, accountId: null, signalId: "sig_demo_2", campaignId: null, score: 71, ownerSub: OWNER, status: "qualified", convertedOpportunityId: null },
    ],
  });

  // --- D6 pipeline ---------------------------------------------------------
  stores.pipeline.seed([
    { id: "opp_demo_1", workspaceId, opportunityNo: "OPP-2026-0001", name: "Nationwide store digitalisation", accountId: "acc_demo_1", accountName: "East China Retail Group", planId: "plan_demo_1", campaignId: "camp_demo_1", territoryId: "terr_east", ownerSub: OWNER, stage: "negotiate", forecastCategory: "commit", amount: money(2_400_000, CNY), probability: 90, expectedCloseAt: daysAhead(46), closedAt: null, status: "open", currency: CNY },
    // Human-overridden win rate: the stage default at validate is 50.
    { id: "opp_demo_2", workspaceId, opportunityNo: "OPP-2026-0002", name: "Supply-chain platform phase 1", accountId: "acc_demo_2", accountName: "Southwest Manufacturing", planId: "plan_demo_1", campaignId: null, territoryId: "terr_east", ownerSub: "usr_demo_rep2", stage: "validate", forecastCategory: "best_case", amount: money(1_150_000, CNY), probability: 35, expectedCloseAt: daysAhead(61), closedAt: null, status: "open", currency: CNY },
    { id: "opp_demo_3", workspaceId, opportunityNo: "OPP-2026-0003", name: "Service desk automation", accountId: "acc_demo_3", accountName: "Northern Telecom", planId: null, campaignId: null, territoryId: "terr_north", ownerSub: OWNER, stage: "qualify", forecastCategory: "pipeline", amount: money(480_000, CNY), probability: 10, expectedCloseAt: daysAhead(108), closedAt: null, status: "open", currency: CNY },
    { id: "opp_demo_4", workspaceId, opportunityNo: "OPP-2026-0004", name: "Store POS replacement", accountId: "acc_demo_1", accountName: "East China Retail Group", planId: "plan_demo_1", campaignId: "camp_demo_1", territoryId: "terr_east", ownerSub: OWNER, stage: "won", forecastCategory: "closed", amount: money(760_000, CNY), probability: 100, expectedCloseAt: daysAgo(15), closedAt: daysAgo(15), status: "won", currency: CNY },
  ]);

  // --- D7 delivery ---------------------------------------------------------
  stores.delivery.seed({
    projects: [
      // Reported green, but carries an overdue instalment - the delivery page
      // downgrades it, which is the rule being demonstrated rather than claimed.
      { id: "prj_demo_1", workspaceId, projectNo: "PRJ-0001", name: "POS rollout - phase 1", opportunityId: "opp_demo_4", accountId: "acc_demo_1", managerSub: MANAGER, contractAmount: money(760_000, CNY), health: "green", status: "active", currency: CNY },
    ],
    milestones: [
      { id: "ms_1", projectId: "prj_demo_1", name: "Kickoff and survey", sequence: 1, status: "done", dueAt: daysAgo(30), completedAt: daysAgo(31), workspaceId },
      { id: "ms_2", projectId: "prj_demo_1", name: "Pilot stores live", sequence: 2, status: "in_progress", dueAt: daysAhead(10), completedAt: null, workspaceId },
      { id: "ms_3", projectId: "prj_demo_1", name: "Full rollout", sequence: 3, status: "pending", dueAt: daysAhead(60), completedAt: null, workspaceId },
    ],
    instalments: [
      { id: "inst_1", projectId: "prj_demo_1", milestoneId: "ms_1", sequence: 1, status: "settled", plannedAmount: money(380_000, CNY), actualAmount: money(380_000, CNY), dueAt: daysAgo(25), settledAt: daysAgo(24), workspaceId },
      { id: "inst_2", projectId: "prj_demo_1", milestoneId: "ms_2", sequence: 2, status: "overdue", plannedAmount: money(380_000, CNY), actualAmount: null, dueAt: daysAgo(8), settledAt: null, workspaceId },
    ],
  });

  // --- D8 copilot ----------------------------------------------------------
  stores.copilot.seedProposals(workspaceId, [
    { id: "act_demo_1", status: "proposed", actionType: "advance_stage", subjectType: "opportunity", subjectId: "opp_demo_2", payload: { to: "propose" }, rationale: "POC sign-off is recorded and procurement has asked for a formal quote.", confidence: 86, decidedBySub: null, decidedAt: null, executedAt: null, createdAt: daysAgo(1) },
    { id: "act_demo_2", status: "proposed", actionType: "draft_outreach", subjectType: "account", subjectId: "acc_demo_1", payload: { channel: "email" }, rationale: "No contact for 48 days and one instalment is overdue; health has fallen to 34.", confidence: 52, decidedBySub: null, decidedAt: null, executedAt: null, createdAt: daysAgo(1) },
    { id: "act_demo_3", status: "proposed", actionType: "promote_signal", subjectType: "lead", subjectId: "lead_demo_2", payload: { score: 71 }, rationale: "Series C funding usually precedes a platform decision by one to two quarters.", confidence: 64, decidedBySub: null, decidedAt: null, executedAt: null, createdAt: daysAgo(2) },
    { id: "act_demo_4", status: "rejected", actionType: "advance_stage", subjectType: "opportunity", subjectId: "opp_demo_3", payload: { to: "discover" }, rationale: "Two inbound enquiries from the same account this week.", confidence: 41, decidedBySub: "usr_demo_leader", decidedAt: daysAgo(3), executedAt: null, createdAt: daysAgo(4) },
  ]);
}
