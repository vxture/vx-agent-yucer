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

export interface NationalCohort {
  readonly accounts: readonly NationalAccount[];
  readonly opportunities: readonly NationalOpportunity[];
  readonly projects: readonly NationalProject[];
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

  let a = 0, o = 0, p = 0;

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
            closeInDays:
              status === "open"
                ? Math.round(12 + r() * 150)
                : -Math.max(2, Math.round(2 + r() * Math.max(1, maxClosedDaysBack - 2))),
            status,
          });

          // A won deal becomes delivery - that is the funnel this screen draws.
          if (status === "won") {
            p += 1;
            const hr = r();
            projects.push({
              id: `prj_nat_${p}`, n: 100 + p,
              name: `${short}交付项目${p}`,
              accountId: id,
              opportunityId: `opp_nat_${o}`,
              contract: amount,
              status: hr < 0.62 ? "delivering" : hr < 0.86 ? "delivered" : "closed",
              health: hr < 0.62 ? "green" : hr < 0.86 ? "amber" : "red",
            });
          }
        }
      }
    }
  }

  return { accounts, opportunities, projects };
}

/** Every province the cohort touches - used by the screen's roll-up and tests. */
export const NATIONAL_PROVINCES: readonly string[] =
  Object.values(PROVINCES_BY_REGION).flat();

export { regionOfProvince };
