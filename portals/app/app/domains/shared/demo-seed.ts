// Demo dataset for the offline path.
//
// Without this, every page renders an empty state and the product cannot be
// seen. More importantly the CHAIN cannot be seen: the whole thesis is that
// strategy -> campaign -> signal -> lead -> opportunity -> project -> revenue
// are linked by data rather than by a spreadsheet, and a screenshot of eight
// empty tables does not show that.
//
// SAFETY: this can never touch a real database. The function accepts the
// IN-MEMORY store classes by type, not the ports they implement, so passing a
// Prisma store is a compile error. The registry additionally refuses to seed
// when DATABASE_URL is set, and refuses to seed partially if any store is not
// in-memory. Three mechanisms, because "demo data appeared in production" is
// the kind of mistake a customer discovers.
//
// The ids are literal and cross-referenced on purpose: opportunity opp_demo_1
// really does carry campaign camp_demo_1, so campaignReturn() computes a real
// number from a real join rather than from fixtures that agree with themselves
// by coincidence. demo-seed.test.ts asserts those crossings hold.
//
// All display copy lives in demo-fixtures.ts so this file stays ASCII.

import { money } from "./money";
import { periodRange } from "./period";
import {
  DEMO_ACCOUNTS,
  DEMO_CAMPAIGNS,
  DEMO_COMMITMENT_TEXT,
  DEMO_CONTACTS,
  DEMO_DEAL_NOTES,
  DEMO_DEV_PRODUCTS,
  DEMO_PRODUCT_TYPES,
  DEMO_RETIRED_PRODUCTS,
  DEMO_EXECUTIONS,
  DEMO_LESSONS,
  DEMO_MILESTONES,
  DEMO_LONG_HISTORY,
  DEMO_NOTES,
  DEMO_PRODUCTS,
  DEMO_QUIET_NOTES,
  DEMO_SOLUTIONS,
  DEMO_TENDER_SIGNALS,
  DEMO_OPPORTUNITIES,
  DEMO_PLANS,
  DEMO_PLAYBOOKS,
  DEMO_PROJECTS,
  DEMO_RATIONALES,
  DEMO_SIGNALS,
  DEMO_UNMATCHED_COMPANY,
  DEMO_WAIVE_REASON,
  DEMO_SEGMENTS,
  DEMO_TERRITORY_REGIONS,
} from "./demo-fixtures";
import type { InMemoryAccountStore } from "../account/store";
import type {
  CommitmentRecord,
  InMemoryFieldStore,
  InteractionRecord,
  ParticipantRecord,
} from "../account/field-store";
import type { CommitmentDirection, CommitmentStatus, InteractionChannel } from "../account/lib/commitment";
import type { InMemoryCatalogStore } from "../catalog/store";
import type { InMemoryCopilotStore, PlaybookScope } from "../copilot/store";
import type { InMemoryDeliveryStore } from "../delivery/store";
import type { InMemoryPipelineStore, StageEventRecord } from "../pipeline/store";
import type { InMemoryPlanningStore } from "../planning/store";
import type { InMemorySignalStore } from "../signal/store";
import type { InMemoryStrategyStore } from "../strategy/store";

/**
 * The demo's own "now", and it TRACKS THE REAL CLOCK on purpose.
 *
 * It was pinned to 2026-08-15 for sixteen days, for a reason that sounded
 * right - "a fixture whose dates move on every seed is not a fixture". That
 * reason confuses two things. What a fixture owes is stable RELATIVE structure:
 * this note eighteen days before that milestone, this term ending a month after
 * that one. Pinning the absolute instant does not preserve that structure
 * against a product that reads the real clock - it destroys it, a day at a
 * time, and every relative date the product computes drifts by exactly how
 * stale the anchor has become.
 *
 * It misled twice before it was fixed:
 *
 *   1. /renewal read "lapsed 29 days" for a term seeded at 12.
 *   2. Expiry shipped and the first sweep emptied the demo's whole pending
 *      queue - four proposals seeded 1-2 days old were 17 days old by the
 *      clock the rule reads. Patched then with a second anchor for proposals
 *      alone; this removes the cause, so that special case is gone.
 *
 * EXPORTED, because a test that needs the demo's now must ask for it rather
 * than restate it. Six places in demo-seed.test.ts wrote the same literal, and
 * that coupling is what made this change look expensive: move the seed and the
 * tests keep comparing against an instant the fixtures no longer sit around,
 * so they fail for a reason that has nothing to do with what they assert.
 *
 * To be precise about what those tests were and were not: they were CONSISTENT
 * before this, because the seed and the literal named the same instant. They
 * were brittle, not wrong. The drift was doing its damage on the screen, where
 * the product reads the real clock - the seed and the test agreed with each
 * other while both disagreed with what a reader saw.
 */
export const DEMO_NOW = new Date();
const NOW = DEMO_NOW;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const CNY = "CNY";
const REP1 = "usr_demo_rep";
const REP2 = "usr_demo_rep2";
const PM = "usr_demo_pm";
export const DEMO_PERIOD = "2026Q3";
const PERIOD = DEMO_PERIOD;

/**
 * The quarter before, and the reason it exists: SOMETHING HAS TO BE OVER.
 *
 * Forecast accuracy is period-end actual against the opening snapshot, so it
 * can only be stated once the period has ENDED - and every closed deal in this
 * fixture landed in the current quarter, which meant the product's flagship
 * number had no surface it could ever appear on. The demo could show the
 * append-only trajectory and never the thing the trajectory is kept for.
 *
 * DERIVED FROM `PERIOD`, not written down and not taken from the clock. Three
 * ways to get this wrong, and only one way that is right:
 *
 *   * a literal "2026Q2" with literal dates inside it - the demo's anchor guard
 *     refuses date literals for a good reason, and a pinned quarter beside a
 *     live clock shows relative dates that are wrong by however stale it is;
 *   * derived from DEMO_NOW instead - then in October the "prior" quarter
 *     becomes 2026Q3, which is what PERIOD still says, and the same quarter
 *     carries two sets of snapshots under one label;
 *   * derived from PERIOD, which is what this does. Whatever the current period
 *     claims to be, the settled one is the quarter before it, and the deals
 *     that fill it are placed inside that range at runtime. No literal, and the
 *     two labels cannot disagree.
 */
export const DEMO_PRIOR_PERIOD = quarterBefore(PERIOD);
const PRIOR_PERIOD = DEMO_PRIOR_PERIOD;
const PRIOR_RANGE = periodRange(PRIOR_PERIOD)!;
const DAY_MS = 86_400_000;
/** Two wins inside the settled quarter, placed by offset from its own start. */
const PRIOR_MID = new Date(PRIOR_RANGE.start.getTime() + 49 * DAY_MS);
const PRIOR_LATE = new Date(PRIOR_RANGE.start.getTime() + 71 * DAY_MS);

/** `2026Q3` -> `2026Q2`, wrapping the year. */
function quarterBefore(period: string): string {
  const m = /^(\d{4})Q([1-4])$/.exec(period.trim());
  if (!m) throw new Error(`demo period ${period} is not a quarter`);
  const year = Number(m[1]);
  const q = Number(m[2]);
  return q === 1 ? `${year - 1}Q4` : `${year}Q${q - 1}`;
}

export interface DemoStores {
  strategy: InMemoryStrategyStore;
  planning: InMemoryPlanningStore;
  account: InMemoryAccountStore;
  field: InMemoryFieldStore;
  signal: InMemorySignalStore;
  pipeline: InMemoryPipelineStore;
  delivery: InMemoryDeliveryStore;
  copilot: InMemoryCopilotStore;
  catalog: InMemoryCatalogStore;
}

/**
 * Five customer organisations, ten opportunities across every stage, four
 * delivery projects, and the lineage that connects them.
 *
 * One chain runs the full length of the product, and it is the thing to look at
 * first:
 *
 *   plan_demo_1 -> camp_demo_3 -> sig_demo_5 -> lead_demo_3 -> opp_demo_10
 *               -> prj_demo_3 -> inst_5 / inst_6
 *
 * A second reaches delivery from the campaign side without a signal
 * (camp_demo_1 -> opp_demo_4 -> prj_demo_1), because in practice not every deal
 * starts as a detected signal and a demo that implied otherwise would be
 * selling a shape the data does not have.
 *
 * Several fixtures exist to make a RULE visible rather than to fill a table:
 *   - prj_demo_1 reports green while carrying an overdue instalment, so the
 *     delivery page shows the overdue-forbids-green rule firing;
 *   - opp_demo_2's win rate differs from its stage default, so an override is
 *     visibly surviving the machine;
 *   - sig_demo_2 scores high with no matched account - the new-logo case;
 *   - lead_demo_2 has no account, so convert is unavailable WITH A REASON;
 *   - acc_demo_4 has a buyer and a coach and no edge between them, which is
 *     "on file but unreachable" rather than covered;
 *   - terr_north has a target and no snapshot, so "not forecast" and "0%
 *     attained" are visibly different;
 *   - two of the four closed deals have no win/loss review, so the pending
 *     review debt is non-empty and the reviewed ones have visibly left it.
 */
export function seedDemoWorkspace(workspaceId: string, stores: DemoStores): void {
  seedStrategy(workspaceId, stores);
  seedPlanning(workspaceId, stores);
  seedAccounts(workspaceId, stores);
  seedField(workspaceId, stores);
  seedSignals(workspaceId, stores);
  seedPipeline(workspaceId, stores);
  seedDelivery(workspaceId, stores);
  seedCopilot(workspaceId, stores);
  seedCatalog(workspaceId, stores);
}

