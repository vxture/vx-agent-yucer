import type { HealthReason } from "./health";

// 风险分型 (YC-021 L5, owner 2026-09-24): "五类风险分开呈现, 能据此判断该找谁".
//
// FIVE TYPES, EACH WITH A PERSON. The health score folds everything into one
// number; this unfolds it into the five questions a manager actually asks, and
// answers the second one - who do I talk to - with a name wherever the data
// has one:
//
//   relationship  the decision chain (reachability, missing roles, blockers,
//                 single thread)                          -> the account owner
//   advance       open deals sitting past the stall line  -> that deal's owner
//   delivery      project health, overdue milestones      -> that project's manager
//   collections   overdue instalments                     -> that project's manager
//   renewal       the renewal factor                      -> the account owner
//
// Everything is read from facts the page already derives - no new data. A type
// whose source could not be read is `unknown`, never `clear`.

export const RISK_TYPES = ["relationship", "advance", "delivery", "collections", "renewal"] as const;
export type RiskType = (typeof RISK_TYPES)[number];
export type RiskLevel = "risk" | "watch" | "clear" | "unknown";

export type RiskFinding =
  | { readonly code: "buyer_unreachable"; readonly deal: string }
  | { readonly code: "no_buyer"; readonly deal: string }
  | { readonly code: "roles_missing"; readonly deal: string; readonly count: number }
  | { readonly code: "blockers"; readonly deal: string; readonly count: number }
  | { readonly code: "single_thread"; readonly who: string }
  | { readonly code: "deal_stalled"; readonly deal: string; readonly days: number }
  | { readonly code: "project_red"; readonly project: string; readonly manual?: boolean }
  | { readonly code: "project_amber"; readonly project: string; readonly manual?: boolean }
  | { readonly code: "milestones_overdue"; readonly project: string; readonly count: number }
  | { readonly code: "revenue_overdue"; readonly project: string; readonly count: number }
  | { readonly code: "renewal"; readonly reason: HealthReason }
  | { readonly code: "contract_risk"; readonly contractNo: string; readonly level: "high" | "medium" };

export type RiskOwnerRole = "account_owner" | "deal_owner" | "project_manager";

export interface RiskTypeResult {
  readonly type: RiskType;
  readonly level: RiskLevel;
  readonly findings: readonly RiskFinding[];
  /** Who to go to. `name` null = the role is known, the person is not. */
  readonly who: { readonly role: RiskOwnerRole; readonly name: string | null };
}

export interface RiskInput {
  readonly accountOwner: string | null;
  /** Per open deal; null when the chains could not be read (tier or failure). */
  readonly chains:
    | readonly {
        readonly deal: string;
        readonly unreachable: boolean;
        readonly hasEconomicBuyer: boolean;
        readonly missing: number;
        readonly blockers: number;
      }[]
    | null;
  /** The one person every open deal runs through, when the single-thread rule fired. */
  readonly singleThread: string | null;
  readonly openDeals: readonly {
    readonly name: string;
    readonly owner: string | null;
    readonly daysInStage: number | null;
    /** This deal's own stall line (its business form's override resolved by the
     *  caller through stallLineFor, YC-065 R3). Absent = the workspace line. */
    readonly stallDays?: number | null;
  }[];
  /** The workspace's stall line, for deals that carry none of their own. */
  readonly stallDays: number;
  /** Null when the projects could not be read. */
  readonly projects:
    | readonly {
        readonly name: string;
        readonly manager: string | null;
        readonly health: string;
        /** True when the manager's own recorded health already says this -
         *  the verdict is a person's, not the rule's escalation. */
        readonly healthManual?: boolean;
        readonly overdueMilestones: number;
        readonly overdueRevenue: number;
      }[]
    | null;
  /** The health score's renewal contribution; null when health is unavailable. */
  readonly renewal: { readonly points: number; readonly reason: HealthReason } | null;
  /** The worst per-contract 续约风险评分 (delivery/lib/renewal-risk.ts), when
   *  any in-force contract scored medium or high. It reaches further ahead
   *  than the health factor, which only speaks inside the window. */
  readonly contractRisk?: { readonly contractNo: string; readonly level: "high" | "medium" } | null;
}

