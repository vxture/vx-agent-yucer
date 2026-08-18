// The judgement layer: what the recorded evidence adds up to.
//
// This is the thing the product is for. Everything under domains/ so far
// RECORDS - accounts, opportunities, interactions, commitments. This module
// reads those records and produces statements nobody typed in: "this deal has
// been in negotiation 48 days and neither thing they promised has happened."
//
// TWO KINDS OF JUDGEMENT, AND THE DIFFERENCE IS NOT COSMETIC.
//
//   rule  - computed here, deterministically, from rows. A reader can recompute
//           it. It carries its own trigger condition so they can check the
//           arithmetic rather than trust it. Costs nothing, so it runs on every
//           load.
//   model - produced by Atlas from the same evidence. A reader CANNOT recompute
//           it; the only check available is whether the quotes it cites really
//           say what it claims. It costs money, so it is never produced
//           automatically - only when someone asks for it.
//
// Marking them apart is the whole point. "Overdue by 41 days" and "the way in
// is the interface worry, not the price" are both true-shaped sentences and
// deserve completely different scepticism. A product that renders them
// identically teaches people to trust both or neither.
//
// EVERY RULE HERE COMPOSES AN EXISTING ONE. isOverdue, reliability,
// analyzeChainRecency, assessCapture all already exist and are already tested.
// Re-deriving "overdue" here would give this repo two definitions of it, and
// they would drift - which is exactly the defect class the self-review found
// four times over.

import { isOverdue, reliability, type CommitmentDirection, type CommitmentStatus } from "../../account/lib/commitment";
import { analyzeChain, analyzeChainRecency, type ContactNode, type RelationEdge } from "../../account/lib/health";
import type { CaptureWeek } from "../../account/lib/capture-metric";

/** How soon this needs a person. The three tiers the home screen filters on. */
export const URGENCIES = ["today", "week", "watch"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const JUDGEMENT_SOURCES = ["rule", "model"] as const;
export type JudgementSource = (typeof JUDGEMENT_SOURCES)[number];

/** What a claim rests on. Rendered verbatim - never a summary of a summary. */
export interface Citation {
  kind: "interaction" | "commitment" | "structure" | "metric";
  /** Present for rows; absent for structural or computed observations. */
  ref?: string;
  when?: Date;
  /** "62 days ago . WeChat . Wang Lei" - assembled by the caller, not here. */
  who?: string;
  text: string;
}

export interface JudgementFact {
  label: string;
  value: string;
  tone?: "danger" | "warning" | "success" | "neutral";
}

export interface Judgement {
  id: string;
  source: JudgementSource;
  urgency: Urgency;
  /** One sentence. The new information, not a restatement of a row. */
  claim: string;
  subjectType: "account" | "opportunity" | "team";
  subjectId: string;
  subjectName: string;
  /** Short chips beside the claim. */
  tags: readonly JudgementFact[];
  citations: readonly Citation[];
  facts: readonly JudgementFact[];
  /**
   * The trigger condition, in words, for a RULE judgement.
   *
   * Present on rules and absent on model output, and that asymmetry is the
   * design: a rule that will not state its own condition cannot be checked,
   * and an uncheckable rule is indistinguishable from an opinion.
   */
  rule?: string;
  /** Which analyses make sense here. A team metric gets no competitor scan. */
  analyses: readonly AnalysisKind[];
  /**
   * An ordered series, when the judgement is about a TREND rather than a state.
   *
   * Separate from `facts` because they are read differently: facts are parallel
   * quantities you compare against each other, a series is one quantity you
   * compare against its own past. The team capture judgement used to put six
   * weeks into `facts`, so the row rendered a time series in the slot meant for
   * side-by-side metrics and neither reading worked.
   */
  series?: readonly { readonly label: string; readonly percent: number }[];
}

/** The on-demand model analyses. Each costs an Atlas call, so each is a click. */
export const ANALYSES = ["risk", "competition", "policy", "chain"] as const;
export type AnalysisKind = (typeof ANALYSES)[number];

/** Analyses that only make sense about a customer or a deal. */
// Which second opinions are worth ASKING FOR depends on what was concluded.
//
// The same three buttons on every row made them furniture: a person learns in
// two screens that the set never changes and stops reading it. Each is a real
// request that costs a model call, so the set has to be the one that could
// actually change this decision.
//
//   stalled   it stopped moving AND they broke promises - the live questions
//             are who else is in the room and whether the risk is ours.
//   unreached the economic buyer has never been met, so the only useful
//             analysis is of the decision structure itself.
//   weowe     WE are the ones who missed. Competition and policy do not
//             explain our own broken promise, and offering them would invite
//             blaming the market for it.
//   quiet     silence with no broken promises - a competitor moving is the
//             likeliest explanation worth checking.
const ANALYSES_STALLED: readonly AnalysisKind[] = ["risk", "competition", "policy"];
const ANALYSES_UNREACHED: readonly AnalysisKind[] = ["chain", "risk"];
const ANALYSES_WE_OWE: readonly AnalysisKind[] = ["risk"];
const ANALYSES_QUIET: readonly AnalysisKind[] = ["competition", "risk"];

// --- inputs -----------------------------------------------------------------

export interface AccountInput {
  accountId: string;
  accountName: string;
  ownerSub: string | null;
  /** Open opportunities on this account, for amount and stage context. */
  openDeals: readonly { id: string; name: string; stage: string; amount: number | null; stageDays: number }[];
  lastContactAt: Date | null;
  commitments: readonly {
    id: string;
    direction: CommitmentDirection;
    status: CommitmentStatus;
    statement: string;
    dueAt: Date;
  }[];
  contacts: readonly ContactNode[];
  relations: readonly RelationEdge[];
  /** contactId -> last recorded interaction they took part in. */
  contactActivity: readonly { contactId: string; lastContactAt: Date | null }[];
  /** Most recent notes, newest first, already scoped to this account. */
  notes: readonly { id: string; occurredAt: Date; channel: string; who: string; text: string }[];
}

export interface JudgementInput {
  accounts: readonly AccountInput[];
  /**
   * The capture weeks, for the one team-level judgement.
   *
   * The VERDICT is not recomputed here - assessCapture already owns that, and
   * a second caller of it would eventually disagree with the adoption page
   * about the same workspace. This judgement only reports the latest complete
   * week, which is a reading rather than a verdict.
   */
  captureWeeks?: readonly CaptureWeek[];
  now?: Date;
}

const DAY = 86_400_000;
const days = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);