function seedStrategy(workspaceId: string, stores: DemoStores): void {
  stores.strategy.seed({
    // The two codes the demo accounts have always carried. Until segments could
    // be created they pointed at nothing; these are the definitions they were
    // missing, not new data. ENTERPRISE first because it is the priority.
    segments: [
      {
        id: "seg_demo_1",
        workspaceId,
        segmentCode: DEMO_SEGMENTS[0].code,
        name: DEMO_SEGMENTS[0].name,
        criteria: { industries: [...DEMO_SEGMENTS[0].criteria.industries], regions: [] },
        planId: "plan_demo_1",
        priority: 1,
        status: "active" as const,
      },
      {
        id: "seg_demo_2",
        workspaceId,
        segmentCode: DEMO_SEGMENTS[1].code,
        name: DEMO_SEGMENTS[1].name,
        criteria: { industries: [...DEMO_SEGMENTS[1].criteria.industries], regions: [] },
        planId: "plan_demo_1",
        priority: 2,
        status: "active" as const,
      },
    ],
    plans: [
      {
        id: "plan_demo_1",
        workspaceId,
        planNo: "PLAN-2026H2",
        name: DEMO_PLANS[0].name,
        period: "2026H2",
        objective: DEMO_PLANS[0].objective,
        ownerSub: "usr_demo_cro",
        status: "active",
        approvedAt: daysAgo(60),
      },
      {
        id: "plan_demo_2",
        workspaceId,
        planNo: "PLAN-2026H1",
        name: DEMO_PLANS[1].name,
        period: "2026H1",
        objective: DEMO_PLANS[1].objective,
        ownerSub: "usr_demo_cro",
        status: "closed",
        approvedAt: daysAgo(240),
      },
    ],
    campaigns: [
      campaign("camp_demo_1", workspaceId, DEMO_CAMPAIGNS[0], "plan_demo_1", "outbound", 200_000, "running", daysAgo(45), daysAhead(45)),
      campaign("camp_demo_2", workspaceId, DEMO_CAMPAIGNS[1], "plan_demo_2", "event", 80_000, "completed", daysAgo(200), daysAgo(120)),
      campaign("camp_demo_3", workspaceId, DEMO_CAMPAIGNS[2], "plan_demo_1", "event", 150_000, "running", daysAgo(30), daysAhead(30)),
    ],
    executions: [
      execution("exec_1", workspaceId, "camp_demo_1", DEMO_EXECUTIONS[0], "outreach", "done", daysAgo(20)),
      execution("exec_2", workspaceId, "camp_demo_1", DEMO_EXECUTIONS[1], "content", "done", daysAgo(5)),
      execution("exec_3", workspaceId, "camp_demo_1", DEMO_EXECUTIONS[2], "event", "pending", daysAhead(15)),
      execution("exec_4", workspaceId, "camp_demo_2", DEMO_EXECUTIONS[3], "event", "done", daysAgo(180)),
      execution("exec_5", workspaceId, "camp_demo_2", DEMO_EXECUTIONS[4], "nurture", "skipped", daysAgo(150)),
      execution("exec_6", workspaceId, "camp_demo_3", DEMO_EXECUTIONS[5], "outreach", "done", daysAgo(10)),
    ],
    // The join campaignReturn() reads. Every id here exists in seedPipeline.
    attributed: {
      [`${workspaceId}|camp_demo_1`]: [
        { id: "opp_demo_1", amount: money(2_400_000, CNY), status: "open" },
        { id: "opp_demo_4", amount: money(760_000, CNY), status: "won" },
        { id: "opp_demo_7", amount: money(620_000, CNY), status: "open" },
      ],
      [`${workspaceId}|camp_demo_2`]: [{ id: "opp_demo_5", amount: money(320_000, CNY), status: "lost" }],
      [`${workspaceId}|camp_demo_3`]: [
        { id: "opp_demo_6", amount: money(1_800_000, CNY), status: "open" },
        { id: "opp_demo_10", amount: money(540_000, CNY), status: "won" },
      ],
    },
  });
}

function seedPlanning(workspaceId: string, stores: DemoStores): void {
  stores.planning.seed({
    territories: [
      territory("terr_east", workspaceId, "EAST", "East China", REP1, DEMO_TERRITORY_REGIONS.EAST),
      territory("terr_north", workspaceId, "NORTH", "North China", REP2, DEMO_TERRITORY_REGIONS.NORTH),
      territory("terr_south", workspaceId, "SOUTH", "South China", REP2, DEMO_TERRITORY_REGIONS.SOUTH),
      // Single-region, deliberately - see 港澳零售集团. The other three each
      // cover two regions, so region derivation there always finds more than
      // one candidate and always declines to guess; this is the only ground in
      // the demo where a deal's territory names exactly one region.
      territory("terr_hk", workspaceId, "HK", "Hong Kong & Macau", REP1, DEMO_TERRITORY_REGIONS.HK),
    ],
    targets: [
      target("tgt_ws", workspaceId, "workspace", null, null, 12_000_000, "committed"),
      target("tgt_east", workspaceId, "territory", "terr_east", null, 6_000_000, "committed"),
      target("tgt_south", workspaceId, "territory", "terr_south", null, 3_500_000, "committed"),
      // No snapshot below, on purpose: "not forecast yet" must be visibly
      // different from "0% attained".
      target("tgt_north", workspaceId, "territory", "terr_north", null, 2_500_000, "draft"),
    ],
    // The numbers D6 has PUBLISHED for each scope, which is what attainment
    // reads. Pipeline amounts match the live board's own split so a pipeline
    // target measures against the same figure the pipeline page shows; new-logo
    // counts are the three accounts whose first win landed in this period.
    published: {
      [`${workspaceId}|${PERIOD}|workspace||`]: {
        closedAmount: money(2_700_000, CNY),
        // The QUARTER's pipeline, matching the last snapshot point and the
        // live tiles. Was 1,580,000 - every open pipeline deal in the book,
        // most of them dated into Q4 (TD-014).
        pipelineAmount: money(480_000, CNY),
        newLogoCount: 3,
      },
      [`${workspaceId}|${PERIOD}|territory|terr_east|`]: {
        closedAmount: money(760_000, CNY),
        pipelineAmount: money(0, CNY),
        newLogoCount: 1,
      },
      [`${workspaceId}|${PERIOD}|territory|terr_south|`]: {
        closedAmount: money(540_000, CNY),
        pipelineAmount: money(480_000, CNY),
        newLogoCount: 1,
      },
    },
  });
}