export function classifyRisks(input: RiskInput): RiskTypeResult[] {
  return [relationship(input), advance(input), delivery(input), collections(input), renewal(input)];
}

function relationship(i: RiskInput): RiskTypeResult {
  const who = { role: "account_owner" as const, name: i.accountOwner };
  if (i.chains === null) return { type: "relationship", level: "unknown", findings: [], who };
  const risk: RiskFinding[] = [];
  const watch: RiskFinding[] = [];
  for (const c of i.chains) {
    if (!c.hasEconomicBuyer) risk.push({ code: "no_buyer", deal: c.deal });
    else if (c.unreachable) risk.push({ code: "buyer_unreachable", deal: c.deal });
    if (c.missing > 0) watch.push({ code: "roles_missing", deal: c.deal, count: c.missing });
    if (c.blockers > 0) watch.push({ code: "blockers", deal: c.deal, count: c.blockers });
  }
  if (i.singleThread) risk.push({ code: "single_thread", who: i.singleThread });
  return { type: "relationship", level: risk.length > 0 ? "risk" : watch.length > 0 ? "watch" : "clear", findings: [...risk, ...watch], who };
}

function advance(i: RiskInput): RiskTypeResult {
  const stalled = i.openDeals
    .filter((d) => d.daysInStage !== null && d.daysInStage > (d.stallDays ?? i.stallDays))
    .sort((a, b) => (b.daysInStage ?? 0) - (a.daysInStage ?? 0));
  return {
    type: "advance",
    level: stalled.length > 0 ? "risk" : "clear",
    findings: stalled.map((d) => ({ code: "deal_stalled", deal: d.name, days: d.daysInStage! })),
    // The longest-stalled deal's owner; the account owner when nothing is stuck.
    who: stalled[0] ? { role: "deal_owner", name: stalled[0].owner } : { role: "account_owner", name: i.accountOwner },
  };
}

function delivery(i: RiskInput): RiskTypeResult {
  if (i.projects === null) return { type: "delivery", level: "unknown", findings: [], who: { role: "project_manager", name: null } };
  const findings: RiskFinding[] = [];
  let worst: (typeof i.projects)[number] | null = null;
  let level: RiskLevel = "clear";
  for (const p of i.projects) {
    const red = p.health === "red" || p.overdueMilestones > 0;
    const manual = p.healthManual === true;
    if (p.health === "red") findings.push({ code: "project_red", project: p.name, manual });
    else if (p.health === "amber") findings.push({ code: "project_amber", project: p.name, manual });
    if (p.overdueMilestones > 0) findings.push({ code: "milestones_overdue", project: p.name, count: p.overdueMilestones });
    if (red && level !== "risk") {
      level = "risk";
      worst = p;
    } else if (p.health === "amber" && level === "clear") {
      level = "watch";
      worst = p;
    }
  }
  return { type: "delivery", level, findings, who: { role: "project_manager", name: worst?.manager ?? null } };
}

function collections(i: RiskInput): RiskTypeResult {
  if (i.projects === null) return { type: "collections", level: "unknown", findings: [], who: { role: "project_manager", name: null } };
  const late = i.projects.filter((p) => p.overdueRevenue > 0).sort((a, b) => b.overdueRevenue - a.overdueRevenue);
  return {
    type: "collections",
    level: late.length > 0 ? "risk" : "clear",
    findings: late.map((p) => ({ code: "revenue_overdue", project: p.name, count: p.overdueRevenue })),
    who: { role: "project_manager", name: late[0]?.manager ?? null },
  };
}

