// 全国样本 - the national cohort behind the situation screen.
//
// WHY THIS IS A SEPARATE POPULATION (owner, 2026-09-07: go B).
//
// The nine `acc_demo_*` accounts are not a small dataset by accident. Every one
// of them was chosen to exercise one rule - the unplaced territory, the
// derivable region, the subsidiary that is a customer in its own right, the
// strategic prospect where nothing has happened - and 68 assertions in
// demo-seed.test.ts are keyed to them, several by ORDERING ("oldest first",
// "sickest first"). Dropping ninety generated accounts into that set would make
// the sickest account a generated row and the oldest proposal a generated row,
// and the fixture would stop teaching what it was built to teach.
//
// So the cohort is ADDITIVE and carries its own `acc_nat_*` prefix. It lives in
// the same workspace and the same stores - the screen reads the platform's real
// services, not a private copy - while the rule fixtures scope themselves to the
// curated prefix and keep asserting on the rows they were written for.
//
// WHAT IT IS FOR, precisely: a province-level map is unreadable at n=9. Nine
// accounts colour nine provinces and leave twenty-five blank, which reads as
// "no business there" rather than "no data here". The cohort covers every
// province so the choropleth has a real distribution to grade against.
//
// DETERMINISTIC. Seeded off the province name, so the same province produces
// the same figures on every run. A demo whose numbers move between reloads
// cannot be reviewed, and a screenshot of it cannot be compared to anything.

import { PROVINCES_BY_REGION, regionOfProvince } from "./provinces";

/** FNV-1a over the province name, then xorshift. No Math.random anywhere. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const next = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
  // WARM-UP. Straight out of FNV the first xorshift lands in a narrow band for
  // neighbouring seeds, and since every province seeds its own generator that
  // showed up as runs of identical health scores - 39, 39, 39 down the column.
  // Discarding three draws decorrelates them: the runs are gone, and the spread
  // widens to 39-94 across 89 accounts. (Distinct values barely move, 42 -> 43,
  // because an integer 39..94 only has 56 slots - the fix is the ORDER, not the
  // variety, and quoting a distinct-count as the win would be measuring the
  // wrong thing.)
  next(); next(); next();
  return next;
}

/**
 * Relative commercial weight per province.
 *
 * Not decoration and not random: a map where every province carries the same
 * number is a map with nothing to read. These are rough shares of Chinese
 * enterprise IT spend, so the colour gradient lands where a reader expects it
 * and an unexpected province standing out means something.
 */
const WEIGHT: Record<string, number> = {
  广东省: 1, 江苏省: 0.95, 浙江省: 0.88, 山东省: 0.78, 上海市: 0.76, 北京市: 0.75,
  四川省: 0.62, 河南省: 0.58, 湖北省: 0.55, 福建省: 0.54, 湖南省: 0.5, 安徽省: 0.46,
  河北省: 0.44, 陕西省: 0.4, 辽宁省: 0.38, 江西省: 0.35, 重庆市: 0.35, 云南省: 0.3,
  广西壮族自治区: 0.3, 山西省: 0.28, 天津市: 0.28, 贵州省: 0.25, 黑龙江省: 0.24,
  吉林省: 0.22, 内蒙古自治区: 0.22, 新疆维吾尔自治区: 0.2, 甘肃省: 0.17,
  海南省: 0.15, 台湾省: 0.15, 宁夏回族自治区: 0.1, 青海省: 0.09, 西藏自治区: 0.07,
  香港特别行政区: 0.2, 澳门特别行政区: 0.06,
};

/** Industry vocabulary, matching the words the curated accounts already use. */
const INDUSTRIES = ["零售", "制造", "通信", "物流", "能源", "金融", "医药", "教育"] as const;

/** Second element of a company name, so ninety rows do not read as one row. */
const TRADES = [
  "科技", "实业", "集团", "股份", "控股", "供应链", "智造", "数字", "网络", "信息",
] as const;

export interface NationalAccount {
  readonly id: string;
  readonly n: number;
  readonly name: string;
  readonly industry: string;
  readonly region: string;
  readonly province: string;
  readonly segmentCode: string;
  readonly ownerSub: string;
  readonly healthScore: number;
  readonly status: string;
  readonly tier: "strategic" | "key" | "standard";
}

export interface NationalOpportunity {
  readonly id: string;
  readonly n: number;
  readonly name: string;
  readonly accountId: string;
  readonly ownerSub: string;
  readonly stage: string;
  readonly forecastCategory: string;
  readonly amount: number;
  readonly probability: number;
  /** Days from now; negative means it already closed. */
  readonly closeInDays: number;
  readonly status: "open" | "won" | "lost";
}