function seedAccounts(workspaceId: string, stores: DemoStores): void {
  stores.account.seed({
    // One plan, on the strategic account. Its executive cadence is 60 days and
    // nobody has ever met the decision maker, so the cadence rule fires at the
    // most serious tier - which is the demo's whole job here: to show that an
    // account with no deal and no event can still be the most important row.
    plans: [
      {
        id: "plan_demo_3",
        workspaceId,
        accountId: "acc_demo_3",
        period: PERIOD,
        targetAmount: 3_000_000,
        contactCadenceDays: 30,
        execCadenceDays: 60,
        ownerSub: REP1,
        presalesSub: PM,
        deliverySub: null,
        status: "active",
      },
    ],
    accounts: [
      // The group parent, and the one account whose identity IS fully on file -
      // credit code, site, headcount. Everything downstream that asks "do we
      // know who this company actually is" needs one row that answers yes.
      account("acc_demo_1", workspaceId, 1, DEMO_ACCOUNTS[0], "MIDMARKET", REP1, 34, "active", "standard", {
        creditCode: "91310000MA1FL2XY3T",
        website: "https://hdretail.example.cn",
        employeeCount: 4200,
      }),
      account("acc_demo_2", workspaceId, 2, DEMO_ACCOUNTS[1], "ENTERPRISE", REP2, 78, "active"),
      // Strategic, and deliberately a PROSPECT with no open opportunity: this is
      // the case every other rule is structurally blind to. Nothing has
      // happened here, and that is precisely what has to be reported.
      account("acc_demo_3", workspaceId, 3, DEMO_ACCOUNTS[2], "ENTERPRISE", REP1, null, "prospect", "strategic"),
      account("acc_demo_4", workspaceId, 4, DEMO_ACCOUNTS[3], "MIDMARKET", REP2, 61, "active"),
      // A SUBSIDIARY of acc_demo_1 - incr/0025. Both are 零售, both are worked
      // by the same rep, and they are deliberately NOT merged: a subsidiary is
      // a customer in its own right with its own deals. Its own buying centre
      // is also its own, which is why a parent link does not join the two
      // decision chains (ADR-024, batch B).
      account("acc_demo_5", workspaceId, 5, DEMO_ACCOUNTS[4], "MIDMARKET", REP1, 45, "active", "standard", {
        creditCode: "91440300MA5DR7QK8P",
        employeeCount: 380,
        parentId: "acc_demo_1",
      }),
      // Two accounts that exist to exercise rules the first five never reach:
      // 6 goes quiet with nobody having broken a promise, 7 is one WE owe.
      account("acc_demo_6", workspaceId, 6, DEMO_ACCOUNTS[5], "MIDMARKET", REP1, 52, "active"),
      account("acc_demo_7", workspaceId, 7, DEMO_ACCOUNTS[6], "ENTERPRISE", REP1, 66, "active"),
      // 未分区 - on ground NO territory covers (东北). Owned, active, ordinary
      // in every other way: the point is that a filing gap, not an absent
      // owner, is what makes it unplaced. Under a territory scope every
      // territory member sees it, which is the ruling of 2026-09-01 and the
      // case that was invisible in the demo until now.
      account("acc_demo_8", workspaceId, 8, DEMO_ACCOUNTS[7], "ENTERPRISE", REP2, 58, "active"),
      // Region-derivable, not 未分区 (see the DEMO_ACCOUNTS comment). Industry
      // and segment are both already filled in, deliberately - the ONLY gap
      // this account has is region, so the completeness screen's derivable
      // half has a clean case to show rather than one tangled up with the
      // industry gap acc_demo_8 also carries.
      account("acc_demo_9", workspaceId, 9, DEMO_ACCOUNTS[8], "MIDMARKET", REP1, 70, "active"),
    ],
    contacts: [
      contact("ct_1", workspaceId, "acc_demo_1", DEMO_CONTACTS[0], {
        email: "wanglei@hdretail.example.cn",
        mobile: "+86 138 0000 1001",
        wechat: "wl_cfo",
      }),
      contact("ct_2", workspaceId, "acc_demo_1", DEMO_CONTACTS[1], {
        email: "chenhao@hdretail.example.cn",
        mobile: "+86 138 0000 1002",
      }),
      contact("ct_3", workspaceId, "acc_demo_1", DEMO_CONTACTS[2]),
      contact("ct_4", workspaceId, "acc_demo_1", DEMO_CONTACTS[3]),
      contact("ct_5", workspaceId, "acc_demo_2", DEMO_CONTACTS[4]),
      contact("ct_6", workspaceId, "acc_demo_2", DEMO_CONTACTS[1]),
      // acc_demo_4 has a buyer and a coach with NO edge between them, so the
      // chain reports "on file but unreachable" - the distinction the view leads
      // with.
      // Left with NO contact details on purpose. acc_demo_4's chain already
      // reports "on file but unreachable" for want of an edge; this makes the
      // same account unreachable in the plainer sense too - nobody recorded a
      // phone number for the person who signs.
      contact("ct_7", workspaceId, "acc_demo_4", DEMO_CONTACTS[5]),
      contact("ct_8", workspaceId, "acc_demo_4", DEMO_CONTACTS[2]),
      contact("ct_9", workspaceId, "acc_demo_5", DEMO_CONTACTS[0]),
    ],
    // incr/0027, ADR-024 batch D. THE POINT OF THE WHOLE BATCH, in five rows.
    //
    // ct_5 (王磊, CFO) and ct_6 (陈昊, IT director) are both on acc_demo_2's two
    // open deals, and they are NOT the same thing on each:
    //
    //   opp_demo_2  供应链协同平台   ct_5 signs        ct_6 evaluates
    //   opp_demo_21 生产排程系统     ct_5 merely uses  ct_6 signs
    //
    // Before this table there was one answer for the customer, so whichever it
    // was, it was wrong about one of the two deals - and "决策人未触达" was lit
    // on both or neither. Now the supply-chain deal can be missing its buyer
    // while the scheduling deal is not.
    //
    // Deliberately NOT stated for every person on every deal: absence is the
    // ordinary case and falls back to the customer-level default, which is what
    // the other seven contacts exercise.
    opportunityContacts: [
      // acc_demo_2's two open deals, and the pair that makes the point: the
      // same two people, different roles on each.
      oc("oc_1", workspaceId, "opp_demo_2", "ct_5", "economic", 85),
      oc("oc_2", workspaceId, "opp_demo_2", "ct_6", "technical", 65),
      oc("oc_3", workspaceId, "opp_demo_21", "ct_5", "user", 40),
      oc("oc_4", workspaceId, "opp_demo_21", "ct_6", "economic", 80),
      // The other accounts' open deals. These carry what used to sit on the
      // person, moved to the only place it can be true - and the demo needs
      // them, because with person.decision_role gone a deal with no rows here
      // has no chain at all.
      oc("oc_5", workspaceId, "opp_demo_1", "ct_1", "economic", 90),
      oc("oc_6", workspaceId, "opp_demo_1", "ct_2", "technical", 70),
      oc("oc_7", workspaceId, "opp_demo_1", "ct_3", "coach", 55),
      oc("oc_8", workspaceId, "opp_demo_1", "ct_4", "blocker", 60),
      // acc_demo_4: a buyer and a coach with NO edge between them, so the chain
      // reports "on file but unreachable" - the distinction the view leads with.
      oc("oc_9", workspaceId, "opp_demo_6", "ct_7", "economic", 80),
      oc("oc_10", workspaceId, "opp_demo_6", "ct_8", "coach", 50),
      oc("oc_11", workspaceId, "opp_demo_7", "ct_9", "economic", 75),
    ],
    relations: [
      { workspaceId, accountId: "acc_demo_1", fromContactId: "ct_3", toContactId: "ct_1", relationType: "reports_to" },
      { workspaceId, accountId: "acc_demo_1", fromContactId: "ct_2", toContactId: "ct_1", relationType: "reports_to" },
      { workspaceId, accountId: "acc_demo_1", fromContactId: "ct_4", toContactId: "ct_1", relationType: "opposed_to" },
      { workspaceId, accountId: "acc_demo_2", fromContactId: "ct_6", toContactId: "ct_5", relationType: "reports_to" },
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
        lastInteractionAt: daysAgo(3),
        projectHealth: ["green"],
        overdueRevenueCount: 0,
      },
      [`${workspaceId}|acc_demo_4`]: {
        openOpportunities: [{ stage: "propose" }, { stage: "negotiate" }],
        lastInteractionAt: daysAgo(10),
        projectHealth: ["green"],
        overdueRevenueCount: 0,
      },
      [`${workspaceId}|acc_demo_5`]: {
        openOpportunities: [{ stage: "discover" }],
        lastInteractionAt: daysAgo(2),
        projectHealth: ["amber"],
        overdueRevenueCount: 0,
      },
    },
  });
}

/**
 * The evidence plane: what was actually said, and what was actually promised.
 *
 * These fixtures exist to make the ONE rule visible - a commitment is closed by
 * evidence, not by assertion - so every state appears at least once and each is
 * consistent with the account it hangs off:
 *
 *   - acc_demo_1 (health 34, last contact 48 days ago) has one promise THEY
 *     missed and one THEY are 41 days late on. Its kept-rate is 0 of 1. That is
 *     what a 34 looks like from underneath, and it is arithmetic rather than a
 *     mood: the note on 2026-06 says the CFO would answer by the Wednesday, and
 *     no interaction since cites an answer.
 *   - acc_demo_2 (health 78) has the only met commitment, closed by
 *     int_demo_a2b - the interaction that proves it, not a tick.
 *   - acc_demo_4 is 9 days late on something WE owe. Our own failures sit in
 *     the same list as theirs, which is the only way the list stays honest.
 *   - acc_demo_3 has nothing at all: a prospect nobody has met is not the same
 *     as a customer with a clean record, and its kept-rate is null, not 1.
 *
 * The occurredAt dates agree with the lastInteractionAt values seeded into the
 * account health inputs. They have to: with a database the account page reads
 * last contact FROM this table, so fixtures that disagreed would make the
 * offline demo and the real product tell different stories about the same row.
 */