/** Quiet long enough to matter. Below this a gap is just a normal week. */
const QUIET_DAYS = 21;
/** Quiet long enough to be the story rather than a detail. */
const STALE_DAYS = 30;

function note(n: AccountInput["notes"][number], now: Date): Citation {
  return {
    kind: "interaction",
    ref: n.id,
    when: n.occurredAt,
    who: `${days(n.occurredAt, now)} 天前 · ${n.channel} · ${n.who}`,
    text: n.text,
  };
}

/**
 * Derive every rule judgement for one workspace.
 *
 * Pure and synchronous: the caller has already done the reading. Ordered by
 * urgency then by how long the situation has been true, so the oldest rotting
 * thing is first inside its tier.
 */
export function deriveJudgements(input: JudgementInput): Judgement[] {
  const now = input.now ?? new Date();
  const out: Judgement[] = [];

  for (const a of input.accounts) {
    const rel = reliability(a.commitments, now);
    const theirOverdue = a.commitments.filter(
      (c) => c.direction === "they_owe" && isOverdue({ status: c.status, dueAt: c.dueAt }, now),
    );
    const ourOverdue = a.commitments.filter(
      (c) => c.direction === "we_owe" && isOverdue({ status: c.status, dueAt: c.dueAt }, now),
    );
    const quiet = a.lastContactAt === null ? null : days(a.lastContactAt, now);
    const biggest = [...a.openDeals].sort((x, y) => (y.amount ?? 0) - (x.amount ?? 0))[0];

    const money = biggest?.amount == null ? null : `${Math.round(biggest.amount / 10_000)} 万`;
    const baseTags: JudgementFact[] = [{ label: "", value: a.accountName, tone: "neutral" }];

    // 1. Stalled AND they have broken promises. The two together are the signal;
    //    either alone is ordinary.
    if (a.openDeals.length > 0 && quiet !== null && quiet > STALE_DAYS && theirOverdue.length > 0) {
      const worst = [...theirOverdue].sort((x, y) => x.dueAt.getTime() - y.dueAt.getTime())[0];
      out.push({
        id: `stalled:${a.accountId}`,
        source: "rule",
        urgency: "today",
        claim: `${a.accountName}在${biggest ? biggest.stage : "推进"}阶段停了 ${quiet} 天，对方答应的${theirOverdue.length > 1 ? `${theirOverdue.length} 件事都` : "事"}没兑现。`,
        subjectType: "account",
        subjectId: a.accountId,
        subjectName: a.accountName,
        tags: [
          ...baseTags,
          { label: "守约", value: `${rel.theirKeptRate === null ? "无记录" : `${Math.round(rel.theirKeptRate * 100)}%`}`, tone: "danger" },
          { label: "逾期", value: `${days(worst.dueAt, now)} 天`, tone: "danger" },
          ...(money ? [{ label: "", value: money, tone: "neutral" as const }] : []),
        ],
        citations: a.notes.slice(0, 3).map((n) => note(n, now)),
        facts: [
          { label: "最近接触", value: `${quiet} 天前`, tone: "danger" },
          { label: "对方守约率", value: `${rel.theyMissed} 件未兑现`, tone: "danger" },
          { label: "我方守约率", value: rel.weMissed === 0 ? "未失约" : `${rel.weMissed} 件未兑现`, tone: rel.weMissed === 0 ? "success" : "warning" },
          ...(biggest ? [{ label: "停留阶段", value: `${biggest.stage} ${biggest.stageDays} 天` }] : []),
        ],
        rule: "开放商机 且 最近接触 > 30 天 且 对方逾期承诺 >= 1",
        analyses: ANALYSES_STALLED,
      });
    }

    // 2. The decision maker has never been in a recorded room.
    //    Structure and evidence are checked SEPARATELY and both reported: two
    //    independent routes to one verdict is worth more than either alone, and
    //    if the org chart was filled in optimistically the evidence half still
    //    catches it.
    if (a.openDeals.length > 0 && a.contacts.length > 0) {
      const chain = analyzeChain(a.contacts, a.relations);
      const recency = analyzeChainRecency(a.contacts, a.relations, a.contactActivity, { now });
      const economic = a.contacts.filter((c) => c.decisionRole === "economic" && c.status === "active");
      const economicUnrecorded = economic.filter((c) =>
        recency.unrecorded.some((u) => u.id === c.id),
      );

      if (economic.length > 0 && economicUnrecorded.length > 0) {
        const touches = a.notes.length;
        out.push({
          id: `unreached:${a.accountId}`,
          source: "rule",
          urgency: "today",
          claim: `${a.accountName}的 ${touches} 次接触里，决策人一次都没进过会议室。`,
          subjectType: "account",
          subjectId: a.accountId,
          subjectName: a.accountName,
          tags: [
            ...baseTags,
            { label: "", value: "决策人零接触", tone: "danger" },
            ...(ourOverdue.length > 0
              ? [{ label: "我方逾期", value: `${days(ourOverdue[0].dueAt, now)} 天`, tone: "warning" as const }]
              : []),
          ],
          citations: [
            {
              kind: "structure",
              text: chain.economicBuyerUnreachable
                ? "组织图上，教练与决策人之间没有已录入的关系边——结构上这条路就走不通。"
                : "组织图上存在一条通向决策人的路径，但那条路上的人没有出现在任何一次已记录的接触里。",
            },
            {
              kind: "structure",
              text: `${touches} 次记录在案的接触，决策人出现 0 次。`,
            },
            ...a.notes.slice(0, 1).map((n) => note(n, now)),
          ],
          facts: [
            { label: "接触次数", value: String(touches) },
            { label: "其中见决策人", value: "0", tone: "danger" },
            { label: "结构可达", value: chain.economicBuyerUnreachable ? "否" : "是", tone: chain.economicBuyerUnreachable ? "danger" : "success" },
            ...(ourOverdue.length > 0
              ? [{ label: "我方欠的事", value: `逾期 ${days(ourOverdue[0].dueAt, now)} 天`, tone: "danger" as const }]
              : []),
          ],
          rule: "存在决策人 且 该决策人从未出现在任何交互参与人记录中",
          analyses: ANALYSES_UNREACHED,
        });
      }
    }

    // 3. We are the ones who broke a promise. Reported separately from theirs,
    //    and never folded into a "relationship health" number: it is the one
    //    kind of problem this team can fix without anyone else's cooperation.
    if (ourOverdue.length > 0 && !out.some((j) => j.id === `unreached:${a.accountId}`)) {
      const worst = [...ourOverdue].sort((x, y) => x.dueAt.getTime() - y.dueAt.getTime())[0];
      const late = days(worst.dueAt, now);
      out.push({
        id: `weowe:${a.accountId}`,
        source: "rule",
        urgency: late > 7 ? "today" : "week",
        claim: `我们答应${a.accountName}的事逾期 ${late} 天了：${worst.statement}`,
        subjectType: "account",
        subjectId: a.accountId,
        subjectName: a.accountName,
        tags: [...baseTags, { label: "我方逾期", value: `${late} 天`, tone: "danger" }],
        citations: [
          { kind: "commitment", ref: worst.id, when: worst.dueAt, text: worst.statement },
          ...a.notes.slice(0, 1).map((n) => note(n, now)),
        ],
        facts: [
          { label: "逾期", value: `${late} 天`, tone: "danger" },
          { label: "我方未兑现", value: String(rel.weMissed), tone: rel.weMissed > 1 ? "danger" : "warning" },
        ],
        rule: "我方承诺 且 状态为 open 且 已过到期日",
        analyses: ANALYSES_WE_OWE,
      });
    }

    // 4. Simply gone quiet - no broken promise, just silence. A weaker signal,
    //    so a weaker tier.
    if (
      a.openDeals.length > 0 &&
      quiet !== null &&
      quiet > QUIET_DAYS &&
      theirOverdue.length === 0 &&
      ourOverdue.length === 0
    ) {
      out.push({
        id: `quiet:${a.accountId}`,
        source: "rule",
        urgency: quiet > STALE_DAYS ? "week" : "watch",
        claim: `${a.accountName}已经 ${quiet} 天没有跟进记录。`,
        subjectType: "account",
        subjectId: a.accountId,
        subjectName: a.accountName,
        tags: [...baseTags, { label: "", value: `${quiet} 天未跟进`, tone: "warning" }],
        citations: a.notes.slice(0, 2).map((n) => note(n, now)),
        facts: [
          { label: "最近接触", value: `${quiet} 天前`, tone: "warning" },
          { label: "未兑现承诺", value: "无", tone: "success" },
        ],
        rule: "开放商机 且 最近接触 > 21 天 且 双方均无逾期承诺",
        analyses: ANALYSES_QUIET,
      });
    }
  }

  // 5. The one team-level judgement: is anybody recording anything.
  if (input.captureWeeks && input.captureWeeks.length > 0) {
    const done = input.captureWeeks.filter((w) => w.complete);
    const latest = done[done.length - 1];
    if (latest && latest.coverage !== null) {
      const pct = Math.round(latest.coverage * 100);
      // Against its own past, which is the only comparison a coverage number
      // supports - there is no external benchmark for "how much this team
      // writes down".
      const before = done[done.length - 2];
      const prev = before && before.coverage !== null ? Math.round(before.coverage * 100) : null;
      const delta = prev === null ? 0 : pct - prev;
      const worst = done.every((w) => (w.coverage ?? 1) >= (latest.coverage ?? 0));
      out.push({
        id: "capture:team",
        source: "rule",
        urgency: "watch",
        claim: worst
          ? `上一个完整周只有 ${latest.covered} 条商机被记了跟进，是六周里最低的一周。`
          : `上一个完整周的跟进覆盖率是 ${pct}%。`,
        subjectType: "team",
        subjectId: "team",
        subjectName: "团队",
        tags: [
          { label: "", value: "团队", tone: "neutral" },
          { label: "覆盖率", value: `${pct}%`, tone: pct < 50 ? "warning" : "success" },
        ],
        citations: [],
        facts: [
          { label: "覆盖率", value: `${pct}%`, tone: pct < 50 ? ("warning" as const) : ("success" as const) },
          ...(prev !== null
            ? [
                {
                  label: "较上周",
                  value: `${delta >= 0 ? "+" : ""}${delta} 点`,
                  tone: delta >= 0 ? ("success" as const) : ("warning" as const),
                },
              ]
            : []),
          { label: "统计周数", value: String(done.length) },
        ],
        // The weeks themselves, as a series rather than as parallel facts.
        series: done
          .filter((w) => w.coverage !== null)
          .map((w) => ({
            label: w.weekStart.toISOString().slice(5, 10),
            percent: Math.round((w.coverage ?? 0) * 100),
          })),
        rule: "覆盖率 = 当周有跟进的开放商机 / 当周开放商机 · 进行中的一周不计入",
        // Deliberately none. A competitor scan on a team adoption metric would
        // be a button that exists for symmetry, and this product does not put
        // buttons where there is nothing behind them.
        analyses: [],
      });
    }
  }

  const rank: Record<Urgency, number> = { today: 0, week: 1, watch: 2 };
  return out.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}

/** Counts per tier, for the filter's badges. */
export function countByUrgency(js: readonly Judgement[]): Record<Urgency, number> {
  const c: Record<Urgency, number> = { today: 0, week: 0, watch: 0 };
  for (const j of js) c[j.urgency] += 1;
  return c;
}

/** Which accounts a feed is about. */
export type Scope = "mine" | "all";

/**
 * Choosing the scope when the reader has not.
 *
 * Extracted from the service because it is a POLICY, not plumbing: it decides
 * what the flagship screen shows on first load, and a policy that only exists
 * inline is one no test can hold still.
 *
 * The rule: an explicit request always wins, and otherwise ownership decides.
 * A member who owns no accounts - a sales_leader, by design of the role
 * catalog - can learn nothing from "mine", so defaulting them into it renders
 * an empty screen that is indistinguishable from "nothing is wrong".
 */
export function resolveScope(requested: Scope | undefined, ownedCount: number): Scope {
  if (requested) return requested;
  return ownedCount > 0 ? "mine" : "all";
}