export interface NationalProject {
  readonly id: string;
  readonly n: number;
  readonly name: string;
  readonly accountId: string;
  readonly opportunityId: string;
  readonly contract: number;
  readonly status: string;
  readonly health: "green" | "amber" | "red";
}

export interface NationalLead {
  readonly id: string;
  readonly n: number;
  readonly companyName: string;
  readonly accountId: string;
  /** Non-null exactly when the lead converted - see the seeding note. */
  readonly signalId: string | null;
  readonly score: number;
  readonly ownerSub: string | null;
  readonly status: string;
  readonly convertedOpportunityId: string | null;
}

export interface NationalSignal {
  readonly id: string;
  readonly accountId: string;
  readonly subject: string;
  readonly signalType: string;
  readonly score: number;
  readonly agedDays: number;
}

export interface NationalMilestone {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly sequence: number;
  readonly status: string;
  readonly dueInDays: number;
  readonly doneInDays: number | null;
}

export interface NationalInstalment {
  readonly id: string;
  readonly projectId: string;
  readonly milestoneId: string;
  readonly sequence: number;
  readonly status: string;
  readonly planned: number;
  readonly actual: number | null;
  readonly dueInDays: number;
  readonly settledInDays: number | null;
}

export interface NationalProposal {
  readonly id: string;
  readonly status: string;
  readonly actionType: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly confidence: number;
  readonly decidedBySub: string | null;
  readonly agedDays: number;
}

export interface NationalCohort {
  readonly accounts: readonly NationalAccount[];
  readonly opportunities: readonly NationalOpportunity[];
  readonly projects: readonly NationalProject[];
  readonly leads: readonly NationalLead[];
  readonly signals: readonly NationalSignal[];
  readonly milestones: readonly NationalMilestone[];
  readonly instalments: readonly NationalInstalment[];
  readonly proposals: readonly NationalProposal[];
}

/**
 * Build the cohort.
 *
 * `owners` are the demo's own rep subs - the cohort does not invent people. A
 * generated account owned by a name nobody recognises would put a stranger in
 * the owner column of every screen that lists these rows.
 */