function seedField(workspaceId: string, stores: DemoStores): void {
  const note = (
    id: string,
    accountId: string,
    channel: InteractionChannel,
    days: number,
    actorSub: string,
    rawNote: string,
    opportunityId: string | null = null,
  ): InteractionRecord => ({
    id,
    workspaceId,
    accountId,
    opportunityId,
    projectId: null,
    channel,
    direction: "outbound",
    occurredAt: daysAgo(days),
    actorSub,
    subject: null,
    rawNote,
    summary: null,
    captureMode: "manual",
    correctsInteractionId: null,
  });

  const promise = (
    id: string,
    accountId: string,
    direction: CommitmentDirection,
    statement: string,
    dueDays: number,
    status: CommitmentStatus,
    extra: Partial<CommitmentRecord> = {},
  ): CommitmentRecord => ({
    id,
    workspaceId,
    accountId,
    opportunityId: null,
    originInteractionId: null,
    direction,
    statement,
    // Negative means still ahead of us.
    dueAt: dueDays >= 0 ? daysAgo(dueDays) : daysAhead(-dueDays),
    // Ours has an owner; theirs deliberately does not - nobody here can be
    // held to a promise the customer made.
    ownerSub: direction === "we_owe" ? REP1 : null,
    counterpartContactId: null,
    status,
    closureEvidenceKind: null,
    closureEvidenceId: null,
    metAt: null,
    waivedBySub: null,
    waiveReason: null,
    ...extra,
  });

  // Who was actually in the room.
  //
  // interaction_participant is what turns "we contacted this company" into "we
  // contacted this person", and it is the only thing the chain-recency panel
  // reads. A fixture set that omitted it would render every contact as never
  // having been met, which is technically true of the data and useless as a
  // demonstration.
  //
  // acc_demo_4 is the case worth looking at: SEVEN recorded contacts, every
  // single one with the coach (ct_8), and NOT ONE with the economic buyer
  // (ct_7). That is what a weekly-catch-up-with-my-friend deal looks like from
  // the outside, and the two panels reach it from different directions - the
  // structural one because ct_7 and ct_8 have no edge between them (a fixture
  // batch 3 set up deliberately), the recency one because nobody has ever been
  // in a room with ct_7. Same verdict, two independent reasons, which is worth
  // more than either alone.
  //
  // acc_demo_1 is the mirror: structurally reachable AND everyone warm. Both
  // panels say the access is fine - and it is, its problem is that the promises
  // are not being kept.
  const person = (id: string, interactionId: string, contactId: string): ParticipantRecord => ({
    id,
    workspaceId,
    interactionId,
    contactId,
    memberSub: null,
    externalName: null,
    roleAtTime: null,
  });

  stores.field.seed({
    participants: [
      // acc_demo_1: the buyer and the technical lead at kickoff, the buyer again
      // on the chase, the coach on the private call. All still inside the
      // window - this account's problem is broken promises, not access.
      person("pt_1", "int_demo_a1a", "ct_1"),
      person("pt_2", "int_demo_a1a", "ct_2"),
      person("pt_3", "int_demo_a1b", "ct_1"),
      person("pt_4", "int_demo_a1c", "ct_3"),

      // acc_demo_2: healthy. The buyer is in the room and in the follow-up.
      person("pt_5", "int_demo_a2a", "ct_5"),
      person("pt_6", "int_demo_a2a", "ct_6"),
      person("pt_7", "int_demo_a2b", "ct_5"),
      person("pt_8", "int_demo_d2a", "ct_6"),
      person("pt_9", "int_demo_d2b", "ct_6"),
      person("pt_10", "int_demo_d2c", "ct_6"),

      // acc_demo_4: SEVEN recorded contacts, every one with the coach.
      person("pt_11", "int_demo_a4a", "ct_8"),
      person("pt_12", "int_demo_d6a", "ct_8"),
      person("pt_13", "int_demo_d6b", "ct_8"),
      person("pt_14", "int_demo_d6c", "ct_8"),
      person("pt_15", "int_demo_d9a", "ct_8"),
      person("pt_16", "int_demo_d9b", "ct_8"),
      person("pt_17", "int_demo_d9c", "ct_8"),

      // acc_demo_5: early, but with the right person.
      person("pt_18", "int_demo_a5a", "ct_9"),
      person("pt_19", "int_demo_d7a", "ct_9"),
      person("pt_20", "int_demo_d7b", "ct_9"),
    ],
    interactions: [
      // Five months on the flagship account, so the timeline shows a pursuit
      // rather than three samples: the technical objection that turns out to be
      // personal, the budget that arrives, the price pressure, and then the
      // silence. The gaps between them are as much of the story as the entries.
      note("int_demo_a1z1", "acc_demo_1", "meeting", 152, REP1, DEMO_LONG_HISTORY.d1, "opp_demo_1"),
      note("int_demo_a1z2", "acc_demo_1", "email", 138, REP1, DEMO_LONG_HISTORY.d2, "opp_demo_1"),
      note("int_demo_a1z3", "acc_demo_1", "meeting", 121, REP1, DEMO_LONG_HISTORY.d3, "opp_demo_1"),
      note("int_demo_a1z4", "acc_demo_1", "call", 116, REP1, DEMO_LONG_HISTORY.d4, "opp_demo_1"),
      note("int_demo_a1z5", "acc_demo_1", "email", 104, REP1, DEMO_LONG_HISTORY.d5, "opp_demo_1"),
      note("int_demo_a1z6", "acc_demo_1", "call", 92, REP1, DEMO_LONG_HISTORY.d6, "opp_demo_1"),
      note("int_demo_a1z7", "acc_demo_1", "email", 84, REP1, DEMO_LONG_HISTORY.d7, "opp_demo_1"),
      note("int_demo_a1z8", "acc_demo_1", "call", 58, REP1, DEMO_LONG_HISTORY.d8, "opp_demo_1"),
      note("int_demo_a1z9", "acc_demo_1", "im", 55, REP1, DEMO_LONG_HISTORY.d9, "opp_demo_1"),
      // acc_demo_3 deliberately gets NO interactions. A strategic account nobody
      // has ever contacted is the strongest case ADR-013 exists for, and a
      // seed test pins it: "no contact date at all" and "a very old contact
      // date" are different findings, and the first is the one this demo needs.
      note("int_demo_a1a", "acc_demo_1", "meeting", 75, REP1, DEMO_NOTES.a1_kickoff, "opp_demo_1"),
      note("int_demo_a1b", "acc_demo_1", "im", 62, REP1, DEMO_NOTES.a1_followup, "opp_demo_1"),
      note("int_demo_a1c", "acc_demo_1", "call", 48, REP1, DEMO_NOTES.a1_blocked, "opp_demo_1"),
      note("int_demo_a2a", "acc_demo_2", "meeting", 18, REP2, DEMO_NOTES.a2_renewal),
      note("int_demo_a2b", "acc_demo_2", "email", 4, REP2, DEMO_NOTES.a2_evidence),
      note("int_demo_a4a", "acc_demo_4", "call", 12, REP2, DEMO_NOTES.a4_slip),
      note("int_demo_a5a", "acc_demo_5", "event", 35, REP1, DEMO_NOTES.a5_intro),
      note("int_demo_a6a", "acc_demo_6", "meeting", 35, REP1, DEMO_QUIET_NOTES.a6_demo, "opp_demo_11"),
      note("int_demo_a6b", "acc_demo_6", "event", 58, REP1, DEMO_QUIET_NOTES.a6_intro),
      note("int_demo_a7a", "acc_demo_7", "meeting", 20, REP1, DEMO_QUIET_NOTES.a7_kickoff, "opp_demo_12"),
      note("int_demo_a7b", "acc_demo_7", "call", 9, REP1, DEMO_QUIET_NOTES.a7_followup, "opp_demo_12"),

      // Deal-level follow-ups. Every one carries an opportunityId, which is what
      // the adoption metric counts - an account-level note does not move it,
      // because the criterion is per opportunity and a metric that accepted
      // either would rise while deals stayed dark.
      note("int_demo_d9a", "acc_demo_4", "call", 38, REP2, DEMO_DEAL_NOTES.d9_a, "opp_demo_9"),
      note("int_demo_d6a", "acc_demo_4", "visit", 31, REP2, DEMO_DEAL_NOTES.d6_a, "opp_demo_6"),
      note("int_demo_d6b", "acc_demo_4", "email", 24, REP2, DEMO_DEAL_NOTES.d6_b, "opp_demo_6"),
      note("int_demo_d9b", "acc_demo_4", "call", 23, REP2, DEMO_DEAL_NOTES.d9_b, "opp_demo_9"),
      note("int_demo_d2a", "acc_demo_2", "meeting", 17, REP2, DEMO_DEAL_NOTES.d2_a, "opp_demo_2"),
      note("int_demo_d9c", "acc_demo_4", "email", 16, REP2, DEMO_DEAL_NOTES.d9_c, "opp_demo_9"),
      note("int_demo_d2b", "acc_demo_2", "meeting", 11, REP2, DEMO_DEAL_NOTES.d2_b, "opp_demo_2"),
      note("int_demo_d6c", "acc_demo_4", "im", 10, REP2, DEMO_DEAL_NOTES.d6_c, "opp_demo_6"),
      note("int_demo_d7a", "acc_demo_5", "visit", 9, REP1, DEMO_DEAL_NOTES.d7_a, "opp_demo_7"),
      note("int_demo_d2c", "acc_demo_2", "call", 3, REP2, DEMO_DEAL_NOTES.d2_c, "opp_demo_2"),
      note("int_demo_d7b", "acc_demo_5", "email", 2, REP1, DEMO_DEAL_NOTES.d7_b, "opp_demo_7"),
    ],
    commitments: [
      // Open and 41 days past its date. Nothing in the timeline since cites an
      // answer, which is precisely why it is still open.
      promise("cm_demo_1", "acc_demo_1", "they_owe", DEMO_COMMITMENT_TEXT.a1_cfo, 41, "open", {
        originInteractionId: "int_demo_a1a",
        counterpartContactId: "ct_1",
      }),
      // Already resolved as missed. A miss stays on the record even though the
      // meeting could still happen later - erasing it would erase the signal.
      promise("cm_demo_2", "acc_demo_1", "they_owe", DEMO_COMMITMENT_TEXT.a1_procurement, 30, "missed", {
        originInteractionId: "int_demo_a1c",
      }),
      // Ours, still ahead of its date.
      promise("cm_demo_3", "acc_demo_1", "we_owe", DEMO_COMMITMENT_TEXT.a1_interface, -5, "open", {
        originInteractionId: "int_demo_a1c",
      }),
      // The only met one, and it names the interaction that proves it.
      promise("cm_demo_4", "acc_demo_2", "we_owe", DEMO_COMMITMENT_TEXT.a2_report, 6, "met", {
        ownerSub: REP2,
        originInteractionId: "int_demo_a2a",
        closureEvidenceKind: "interaction",
        closureEvidenceId: "int_demo_a2b",
        metAt: daysAgo(4),
      }),
      // Ours, four days late. Under the 7-day cut, so the rule tiers it "week"
      // rather than "today" - the tier boundary itself now has a demo case.
      promise("cm_demo_7", "acc_demo_7", "we_owe", DEMO_COMMITMENT_TEXT.a7_lims, 4, "open"),
      // Ours, 9 days late. It sits in the same manager list as theirs.
      promise("cm_demo_5", "acc_demo_4", "we_owe", DEMO_COMMITMENT_TEXT.a4_pilot, 9, "open", {
        ownerSub: REP2,
        originInteractionId: "int_demo_a4a",
      }),
      // Waived, with the reason attached. A waive without one is
      // indistinguishable from the promise never having been made.
      promise("cm_demo_6", "acc_demo_5", "they_owe", DEMO_COMMITMENT_TEXT.a5_meeting, 20, "waived", {
        originInteractionId: "int_demo_a5a",
        waivedBySub: REP1,
        waiveReason: DEMO_WAIVE_REASON,
      }),
    ],
  });
}