function renewal(i: RiskInput): RiskTypeResult {
  const who = { role: "account_owner" as const, name: i.accountOwner };
  if (i.renewal === null) return { type: "renewal", level: "unknown", findings: [], who };
  const { points, reason } = i.renewal;
  const fromFactor: RiskLevel = points <= -10 ? "risk" : points < 0 ? "watch" : "clear";
  const fromContract: RiskLevel = i.contractRisk?.level === "high" ? "risk" : i.contractRisk ? "watch" : "clear";
  const rank: Record<RiskLevel, number> = { unknown: 0, clear: 1, watch: 2, risk: 3 };
  const findings: RiskFinding[] = [];
  if (points < 0) findings.push({ code: "renewal", reason });
  if (i.contractRisk) findings.push({ code: "contract_risk", ...i.contractRisk });
  return { type: "renewal", level: rank[fromContract] > rank[fromFactor] ? fromContract : fromFactor, findings, who };
}

// WHERE A FINDING CAME FROM (owner, 2026-09-24: 可以把来源加上, 规则判断 |
// 智能分析 | 人工填报, 作为开头tag标签). Every line in a lane says who is
// speaking. A blocker is a stance a rep entered on the chain; a project's
// colour is the manager's when their own recorded health already says it.
// Everything else here is computed by a rule.
export type FindingSource = "rule" | "model" | "manual";

export function findingSource(f: RiskFinding): FindingSource {
  if (f.code === "blockers") return "manual";
  if ((f.code === "project_red" || f.code === "project_amber") && f.manual) return "manual";
  return "rule";
}

// ONE PLACE FOR A JUDGEMENT (owner, 2026-09-24: 合并进风险分型). The rules
// engine's judgements about this account used to sit above the lanes as a
// separate note - and could contradict them ("停了 48 天" over 推进 正常,
// because one counts quiet days and the other days in stage). Now each one
// joins the lane it is about, and the lane's level is the worse of the two.
//
// Lane by rule id (judgement.ts): a stalled or silent account is 推进; who we
// reach, how often, through how many people, and the promises we owe are 关系.
// A judgement about one deal whose rule is not listed is 推进.
const LANE_BY_RULE: Record<string, RiskType> = {
  stalled: "advance",
  quiet: "advance",
  unreached: "relationship",
  cadence: "relationship",
  singlethread: "relationship",
  shared: "relationship",
  weowe: "relationship",
};

export function judgementLane(id: string, subjectType: string): RiskType {
  const rule = id.split(":")[0] ?? "";
  return LANE_BY_RULE[rule] ?? (subjectType === "opportunity" ? "advance" : "relationship");
}

export interface LaneJudgement {
  readonly id: string;
  readonly subjectType: string;
  readonly urgency: "today" | "week" | "watch";
}

const LEVEL_RANK: Record<RiskLevel, number> = { unknown: 0, clear: 1, watch: 2, risk: 3 };

export function mergeJudgements<J extends LaneJudgement>(
  risks: readonly RiskTypeResult[],
  judgements: readonly J[],
): (RiskTypeResult & { readonly judgements: readonly J[] })[] {
  const URGENCY: Record<LaneJudgement["urgency"], number> = { today: 0, week: 1, watch: 2 };
  return risks.map((r) => {
    const mine = judgements
      .filter((j) => judgementLane(j.id, j.subjectType) === r.type)
      .sort((a, b) => URGENCY[a.urgency] - URGENCY[b.urgency]);
    const worst = mine[0];
    const fromJudgement: RiskLevel = !worst ? "unknown" : worst.urgency === "watch" ? "watch" : "risk";
    const level = LEVEL_RANK[fromJudgement] > LEVEL_RANK[r.level] ? fromJudgement : r.level;
    // The single-thread judgement IS the single_thread finding, with its
    // evidence attached - say it once.
    const findings = mine.some((j) => j.id.startsWith("singlethread:"))
      ? r.findings.filter((f) => f.code !== "single_thread")
      : r.findings;
    return { ...r, level, findings, judgements: mine };
  });
}