export function buildNationalCohort(
  owners: readonly string[],
  /**
   * How far back a cohort deal may have closed, in days.
   *
   * NOT COSMETIC. The curated seed owns a SETTLED quarter whose scorecard is
   * asserted at 123% attainment against 77% accuracy - a pair chosen to show
   * why there are two figures. A cohort deal closing inside that quarter moves
   * both numbers and destroys the lesson. The caller passes days-into-the-
   * current-quarter, so every generated close lands in the live quarter no
   * matter when the demo is seeded (DEMO_NOW is the real clock).
   */
  maxClosedDaysBack: number,
): NationalCohort {
  const accounts: NationalAccount[] = [];
  const opportunities: NationalOpportunity[] = [];
  const projects: NationalProject[] = [];
  const leads: NationalLead[] = [];
  const signals: NationalSignal[] = [];
  const milestones: NationalMilestone[] = [];
  const instalments: NationalInstalment[] = [];
  const proposals: NationalProposal[] = [];

  let a = 0, o = 0, p = 0, l = 0, m = 0, inst = 0, pr = 0, sg = 0;

  for (const [region, provinces] of Object.entries(PROVINCES_BY_REGION)) {
    for (const province of provinces) {
      const r = rng("nat|" + province);
      const w = WEIGHT[province] ?? 0.2;

      // Two accounts everywhere, three or four where the weight justifies it.
      // Every province gets at least two so the map has no blank cells - a
      // blank province reads as "no business", which is a different statement
      // from "small business" and the one thing this cohort exists to avoid.
      const count = w > 0.7 ? 4 : w > 0.35 ? 3 : 2;

      for (let i = 0; i < count; i++) {
        a += 1;
        const id = `acc_nat_${a}`;
        const short = province.replace(/(省|市|自治区|特别行政区)$/, "")
          .replace("内蒙古自治", "内蒙古").replace("广西壮族", "广西")
          .replace("新疆维吾尔", "新疆").replace("宁夏回族", "宁夏");
        const name = `${short}${TRADES[Math.floor(r() * TRADES.length)]}${i + 1}`;
        const health = Math.round(38 + r() * 56);
        accounts.push({
          id, n: 100 + a, name,
          industry: INDUSTRIES[Math.floor(r() * INDUSTRIES.length)]!,
          region,
          province,
          segmentCode: w > 0.6 ? "ENTERPRISE" : "MIDMARKET",
          ownerSub: owners[a % owners.length]!,
          healthScore: health,
          // Deliberately never `prospect`: the curated set owns that case
          // (acc_demo_3 is the strategic prospect where nothing has happened),
          // and a hundred generated prospects would drown it.
          status: "active",
          tier: w > 0.85 && i === 0 ? "key" : "standard",
        });

        const deals = 1 + Math.floor(r() * 2);
        const oppIds: string[] = [];
        for (let d = 0; d < deals; d++) {
          o += 1;
          const roll = r();
          // Roughly a third closed, so 合同额 and 回款 have something behind
          // them - an all-open pipeline gives the funnel ribbon a zero tail.
          const status = roll < 0.22 ? "won" : roll < 0.33 ? "lost" : "open";
          const amount = Math.round((180_000 + r() * 2_600_000) * (0.4 + w)) ;
          const stage =
            status === "won" ? "closed_won"
            : status === "lost" ? "closed_lost"
            : (["discover", "qualify", "validate", "negotiate"] as const)[Math.floor(r() * 4)]!;
          const probability =
            status === "won" ? 100 : status === "lost" ? 0
            : ({ discover: 20, qualify: 30, validate: 50, negotiate: 80 } as Record<string, number>)[stage]!;
          oppIds.push(`opp_nat_${o}`);
          opportunities.push({
            id: `opp_nat_${o}`, n: 100 + o,
            name: `${short}${["数字化平台", "供应链系统", "数据中台", "智能运营", "客户中心"][o % 5]}`,
            accountId: id,
            ownerSub: owners[a % owners.length]!,
            stage,
            /* TERMINAL MEANS CLOSED, BOTH WAYS. A lost deal is as terminal as a
               won one and planCategoryChange refuses any other pairing - this
               said `won ? closed : by-stage`, which filed every lost deal under
               a live forecast category. The seed's own rule test caught it. */
            forecastCategory:
              status !== "open" ? "closed"
              : stage === "negotiate" ? "commit"
              : stage === "validate" ? "best_case" : "pipeline",
            amount,
            probability,
            /* STRICTLY INSIDE the live quarter, and CLAMPED rather than nudged.
               maxClosedDaysBack is whole days since the quarter began, but the
               clock carries a time of day, so closing exactly that many days
               back lands a few hours inside the PREVIOUS quarter. Two deals
               went there and moved the settled quarter's actual from 3.2M to
               5.29M - the pair of figures the scorecard exists to contrast.

               Subtracting a constant is not the fix: on the first days of a
               quarter there is no room for a deal to have closed at all, and
               any fixed margin still walks off the end. The ceiling is one day
               short of the quarter's own age, and zero - closing today - is a
               legitimate result of it. */
            closeInDays:
              status === "open"
                ? Math.round(12 + r() * 150)
                : -Math.max(0, Math.min(
                    Math.round(r() * (maxClosedDaysBack - 1)),
                    maxClosedDaysBack - 1,
                  )),
            status,
          });

          // A won deal becomes delivery - that is the funnel this screen draws.
          if (status === "won") {
            p += 1;
            const hr = r();
            const projectId = `prj_nat_${p}`;
            const live = hr < 0.62;
            projects.push({
              id: projectId, n: 100 + p,
              name: `${short}交付项目${p}`,
              accountId: id,
              opportunityId: `opp_nat_${o}`,
              contract: amount,
              status: live ? "delivering" : hr < 0.86 ? "delivered" : "closed",
              health: live ? "green" : hr < 0.86 ? "amber" : "red",
            });

            /* THE SCHEDULE, in two instalments against two gates.
               回款兑现 reads instalments, not contracts, so a cohort with none
               left the panel reading 0 while 合同额 read tens of millions -
               two figures about the same money that could not both be right.
               Money with no gate does not exist here (incr/0032 makes
               milestone_id NOT NULL), so each instalment gets its own. */
            // The two instalments must add to the contract EXACTLY. Rounding
            // both halves left a few yuan unbilled per project, which is a
            // schedule that does not add up to the thing it is billing.
            const half = Math.floor(amount / 2);
            const halves = [half, amount - half];
            for (let k = 0; k < 2; k++) {
              m += 1; inst += 1;
              const msId = `ms_nat_${m}`;
              // First instalment is behind us, second is ahead - a schedule
              // where everything is due on the same day is not a schedule.
              const dueInDays = k === 0 ? -Math.round(8 + r() * 70) : Math.round(10 + r() * 80);
              const roll = r();
              /* A FINISHED PROJECT HAS BEEN PAID FOR. Leaving a delivered
                 project's money outstanding would report a receivable against
                 work that is over, which is the one reading this panel must
                 never produce. */
              const settled = !live || (k === 0 && roll < 0.72);
              const late = !settled && dueInDays < 0;
              milestones.push({
                id: msId, projectId,
                name: `${short}节点${k + 1}`,
                sequence: k + 1,
                status: settled ? "done" : late ? "missed" : "pending",
                dueInDays,
                doneInDays: settled ? dueInDays + 1 : null,
              });
              instalments.push({
                id: `inst_nat_${inst}`,
                projectId, milestoneId: msId, sequence: k + 1,
                status: settled ? "settled" : late ? "overdue" : roll < 0.85 ? "invoiced" : "planned",
                planned: halves[k]!,
                // Short payment happens; a fixture where actual always equals
                // planned cannot show the gap the domain exists to track.
                actual: settled ? (roll < 0.12 ? Math.round(halves[k]! * 0.92) : halves[k]!) : null,
                dueInDays,
                settledInDays: settled ? dueInDays + 1 : null,
              });
            }
          }

          /* THE COPILOT HAS AN OPINION ABOUT SOME OF THESE. Roughly one deal in
             four, so 智能副驾 has a queue and a 30-day history to rate rather
             than the five curated rows, which are all in one province. The
             statuses spread across the window on purpose: a pending row is a
             QUEUE (any age), an accepted or rejected one is a DECISION inside
             the window, and expired rows are neither. */
          const pRoll = r();
          if (pRoll < 0.26) {
            pr += 1;
            const decided = pRoll < 0.16;
            const accepted = pRoll < 0.11;
            proposals.push({
              id: `act_nat_${pr}`,
              status: accepted ? "accepted" : decided ? "rejected" : "proposed",
              actionType: status === "open" ? "advance_stage" : "draft_outreach",
              subjectType: status === "open" ? "opportunity" : "account",
              subjectId: status === "open" ? `opp_nat_${o}` : id,
              confidence: Math.round(40 + r() * 55),
              decidedBySub: decided ? owners[0]! : null,
              /* Inside the 30-day window the panel rates AND inside the 7-day
                 proposal TTL. The demo owns exactly one proposal old enough for
                 the expiry sweep to retire (act_demo_6) because that is how the
                 rule is shown working; cohort rows crossing the TTL would bury
                 it in a crowd and the demonstration would be lost. */
              agedDays: 1 + Math.round(r() * 4),
            });
          }
        }

        /* 线索供给 gets its own rows, ATTACHED TO AN ACCOUNT on purpose.
           A lead reaches a province only through the account it was matched
           to, so leads with no account - the common real state, and what the
           curated fixture already shows - are invisible on this map. The
           cohort therefore seeds matched ones: without them the panel read
           five leads nationally while the map showed ninety-eight customers.

           The mix is the point, not the count: one unowned (线索分派 exists
           because leads arrive with nobody on them), some converted so
           转商机率 is a real ratio rather than 0% or 100%. */
        const leadCount = 1 + Math.floor(r() * 3);
        for (let k = 0; k < leadCount; k++) {
          l += 1;
          const roll = r();
          /* CONVERTED MEANS IT CONVERTED INTO SOMETHING. A lead marked
             converted whose signal and opportunity are both null is not a
             sparse row, it is an incoherent one - the seed's own invariant
             test says so - so a cohort lead converts only when the account has
             an opportunity to have converted into, and carries the signal it
             came from. Attribution keys are frozen after creation (ADR-003),
             which is exactly why they have to be right at creation. */
          const converted = roll < 0.34 && oppIds.length > 0;
          let signalId: string | null = null;
          if (converted) {
            sg += 1;
            signalId = `sig_nat_${sg}`;
            signals.push({
              id: signalId,
              accountId: id,
              subject: `${name}${["招标公示", "扩产计划", "系统升级"][sg % 3]}`,
              signalType: (["tender", "intent", "tech_change"] as const)[sg % 3]!,
              score: Math.round(45 + r() * 50),
              agedDays: Math.round(20 + r() * 90),
            });
          }
          leads.push({
            id: `lead_nat_${l}`, n: 100 + l,
            companyName: name,
            accountId: id,
            signalId,
            score: Math.round(30 + r() * 65),
            // Every fourth lead arrives unclaimed, which is the state 待认领
            // counts and the reason the figure is worth a cell at all.
            ownerSub: roll < 0.25 ? null : owners[a % owners.length]!,
            status: converted ? "converted" : roll < 0.5 ? "qualified" : roll < 0.78 ? "working" : "new",
            convertedOpportunityId: converted ? oppIds[sg % oppIds.length]! : null,
          });
        }
      }
    }
  }

  return {
    accounts, opportunities, projects,
    leads, signals, milestones, instalments, proposals,
  };
}

/** Every province the cohort touches - used by the screen's roll-up and tests. */
export const NATIONAL_PROVINCES: readonly string[] =
  Object.values(PROVINCES_BY_REGION).flat();

export { regionOfProvince };