function seedSignals(workspaceId: string, stores: DemoStores): void {
  stores.signal.seed({
    signals: [
      signal("sig_demo_1", workspaceId, "campaign", "camp_demo_1", "intent", DEMO_SIGNALS[0], "acc_demo_1", 47, "promoted", 40),
      // Unmatched and high-scoring: the new-logo case the rule exists for.
      signal("sig_demo_2", workspaceId, "news", "https://news.example/funding/992", "funding", DEMO_SIGNALS[1], null, 61, "scored", 6),
      // Scored 95 days ago when the posting was fresh, and never re-scored.
      // Today the rule gives 22 - the gap IS the point: it is the one row where
      // "score is stale" is true, so the marker means something everywhere else.
      signal("sig_demo_3", workspaceId, "web", "https://jobs.example/8821", "hiring", DEMO_SIGNALS[2], "acc_demo_3", 52, "scored", 95),
      // Tenders. The strongest public evidence there is: a procurement already
      // running, with a budget and a deadline attached (ADR-016).
      //
      // The first two came in along the NAMED ACCOUNT line, the third along the
      // product line from a buyer nobody has ever dealt with - which is the case
      // a named-account-only crawler would never see, and the reason targeting
      // orders the inbox instead of scoring it.
      signal("sig_demo_11", workspaceId, "web", "https://tender.example/2026/9912", "tender",
        DEMO_TENDER_SIGNALS.strategic, "acc_demo_3", 100, "scored", 3, "named_account"),
      signal("sig_demo_12", workspaceId, "web", "https://tender.example/2026/9931", "tender",
        DEMO_TENDER_SIGNALS.known, "acc_demo_1", 94, "scored", 8, "named_account"),
      signal("sig_demo_13", workspaceId, "web", "https://tender.example/2026/9948", "tender",
        DEMO_TENDER_SIGNALS.newLogo, null, 91, "new", 2, "product_domain"),
      signal("sig_demo_14", workspaceId, "news", "https://gov.example/notice/551", "compliance",
        DEMO_TENDER_SIGNALS.policy, "acc_demo_4", 61, "scored", 15, "product_domain"),
      signal("sig_demo_4", workspaceId, "partner", "ref-4471", "referral", DEMO_SIGNALS[3], null, null, "new", 2),
      signal("sig_demo_5", workspaceId, "campaign", "camp_demo_3", "intent", DEMO_SIGNALS[4], "acc_demo_5", 79, "promoted", 25),
      signal("sig_demo_6", workspaceId, "crm", "crm-3312", "tech_change", DEMO_SIGNALS[5], "acc_demo_2", 58, "scored", 18),
      signal("sig_demo_7", workspaceId, "web", "https://tender.example/7781", "intent", DEMO_SIGNALS[6], "acc_demo_4", 83, "promoted", 22),
      signal("sig_demo_8", workspaceId, "news", "https://news.example/conf/551", "engagement", DEMO_SIGNALS[7], null, 33, "duplicate", 60),
    ],
    leads: [
      lead("lead_demo_1", workspaceId, 1, DEMO_ACCOUNTS[0].name, "acc_demo_1", "sig_demo_1", "camp_demo_1", 88, REP1, "converted", "opp_demo_1"),
      // Unmatched account: convert is offered only once an account is set, and
      // the surface explains why rather than failing.
      lead("lead_demo_2", workspaceId, 2, DEMO_UNMATCHED_COMPANY, null, "sig_demo_2", null, 71, REP1, "qualified", null),
      lead("lead_demo_3", workspaceId, 3, DEMO_ACCOUNTS[4].name, "acc_demo_5", "sig_demo_5", "camp_demo_3", 79, REP1, "converted", "opp_demo_10"),
      lead("lead_demo_4", workspaceId, 4, DEMO_ACCOUNTS[3].name, "acc_demo_4", "sig_demo_7", null, 83, REP2, "qualified", null),
      lead("lead_demo_5", workspaceId, 5, DEMO_ACCOUNTS[2].name, "acc_demo_3", "sig_demo_3", null, 26, REP1, "working", null),
    ],
  });
}

function seedPipeline(workspaceId: string, stores: DemoStores): void {
  stores.pipeline.seed(
    [
      opp("opp_demo_1", workspaceId, 1, DEMO_OPPORTUNITIES[0], "acc_demo_1", "camp_demo_1", "terr_east", REP1, "negotiate", "commit", 2_400_000, 90, daysAhead(46), null, "open"),
      // Overridden win rate: the stage default at validate is 50, so the page
      // shows a human judgement surviving the machine's suggestion.
      opp("opp_demo_2", workspaceId, 2, DEMO_OPPORTUNITIES[1], "acc_demo_2", null, "terr_east", REP2, "validate", "best_case", 1_150_000, 35, daysAhead(61), null, "open"),
      // A SECOND OPEN DEAL AT acc_demo_2, added with incr/0027 - and it is the
      // whole point of batch D rather than filler. Until now no customer in
      // this seed had two deals open at once, so "the same person is the
      // economic buyer here and merely a user there" could not be shown at all,
      // and neither could the defect: one chain, one badge, both deals.
      //
      // Different department on purpose. 生产排程 is bought by operations and
      // 供应链协同 by supply chain, which is exactly why one buying committee
      // for the customer was always a fiction.
      opp("opp_demo_21", workspaceId, 21, DEMO_OPPORTUNITIES[4], "acc_demo_2", null, "terr_east", REP2, "discover", "pipeline", 880_000, 20, daysAhead(95), null, "open"),
      opp("opp_demo_3", workspaceId, 3, DEMO_OPPORTUNITIES[2], "acc_demo_3", null, "terr_north", REP1, "qualify", "pipeline", 480_000, 10, daysAhead(108), null, "open"),
      opp("opp_demo_4", workspaceId, 4, DEMO_OPPORTUNITIES[3], "acc_demo_1", "camp_demo_1", "terr_east", REP1, "won", "closed", 760_000, 100, daysAgo(15), daysAgo(15), "won"),
      // Terminal stages carry the `closed` category in both directions - a lost
      // deal forecast as pipeline is a state planCategoryChange rejects, and a
      // fixture that violates its own domain rule is worse than no fixture.
      opp("opp_demo_5", workspaceId, 5, DEMO_OPPORTUNITIES[4], "acc_demo_2", "camp_demo_2", "terr_east", REP2, "lost", "closed", 320_000, 0, daysAgo(90), daysAgo(90), "lost"),
      opp("opp_demo_6", workspaceId, 6, DEMO_OPPORTUNITIES[5], "acc_demo_4", "camp_demo_3", "terr_south", REP2, "propose", "commit", 1_800_000, 70, daysAhead(32), null, "open"),
      opp("opp_demo_7", workspaceId, 7, DEMO_OPPORTUNITIES[6], "acc_demo_5", "camp_demo_1", "terr_south", REP1, "discover", "pipeline", 620_000, 25, daysAhead(80), null, "open"),
      opp("opp_demo_8", workspaceId, 8, DEMO_OPPORTUNITIES[7], "acc_demo_2", null, "terr_east", REP2, "won", "closed", 1_400_000, 100, daysAgo(40), daysAgo(40), "won"),
      opp("opp_demo_9", workspaceId, 9, DEMO_OPPORTUNITIES[8], "acc_demo_4", null, "terr_south", REP2, "negotiate", "best_case", 950_000, 90, daysAhead(20), null, "open"),
      opp("opp_demo_10", workspaceId, 10, DEMO_OPPORTUNITIES[9], "acc_demo_5", "camp_demo_3", "terr_south", REP1, "won", "closed", 540_000, 100, daysAgo(8), daysAgo(8), "won"),
      // --- The settled quarter (2026Q2) -----------------------------------
      //
      // Three wins totalling 3,200,000 against an opening commit of 2,600,000,
      // so the two figures the trajectory reports DIFFER: 已兑现 123% and
      // 准确率 77%. That gap is the whole lesson - a quarter can be beaten and
      // forecast badly at the same time, and a demo where the two numbers
      // coincide teaches nobody why there are two of them.
      //
      // ACCOUNTS WITH NO Q3 WIN, deliberately. countNewLogos credits an
      // account's FIRST-EVER win, so giving a Q2 win to acc_demo_1/2/5 would
      // move their first win out of Q3 and silently change the current
      // quarter's new-logo count - a fixture edit that breaks a number nobody
      // was looking at.
      opp("opp_demo_16", workspaceId, 16, DEMO_OPPORTUNITIES[15], "acc_demo_3", null, "terr_north", REP1, "won", "closed", 1_200_000, 100, PRIOR_MID, PRIOR_MID, "won"),
      opp("opp_demo_17", workspaceId, 17, DEMO_OPPORTUNITIES[16], "acc_demo_4", null, "terr_south", REP2, "won", "closed", 1_400_000, 100, PRIOR_LATE, PRIOR_LATE, "won"),
      opp("opp_demo_18", workspaceId, 18, DEMO_OPPORTUNITIES[17], "acc_demo_6", null, "terr_east", REP2, "won", "closed", 600_000, 100, PRIOR_LATE, PRIOR_LATE, "won"),
      // A deal on the unplaced customer, and filed under NO territory itself -
      // both paths blank, which is the only way to reach the unplaced rule.
      // Given a territory it would simply belong to that one, and the case
      // would vanish from the demo again.
      opp("opp_demo_19", workspaceId, 19, DEMO_OPPORTUNITIES[18], "acc_demo_8", null, null, REP2, "discover", "pipeline", 520_000, 25, daysAhead(70), null, "open"),
      // Filed under terr_hk - the ONE territory in this demo that names a
      // single region, and the whole reason accountGaps() can suggest
      // anything for acc_demo_9 rather than declining between two candidates.
      opp("opp_demo_20", workspaceId, 20, DEMO_OPPORTUNITIES[19], "acc_demo_9", null, "terr_hk", REP1, "discover", "pipeline", 380_000, 20, daysAhead(60), null, "open"),
      // Rule-coverage deals. Both open, both with a real amount, so the two
      // new accounts appear in the pipeline the judgement rules read.
      //
      // opp_demo_11 CLOSES IN Q3 (+40, not +75). Every date here was chosen
      // when nothing read them; after TD-014 the tiles and the snapshot are
      // period-filtered, and all three pipeline-category deals sat in Q4, so
      // the pipeline tile and the pipeline metric would have read zero on every
      // run with nothing to demonstrate. One is moved, not all three - the
      // other two stay in Q4 and are visibly excluded, which is the behaviour
      // this demo now has to show.
      opp("opp_demo_11", workspaceId, 11, DEMO_OPPORTUNITIES[10], "acc_demo_6", null, "terr_south", REP1, "qualify", "pipeline", 480_000, 25, daysAhead(40), null, "open"),
      opp("opp_demo_12", workspaceId, 12, DEMO_OPPORTUNITIES[11], "acc_demo_7", null, "terr_east", REP1, "validate", "best_case", 930_000, 45, daysAhead(52), null, "open"),
      // THE RENEWAL THAT ALREADY EXISTS, opened off prj_demo_6. Its campaign
      // is null on purpose: a renewal is attributed to the project it renews,
      // never to the campaign that won the first term.
      opp("opp_demo_13", workspaceId, 13, DEMO_OPPORTUNITIES[12], "acc_demo_7", null, "terr_east", REP2, "discover", "pipeline", 880_000, 25, daysAhead(21), null, "open", "prj_demo_6"),
      // NO EXPECTED CLOSE DATE, filed as commit. Committing IS naming a period,
      // so the rule caps it at pipeline and the page has to say why. The
      opp("opp_demo_14", workspaceId, 14, DEMO_OPPORTUNITIES[13], "acc_demo_3", null, "terr_north", REP1, "negotiate", "commit", 1_100_000, 90, null, null, "open"),
      // THE DATE CAME AND WENT AND IT IS STILL OPEN, and it has not moved stage
      // in months. Two caps on one row, which is also the only demo case that
      // renders more than one reason in the basis column.
      opp("opp_demo_15", workspaceId, 15, DEMO_OPPORTUNITIES[14], "acc_demo_6", null, "terr_east", REP2, "propose", "commit", 670_000, 85, daysAgo(9), null, "open"),
    ],
    {
      // A stage never jumps: every event names the stage it came from, and the
      // first one comes from null. A history with a gap in it would make the
      // journal look optional.
      events: [
        ...stageHistory("opp_demo_1", ["qualify", "discover", "validate", "propose", "negotiate"], REP1, 120, 10),
        // The last event of a closed deal lands on its closedAt, not near it.
        ...stageHistory("opp_demo_4", ["qualify", "discover", "validate", "propose", "negotiate", "won"], REP1, 150, 15),
        ...stageHistory("opp_demo_5", ["qualify", "discover", "lost"], REP2, 160, 90),
        ...stageHistory("opp_demo_6", ["qualify", "discover", "validate", "propose"], REP2, 70, 6),
        // Last move 75 days before the demo anchor, so it is past STALL_DAYS
        // however long after the anchor the page is opened.
        ...stageHistory("opp_demo_15", ["qualify", "discover", "validate", "propose"], REP2, 200, 75),
      ],
      // Two of the four closed deals are reviewed; the other two are the debt
      // the pipeline page renders.
      reviews: [
        {
          id: "wlr_demo_1",
          workspaceId,
          opportunityId: "opp_demo_5",
          outcome: "lost",
          primaryReason: "fit",
          competitor: null,
          lessons: DEMO_LESSONS[1],
          reviewerSub: "usr_demo_leader",
          reviewedAt: daysAgo(85),
        },
        {
          id: "wlr_demo_2",
          workspaceId,
          opportunityId: "opp_demo_8",
          outcome: "won",
          primaryReason: "fit",
          competitor: null,
          lessons: DEMO_LESSONS[0],
          reviewerSub: "usr_demo_leader",
          reviewedAt: daysAgo(35),
        },
      ],
      // A forecast SERIES, five points across the quarter.
      //
      // This is the only reason forecast_snapshot has UPDATE revoked: accuracy
      // is period-end actual against what was forecast at period start, and
      // that is unanswerable unless every point survives. Nothing read it back
      // until now, so the immutability was a cost the product paid and never
      // collected on.
      //
      // The shape tells a true story rather than a flattering one: commit rose
      // through the quarter, then fell when one deal slipped - which is what a
      // forecast actually does and what makes the history worth keeping.
      snapshots: [
        snapshot(workspaceId, daysAgo(75), 3_200_000, 1_500_000, 900_000, 0, 0),
        snapshot(workspaceId, daysAgo(60), 3_800_000, 1_400_000, 800_000, 760_000, 1),
        snapshot(workspaceId, daysAgo(45), 4_600_000, 1_200_000, 700_000, 1_300_000, 2),
        snapshot(workspaceId, daysAgo(30), 4_900_000, 1_100_000, 600_000, 2_700_000, 3),
        // The slip: commit came down because one deal moved out of the quarter.
        //
        // The LAST point equals what the live board computes right now
        // (4,200,000 / 950,000 / 480,000 / 2,700,000). A snapshot taken today
        // that disagreed with today would be a demo teaching the exact "total
        // and detail disagree" mess this repo keeps arguing against - and the
        // closed figure also has to match the quota card, because both are the
        // same three won deals.
        //
        // These numbers moved with TD-014. They used to be the WHOLE BOOK
        // (3,030,000 best case, 1,580,000 pipeline) on a row labelled 2026Q3;
        // now they are the quarter, and the deals dated into Q4 are not in
        // them.
        snapshot(workspaceId, daysAgo(14), 4_200_000, 950_000, 480_000, 2_700_000, 3),

        // --- 2026Q2, the quarter that is OVER --------------------------------
        //
        // Opening commit 2,600,000; the quarter closed 3,200,000. That is the
        // pair the scorecard exists to separate: they landed 123% of what they
        // promised, and their forecast was 77% accurate. Beating the number is
        // not the same as knowing it.
        //
        // THE LAST POINT DRAINS TO ZERO, which is what a finished quarter
        // actually looks like: nothing is still committed, everything is
        // closed. It also has to equal what the live board computes for Q2 -
        // all three deals are terminal, so commit/best/pipeline are 0 and
        // closed is 3,200,000 - by the same rule the Q3 series follows.
        priorSnapshot(workspaceId, priorDay(7), 2_600_000, 1_100_000, 700_000, 0, 0),
        priorSnapshot(workspaceId, priorDay(47), 2_900_000, 800_000, 500_000, 1_200_000, 1),
        priorSnapshot(workspaceId, priorDay(88), 0, 0, 0, 3_200_000, 3),
      ],
    },
  );
}

/**
 * A contiguous stage journal ending at the deal's current stage, spread evenly
 * between the first move and the last.
 */
function stageHistory(
  opportunityId: string,
  stages: readonly string[],
  actorSub: string,
  firstDaysAgo: number,
  lastDaysAgo: number,
): StageEventRecord[] {
  const span = (firstDaysAgo - lastDaysAgo) / Math.max(1, stages.length - 1);
  return stages.map((to, i) => ({
    id: `${opportunityId}_ev_${i + 1}`,
    opportunityId,
    fromStage: (i === 0 ? null : stages[i - 1]) as StageEventRecord["fromStage"],
    toStage: to as StageEventRecord["toStage"],
    reason: null,
    actorSub,
    occurredAt: daysAgo(Math.round(firstDaysAgo - i * span)),
  }));
}

function seedDelivery(workspaceId: string, stores: DemoStores): void {
  stores.delivery.seed({
    projects: [
      // Reported green while carrying an overdue instalment: the delivery page
      // downgrades it, so the rule is demonstrated rather than claimed.
      // SUBSCRIPTION, due in 38 days, and reported green while carrying an
      // overdue instalment. The renewal page must show it at `watch` risk, not
      // `low` - which is the one thing about a renewal knowable in advance,
      // and it comes from the health the facts derive rather than the one the
      // delivery team reported.
      project("prj_demo_1", workspaceId, 1, DEMO_PROJECTS[0], "opp_demo_4", "acc_demo_1", 760_000, "green", "active", "subscription", daysAhead(38)),
      // LAPSED TWELVE DAYS AGO. The most urgent renewal there is, and the one
      // a window that filtered out the past would hide.
      project("prj_demo_2", workspaceId, 2, DEMO_PROJECTS[1], "opp_demo_8", "acc_demo_2", 1_400_000, "green", "active", "subscription", daysAgo(12)),
      project("prj_demo_3", workspaceId, 3, DEMO_PROJECTS[2], "opp_demo_10", "acc_demo_5", 540_000, "amber", "planning"),
      // Delivered and finished. A one-off has nothing to renew, and its
      // absence from the renewal list is the 0018 ruling working.
      project("prj_demo_4", workspaceId, 4, DEMO_PROJECTS[3], null, "acc_demo_4", 300_000, "green", "delivered"),
      // A SUBSCRIPTION WITH NO END DATE. Not due - and the reason is a data
      // gap that will silently cost a renewal, so the page names it rather
      // than dropping the row.
      project("prj_demo_5", workspaceId, 5, DEMO_PROJECTS[4], null, "acc_demo_6", 420_000, "green", "active", "subscription", null),
      // ALREADY RENEWED - opp_demo_13 below was opened off it. Due by every
      // other measure, and proposed a second time only if 0019's link is
      // missing, which is exactly the defect that increment exists to close.
      project("prj_demo_6", workspaceId, 6, DEMO_PROJECTS[5], null, "acc_demo_7", 880_000, "green", "on_hold", "subscription", daysAhead(21)),
    ],
    milestones: [
      milestone("ms_1", workspaceId, "prj_demo_1", DEMO_MILESTONES[0], 1, "done", daysAgo(30), daysAgo(31)),
      milestone("ms_2", workspaceId, "prj_demo_1", DEMO_MILESTONES[1], 2, "in_progress", daysAhead(10), null),
      milestone("ms_3", workspaceId, "prj_demo_1", DEMO_MILESTONES[2], 3, "pending", daysAhead(60), null),
      milestone("ms_4", workspaceId, "prj_demo_2", DEMO_MILESTONES[0], 1, "done", daysAgo(25), daysAgo(26)),
      milestone("ms_5", workspaceId, "prj_demo_2", DEMO_MILESTONES[1], 2, "done", daysAgo(5), daysAgo(6)),
      milestone("ms_6", workspaceId, "prj_demo_3", DEMO_MILESTONES[0], 1, "pending", daysAhead(14), null),
      milestone("ms_7", workspaceId, "prj_demo_4", DEMO_MILESTONES[3], 1, "done", daysAgo(60), daysAgo(58)),
    ],
    instalments: [
      instalment("inst_1", workspaceId, "prj_demo_1", "ms_1", 1, "settled", 380_000, 380_000, daysAgo(25), daysAgo(24)),
      instalment("inst_2", workspaceId, "prj_demo_1", "ms_2", 2, "overdue", 380_000, null, daysAgo(8), null),
      instalment("inst_3", workspaceId, "prj_demo_2", "ms_4", 1, "settled", 700_000, 700_000, daysAgo(20), daysAgo(19)),
      instalment("inst_4", workspaceId, "prj_demo_2", "ms_5", 2, "invoiced", 700_000, null, daysAhead(12), null),
      instalment("inst_5", workspaceId, "prj_demo_3", "ms_6", 1, "planned", 270_000, null, daysAhead(30), null),
      instalment("inst_6", workspaceId, "prj_demo_3", null, 2, "planned", 270_000, null, daysAhead(90), null),
      // Collected short of plan: the planned-versus-actual gap this domain
      // exists to produce is only visible if one instalment actually has one.
      instalment("inst_7", workspaceId, "prj_demo_4", "ms_7", 1, "settled", 300_000, 290_000, daysAgo(50), daysAgo(49)),
    ],
  });
}

function seedCopilot(workspaceId: string, stores: DemoStores): void {
  stores.copilot.seedProposals(workspaceId, [
    proposal("act_demo_1", "proposed", "advance_stage", "opportunity", "opp_demo_2", { to: "propose" }, DEMO_RATIONALES[0], 86, null, 1),
    proposal("act_demo_2", "proposed", "draft_outreach", "account", "acc_demo_1", { channel: "email" }, DEMO_RATIONALES[1], 52, null, 1),
    proposal("act_demo_3", "proposed", "promote_signal", "lead", "lead_demo_2", { score: 71 }, DEMO_RATIONALES[2], 64, null, 2),
    proposal("act_demo_4", "rejected", "advance_stage", "opportunity", "opp_demo_3", { to: "discover" }, DEMO_RATIONALES[3], 41, "usr_demo_leader", 4),
    proposal("act_demo_5", "proposed", "advance_stage", "opportunity", "opp_demo_6", { to: "negotiate" }, DEMO_RATIONALES[4], 77, null, 1),
    // PAST THE DECISION WINDOW ON PURPOSE. Opening the queue sweeps it, so the
    // demo shows the outcome the spec asks for - a recommendation nobody
    // decided becomes visibly `expired` rather than quietly staying live.
    proposal("act_demo_6", "proposed", "draft_outreach", "account", "acc_demo_3", { channel: "call" }, DEMO_RATIONALES[1], 44, null, 9),
  ]);

  stores.copilot.seedPlaybooks(
    workspaceId,
    DEMO_PLAYBOOKS.map((pb, i) => ({
      id: `pb_demo_${i + 1}`,
      playbookCode: pb.code,
      name: pb.name,
      scopeDomain: pb.scope as PlaybookScope,
      content: pb.content,
      version: 1,
      status: "active",
    })),
  );
}

// --- row builders, kept terse so the data above reads as a table -----------

function campaign(
  id: string,
  workspaceId: string,
  name: string,
  planId: string,
  channel: string,
  budget: number,
  status: string,
  startsAt: Date,
  endsAt: Date,
) {
  return {
    id,
    workspaceId,
    campaignNo: `CAMP-${id.slice(-1).padStart(4, "0")}`,
    name,
    planId,
    segmentId: null,
    channel,
    budgetAmount: money(budget, CNY),
    ownerSub: "usr_demo_mkt",
    startsAt,
    endsAt,
    status: status as never,
    currency: CNY,
  };
}

function execution(
  id: string,
  workspaceId: string,
  campaignId: string,
  title: string,
  actionType: string,
  status: string,
  dueAt: Date,
) {
  return {
    id,
    workspaceId,
    campaignId,
    title,
    actionType: actionType as never,
    assigneeSub: "usr_demo_mkt",
    dueAt,
    status: status as never,
  };
}

function territory(
  id: string,
  workspaceId: string,
  code: string,
  name: string,
  ownerSub: string,
  regions: readonly string[],
) {
  return { id, workspaceId, territoryCode: code, name, parentId: null, ownerSub, regions, status: "active" };
}

function target(
  id: string,
  workspaceId: string,
  scopeType: "workspace" | "territory" | "owner",
  territoryId: string | null,
  ownerSub: string | null,
  amount: number,
  status: string,
) {
  return {
    id,
    workspaceId,
    period: PERIOD,
    scopeType,
    territoryId,
    ownerSub,
    metric: "revenue" as const,
    targetValue: { unit: "money" as const, amount, currency: CNY },
    status: status as never,
    planId: "plan_demo_1",
  };
}

function account(
  id: string,
  workspaceId: string,
  n: number,
  info: { name: string; industry: string; region: string },
  segmentCode: string,
  ownerSub: string,
  healthScore: number | null,
  status: string,
  tier: "strategic" | "key" | "standard" = "standard",
  // incr/0024 and 0025. Optional and null by default, because that is the
  // honest default: most of these are prospects somebody met recently, and a
  // seed that filled every field would show a customer master nobody has ever
  // had. The few that ARE filled below exist so the screens have both states.
  identity: {
    creditCode?: string | null;
    website?: string | null;
    employeeCount?: number | null;
    parentId?: string | null;
  } = {},
) {
  return {
    tier,
    id,
    workspaceId,
    accountNo: `ACC-${String(n).padStart(4, "0")}`,
    name: info.name,
    // Empty reads as ABSENT, not as an industry named "". The fixture writes ""
    // for the first-entry account because the type is a plain string; the
    // column and every rule downstream treat a blank as unknown.
    industry: info.industry || null,
    // Same reasoning as industry, and needed for the same reason: 港澳零售集团
    // writes "" for the region-derivable case, and the column and every rule
    // downstream treat a blank as unknown, not as an account with no region.
    region: info.region || null,
    creditCode: identity.creditCode ?? null,
    website: identity.website ?? null,
    employeeCount: identity.employeeCount ?? null,
    parentId: identity.parentId ?? null,
    segmentCode,
    ownerSub,
    healthScore,
    status: status as never,
  };
}

function contact(
  id: string,
  workspaceId: string,
  accountId: string,
  info: { name: string; title: string; department: string },
  // incr/0024. Same reasoning as the account identity block: null is the
  // normal state, and the demo needs contacts in BOTH states so "we have no
  // way to reach the economic buyer" is a case the screens actually show.
  reach: { email?: string | null; mobile?: string | null; wechat?: string | null } = {},
) {
  return {
    id,
    workspaceId,
    accountId,
    name: info.name,
    title: info.title,
    department: info.department,
    email: reach.email ?? null,
    mobile: reach.mobile ?? null,
    wechat: reach.wechat ?? null,
    status: "active",
  };
}

function oc(
  id: string,
  workspaceId: string,
  opportunityId: string,
  personId: string,
  buyingRole: string,
  influence: number,
) {
  return {
    id,
    workspaceId,
    opportunityId,
    personId,
    buyingRole: buyingRole as never,
    influence,
    isPrimary: false,
  };
}

function signal(
  id: string,
  workspaceId: string,
  source: string,
  sourceRef: string | null,
  signalType: string,
  subject: string,
  accountId: string | null,
  score: number | null,
  status: string,
  agedDays: number,
  // ADR-016: WHY we were looking. Ordering only - it never enters the score.
  targeting: "named_account" | "product_domain" | "none" | null = null,
) {
  return {
    id,
    workspaceId,
    targeting,
    source,
    sourceRef,
    signalType: signalType as never,
    subject,
    payload: {},
    detectedAt: daysAgo(agedDays),
    accountId,
    score,
    status: status as never,
  };
}

function lead(
  id: string,
  workspaceId: string,
  n: number,
  companyName: string,
  accountId: string | null,
  signalId: string | null,
  campaignId: string | null,
  score: number,
  ownerSub: string,
  status: string,
  convertedOpportunityId: string | null,
) {
  return {
    id,
    workspaceId,
    leadNo: `LEAD-${String(n).padStart(5, "0")}`,
    companyName,
    contactName: null,
    accountId,
    signalId,
    campaignId,
    score,
    ownerSub,
    status: status as never,
    convertedOpportunityId,
  };
}

/**
 * acc_demo_N -> the fixture name that account was seeded with.
 *
 * DERIVED from DEMO_ACCOUNTS rather than written out, because a second list of
 * the same names is a second list to forget. The ids are assigned in fixture
 * order by seedAccounts, and demo-seed.test.ts holds that correspondence.
 */
const DEMO_ACCOUNT_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  DEMO_ACCOUNTS.map((a, i) => [`acc_demo_${i + 1}`, a.name]),
);

function opp(
  id: string,
  workspaceId: string,
  n: number,
  name: string,
  accountId: string,
  campaignId: string | null,
  // Nullable, like the column. A deal filed under no territory is an ordinary
  // state - and it is the only way to reach the unplaced rule, since a deal
  // WITH a territory simply belongs to that one.
  territoryId: string | null,
  ownerSub: string,
  stage: string,
  forecastCategory: string,
  amount: number,
  probability: number,
  // Nullable, like the column. A deal with no expected close date is an
  // ordinary state - and the forecast rule's answer to it is one of the things
  // the demo has to be able to show.
  expectedCloseAt: Date | null,
  closedAt: Date | null,
  status: string,
  sourceProjectId: string | null = null,
) {
  return {
    id,
    workspaceId,
    sourceProjectId,
    opportunityNo: `OPP-2026-${String(n).padStart(4, "0")}`,
    name,
    accountId,
    // THE NAME, not a blank. This read `undefined`, and the pipeline page's
    // `accountName ?? accountId` fallback then printed `acc_demo_2` on every
    // row of the deal list - an id where the customer should be, on the screen
    // a seller looks at most. The name was in DEMO_ACCOUNTS the whole time;
    // the seed's own lead() helper has been passing it since it was written.
    accountName: DEMO_ACCOUNT_NAME_BY_ID[accountId],
    planId: "plan_demo_1",
    campaignId,
    territoryId,
    ownerSub,
    stage: stage as never,
    forecastCategory: forecastCategory as never,
    amount: money(amount, CNY),
    probability,
    expectedCloseAt,
    // Derived rather than passed: this helper already takes fifteen positional
    // arguments and a sixteenth would be unreadable. A deal is created some
    // months before it lands, so creation is anchored to the date it closed or
    // is expected to close. It only has to be EARLIER than every interaction
    // recorded against it - the capture metric's denominator asks when a deal
    // started being a deal, and a note predating its own opportunity would make
    // a week's coverage exceed one.
    // NOW is the last fallback, for a deal with neither date. Leaving it
    // undefined would let the store stamp the real clock, and a fixture whose
    // creation date moves every time the demo is seeded is not a fixture.
    createdAt: new Date((closedAt ?? expectedCloseAt ?? NOW).getTime() - 130 * 86_400_000),
    closedAt,
    status: status as never,
    currency: CNY,
  };
}

function project(
  id: string,
  workspaceId: string,
  n: number,
  name: string,
  opportunityId: string | null,
  accountId: string,
  contract: number,
  health: string,
  status: string,
  engagementType: "one_off" | "subscription" = "one_off",
  endsAt: Date | null = null,
) {
  return {
    id,
    workspaceId,
    projectNo: `PRJ-${String(n).padStart(4, "0")}`,
    name,
    opportunityId,
    accountId,
    managerSub: PM,
    contractAmount: money(contract, CNY),
    health: health as never,
    status,
    currency: CNY,
    endsAt,
    // Defaulting here for the same reason 0018 defaults in the DDL: a project
    // that says nothing about its commercial shape is not a subscription.
    engagementType,
  };
}

function milestone(
  id: string,
  workspaceId: string,
  projectId: string,
  name: string,
  sequence: number,
  status: string,
  dueAt: Date,
  completedAt: Date | null,
) {
  return { id, workspaceId, projectId, name, sequence, status: status as never, dueAt, completedAt };
}

function instalment(
  id: string,
  workspaceId: string,
  projectId: string,
  milestoneId: string | null,
  sequence: number,
  status: string,
  planned: number,
  actual: number | null,
  dueAt: Date,
  settledAt: Date | null,
) {
  return {
    id,
    workspaceId,
    projectId,
    milestoneId,
    sequence,
    status: status as never,
    plannedAmount: money(planned, CNY),
    actualAmount: actual == null ? null : money(actual, CNY),
    dueAt,
    settledAt,
  };
}

const CAPABILITY_BY_ACTION: Record<string, string> = {
  advance_stage: "deal.stall_risk",
  draft_outreach: "account.chain_map",
  promote_signal: "signal.triage",
  adjust_forecast: "deal.stall_risk",
};

function proposal(
  id: string,
  status: string,
  actionType: string,
  subjectType: string,
  subjectId: string,
  payload: Record<string, unknown>,
  rationale: string,
  confidence: number,
  decidedBySub: string | null,
  agedDays: number,
) {
  return {
    // ADR-015: which capability proposed it, chosen by what it proposes.
    capability: CAPABILITY_BY_ACTION[actionType] ?? null,
    id,
    status: status as never,
    actionType,
    subjectType: subjectType as never,
    subjectId,
    payload,
    rationale,
    confidence,
    decidedBySub,
    decidedAt: decidedBySub ? daysAgo(agedDays - 1) : null,
    executedAt: null,
    createdAt: daysAgo(agedDays),
  };
}

// The catalogue, and the lines that give six deals a composition (ADR-014).
//
// The lines are built to RECONCILE with the header amounts already seeded, not
// invented alongside them: a demo where the total and the detail disagree would
// teach the exact mess the reconciliation rule exists to prevent. The unit
// prices are therefore derived from each deal's total, and one line is priced
// below its floor on purpose so the approval flag has a case.
function seedCatalog(workspaceId: string, stores: DemoStores): void {
  const types = DEMO_PRODUCT_TYPES.map((name, i) => ({
    id: `ptp_demo_${i + 1}`,
    workspaceId,
    typeCode: name,
    name,
    sortOrder: i + 1,
    status: "active" as const,
  }));
  // The association is by UUID (incr/0029) - the fixtures name types by their
  // code for readability, the seed resolves them to ids here.
  const typeIdOf = new Map(types.map((t) => [t.typeCode, t.id]));

  // The three system status rows - what 0029's backfill produces. Names stay
  // null (the interface's default labels apply until a workspace renames one).
  const statuses = (["in_development", "active", "retired"] as const).map((code, i) => ({
    id: `pst_demo_${i + 1}`,
    workspaceId,
    statusCode: code as string,
    name: null,
    behavior: code,
    sortOrder: i + 1,
    status: "active" as const,
  }));

  const products = [
    ...DEMO_PRODUCTS.map((p, i) => ({
      id: `prd_demo_${i + 1}`,
      workspaceId,
      productCode: p.code,
      name: p.name,
      typeId: typeIdOf.get(p.category) ?? null,
      unit: p.unit,
      status: "active",
      sortOrder: i + 1,
    })),
    // The in-development roster, after the sellable one - so the module page's
    // 在研 tag and the per-type "N 研发" small print both have real cases.
    ...DEMO_DEV_PRODUCTS.map((p, i) => ({
      id: `prd_demo_dev_${i + 1}`,
      workspaceId,
      productCode: p.code,
      name: p.name,
      typeId: typeIdOf.get(p.category) ?? null,
      unit: p.unit,
      status: "in_development",
      sortOrder: DEMO_PRODUCTS.length + i + 1,
    })),
    // The shelf: one product retired, so the module page's second roster and
    // its 恢复在售 action have something real to show.
    ...DEMO_RETIRED_PRODUCTS.map((p, i) => ({
      id: `prd_demo_ret_${i + 1}`,
      workspaceId,
      productCode: p.code,
      name: p.name,
      typeId: typeIdOf.get(p.category) ?? null,
      unit: p.unit,
      status: "retired",
      sortOrder: DEMO_PRODUCTS.length + DEMO_DEV_PRODUCTS.length + i + 1,
    })),
  ];
  const byCode = new Map(products.map((p) => [p.productCode, p.id]));

  const solutions = DEMO_SOLUTIONS.map((sol, i) => ({
    id: `sol_demo_${i + 1}`,
    workspaceId,
    solutionCode: sol.code,
    name: sol.name,
    summary: sol.summary,
    status: "active" as const,
  }));

  const items = DEMO_SOLUTIONS.flatMap((sol, si) =>
    sol.items.map((it, ii) => ({
      id: `sit_demo_${si + 1}_${ii + 1}`,
      workspaceId,
      solutionId: `sol_demo_${si + 1}`,
      productId: byCode.get(it.code)!,
      quantity: it.qty,
    })),
  );

  const prices = DEMO_PRODUCTS.map((p, i) => ({
    id: `pbe_demo_${i + 1}`,
    workspaceId,
    productId: `prd_demo_${i + 1}`,
    currency: CNY,
    listPrice: p.list,
    floorPrice: p.floor,
    effectiveAt: daysAgo(180),
  }));

  // Each entry: deal, solution it was quoted from, and the products with the
  // quantities that add up to that deal's seeded amount.
  const composition: Array<{
    opp: string;
    sol: string | null;
    lines: Array<{ code: (typeof DEMO_PRODUCTS)[number]["code"]; qty: number; unit: number }>;
  }> = [
    // The explicit numbers below; the seed test proves they add up.
    { opp: "opp_demo_1", sol: "sol_demo_1", lines: [
      { code: "PRD-CORE", qty: 1, unit: 800_000 },
      { code: "PRD-ANALYTICS", qty: 1, unit: 400_000 },
      { code: "PRD-INTEGRATION", qty: 16, unit: 62_500 },
      { code: "PRD-SUPPORT", qty: 1, unit: 200_000 },
    ] },
    { opp: "opp_demo_2", sol: "sol_demo_2", lines: [
      { code: "PRD-WMS", qty: 1, unit: 600_000 },
      { code: "PRD-INTEGRATION", qty: 10, unit: 55_000 },
    ] },
    { opp: "opp_demo_4", sol: "sol_demo_1", lines: [
      { code: "PRD-CORE", qty: 1, unit: 600_000 },
      { code: "PRD-SUPPORT", qty: 1, unit: 160_000 },
    ] },
    { opp: "opp_demo_6", sol: "sol_demo_2", lines: [
      { code: "PRD-WMS", qty: 2, unit: 600_000 },
      { code: "PRD-INTEGRATION", qty: 10, unit: 60_000 },
    ] },
    { opp: "opp_demo_9", sol: "sol_demo_1", lines: [
      { code: "PRD-ANALYTICS", qty: 1, unit: 400_000 },
      { code: "PRD-INTEGRATION", qty: 5, unit: 60_000 },
      { code: "PRD-SUPPORT", qty: 1, unit: 250_000 },
    ] },
    // Below floor on the platform line (600k floor, quoted 520k): the approval
    // flag needs a real case or nobody ever sees what it looks like.
    { opp: "opp_demo_12", sol: "sol_demo_1", lines: [
      { code: "PRD-CORE", qty: 1, unit: 520_000 },
      { code: "PRD-ANALYTICS", qty: 1, unit: 330_000 },
      { code: "PRD-INTEGRATION", qty: 1, unit: 80_000 },
    ] },
  ];

  let seq = 0;
  const lines = composition.flatMap((c) =>
    c.lines.map((l) => {
      const productId = byCode.get(l.code)!;
      const price = DEMO_PRODUCTS.find((p) => p.code === l.code)!;
      return {
        id: `oln_demo_${++seq}`,
        workspaceId,
        opportunityId: c.opp,
        productId,
        solutionId: c.sol,
        quantity: l.qty,
        unitPrice: l.unit,
        amount: Math.round(l.qty * l.unit * 100) / 100,
        currency: CNY,
        // Computed from the book, never hand-set - same rule as the service.
        needsApproval: l.unit < price.floor,
      };
    }),
  );

  stores.catalog.seed({ products, types, statuses, solutions, items, prices, lines });
}

/** One point on the forecast trajectory. Workspace scope, CNY. */
/** A day inside the settled quarter, by offset from its start. */
function priorDay(n: number): Date {
  return new Date(PRIOR_RANGE.start.getTime() + n * DAY_MS);
}

/** The same row, for the quarter that is over. */
function priorSnapshot(
  workspaceId: string,
  at: Date,
  commit: number,
  bestCase: number,
  pipelineAmt: number,
  closed: number,
  newLogos: number,
) {
  return { ...snapshot(workspaceId, at, commit, bestCase, pipelineAmt, closed, newLogos), period: PRIOR_PERIOD };
}

function snapshot(
  workspaceId: string,
  at: Date,
  commit: number,
  bestCase: number,
  pipelineAmt: number,
  closed: number,
  newLogos: number,
) {
  return {
    workspaceId,
    period: PERIOD,
    scopeType: "workspace" as const,
    territoryId: null,
    ownerSub: null,
    currency: CNY,
    snapshotAt: at,
    commitAmount: money(commit, CNY),
    bestCaseAmount: money(bestCase, CNY),
    pipelineAmount: money(pipelineAmt, CNY),
    closedAmount: money(closed, CNY),
    newLogoCount: newLogos,
  };
}
