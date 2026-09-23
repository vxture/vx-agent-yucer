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

import {
  daysSinceLastContact,
  isOverdue,
  reliability,
  type CommitmentDirection,
  type CommitmentStatus,
} from "../../account/lib/commitment";
import {
  analyzeChain,
  analyzeChainRecency,
  type ContactNode,
  type DecisionRole,
  type RelationEdge,
  type Stance,
} from "../../account/lib/health";
import { chainForOpportunity, type ChainPerson } from "../../account/lib/buying-role";
import { annotateFreshness, type Freshness } from "../../account/lib/evidence-quality";
import type { CaptureWeek } from "../../account/lib/capture-metric";
import {
  DEFAULT_CONTACT_RECENCY_POLICY,
  type ContactRecencyPolicy,
} from "../../account/lib/contact-recency-policy";

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
  /**
   * The attribution, IN PARTS, for the caller to render.
   *
   * It used to be one pre-composed string - "62 天前 . im . usr_demo_rep" -
   * built right here, and the doc line above it claimed the caller assembled
   * it, which was never true. Composing it here meant the raw channel enum and
   * the raw subject id went straight to the screen with no layer left that
   * could label them: the product has a CHANNEL_LABEL map and the citation
   * could not reach it.
   *
   * The rule decides WHAT is cited. How it reads is the caller's problem.
   */
  daysAgo?: number;
  channel?: string;
  actorSub?: string;
  /** Filled by the PAGE from the member directory, never by the rule - the
   *  rule layer has no directory. Absent: the id is shown, marked as one. */
  actorName?: string;
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
  /**
   * L2 batch seven: how old the newest dated evidence under this claim is,
   * and whether that is past its kind's threshold. Null when the claim rests
   * only on structure or metrics, which carry no date. Attached as the LAST
   * step of deriveJudgements - the rules themselves do not know about it.
   */
  freshness?: Freshness | null;
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
const ANALYSES_STALLED: readonly AnalysisKind[] = [
  "risk",
  "competition",
  "policy",
];
const ANALYSES_UNREACHED: readonly AnalysisKind[] = ["chain", "risk"];
const ANALYSES_WE_OWE: readonly AnalysisKind[] = ["risk"];
const ANALYSES_QUIET: readonly AnalysisKind[] = ["competition", "risk"];
//   cadence   nothing happened, so there is no new evidence to weigh. What is
//             worth asking is who we should be talking to and who else is -
//             not "how risky is this deal", because there may be no deal.
const ANALYSES_CADENCE: readonly AnalysisKind[] = ["chain", "competition"];

/** Who counts as a KEY person for rule 8 - the roles whose answer moves a deal. */
const KEY_ROLES: ReadonlySet<DecisionRole> = new Set<DecisionRole>(["economic", "coach", "blocker"]);
const KEY_ROLE_LABEL: Partial<Record<DecisionRole, string>> = {
  economic: "经济决策人",
  coach: "内线",
  blocker: "阻碍者",
};

// --- inputs -----------------------------------------------------------------

export interface AccountInput {
  accountId: string;
  accountName: string;
  ownerSub: string | null;
  /** Open opportunities on this account, for amount and stage context. */
  openDeals: readonly {
    id: string;
    name: string;
    stage: string;
    amount: number | null;
    stageDays: number;
  }[];
  /**
   * Stated buying roles, keyed by deal - incr/0027, ADR-024 batch D.
   *
   * ABSENT IS THE ORDINARY CASE and means "this deal has not distinguished
   * itself from the customer default". Optional on the input for the same
   * reason: an assembler that has not been taught about them yet produces the
   * old behaviour rather than an empty chain.
   */
  buyingRoles?: readonly {
    readonly opportunityId: string;
    readonly personId: string;
    readonly buyingRole: DecisionRole;
    readonly influence: number | null;
    readonly stance: Stance | null;
  }[];
  lastContactAt: Date | null;
  /**
   * The account plan, when this customer is a strategic one - see ADR-013.
   *
   * Present only for tier `strategic`. Its cadence is what lets rule 5 fire on
   * an ABSENCE, which every other rule here is structurally unable to do.
   */
  plan?: {
    readonly period: string;
    readonly contactCadenceDays: number;
    readonly execCadenceDays: number;
    /** Last contact with anyone at decision-maker level, not just anyone. */
    readonly lastExecContactAt: Date | null;
  } | null;
  commitments: readonly {
    id: string;
    direction: CommitmentDirection;
    status: CommitmentStatus;
    statement: string;
    dueAt: Date;
  }[];
  /**
   * The people at this customer - incr/0027. NO ROLES on them: what somebody is
   * to a purchase is per deal, and the rules resolve it through
   * chainForOpportunity with `buyingRoles`. A type carrying a role here would
   * let a rule ask a person a question only a deal can answer, which is the
   * defect this batch removes.
   */
  contacts: readonly (ChainPerson & { readonly name?: string })[];
  relations: readonly RelationEdge[];
  /** contactId -> last recorded interaction they took part in. */
  contactActivity: readonly { contactId: string; lastContactAt: Date | null }[];
  /** Most recent notes, newest first, already scoped to this account. */
  notes: readonly {
    id: string;
    occurredAt: Date;
    channel: string;
    who: string;
    text: string;
  }[];
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
const days = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / DAY);

function note(n: AccountInput["notes"][number], now: Date): Citation {
  return {
    kind: "interaction",
    ref: n.id,
    when: n.occurredAt,
    daysAgo: days(n.occurredAt, now),
    channel: n.channel,
    actorSub: n.who,
    text: n.text,
  };
}

/**
 * Derive every rule judgement for one workspace.
 *
 * Pure and synchronous: the caller has already done the reading. Ordered by
 * urgency then by how long the situation has been true, so the oldest rotting
 * thing is first inside its tier.
 *
 * `policy` defaults to the shipped numbers - incr/0065 makes it a workspace
 * setting, and callers that already resolved one pass it in; callers that
 * have not (tests, mostly) get the same 21/30 this file hardcoded before.
 *
 * `stageLabel` resolves a stage CODE to its display name for rule 1's claim -
 * defaulting to the identity function rather than importing a dictionary here,
 * because this module stays pure and has no business knowing where stage
 * names come from (a workspace's own renamed catalog - incr/0057 - is not
 * this file's concern any more than a citation's channel label was). A caller
 * with a real catalog in hand passes a real resolver; one that has not (tests,
 * mostly) gets the bare code back, same as before this parameter existed.
 */
export function deriveJudgements(
  input: JudgementInput,
  policy: ContactRecencyPolicy = DEFAULT_CONTACT_RECENCY_POLICY,
  stageLabel: (code: string) => string = (code) => code,
): Judgement[] {
  const now = input.now ?? new Date();
  const { quietDays, staleDays } = policy;
  const out: Judgement[] = [];

  for (const a of input.accounts) {
    const rel = reliability(a.commitments, now);
    const theirOverdue = a.commitments.filter(
      (c) =>
        c.direction === "they_owe" &&
        isOverdue({ status: c.status, dueAt: c.dueAt }, now),
    );
    const ourOverdue = a.commitments.filter(
      (c) =>
        c.direction === "we_owe" &&
        isOverdue({ status: c.status, dueAt: c.dueAt }, now),
    );
    // THE SHARED DEFINITION, not a local restatement. This read
    // `a.lastContactAt === null ? null : days(a.lastContactAt, now)`, which is
    // daysSinceLastContact spelled out - and the field evidence panel spelled
    // it out a third time. Two of the three could have drifted on the
    // null-versus-zero question without anything failing.
    const quiet = daysSinceLastContact(a.lastContactAt, now);
    const biggest = [...a.openDeals].sort(
      (x, y) => (y.amount ?? 0) - (x.amount ?? 0),
    )[0];

    const money =
      biggest?.amount == null
        ? null
        : `${Math.round(biggest.amount / 10_000)} 万`;
    const baseTags: JudgementFact[] = [
      { label: "", value: a.accountName, tone: "neutral" },
    ];

    // 1. Stalled AND they have broken promises. The two together are the signal;
    //    either alone is ordinary.
    if (
      a.openDeals.length > 0 &&
      quiet !== null &&
      quiet > staleDays &&
      theirOverdue.length > 0
    ) {
      const worst = [...theirOverdue].sort(
        (x, y) => x.dueAt.getTime() - y.dueAt.getTime(),
      )[0];
      out.push({
        id: `stalled:${a.accountId}`,
        source: "rule",
        urgency: "today",
        claim: `${a.accountName}在${biggest ? stageLabel(biggest.stage) : "推进"}阶段停了 ${quiet} 天，对方答应的${theirOverdue.length > 1 ? `${theirOverdue.length} 件事都` : "事"}没兑现。`,
        subjectType: "account",
        subjectId: a.accountId,
        subjectName: a.accountName,
        tags: [
          ...baseTags,
          {
            label: "守约",
            value: `${rel.theirKeptRate === null ? "无记录" : `${Math.round(rel.theirKeptRate * 100)}%`}`,
            tone: "danger",
          },
          {
            label: "逾期",
            value: `${days(worst.dueAt, now)} 天`,
            tone: "danger",
          },
          ...(money
            ? [{ label: "", value: money, tone: "neutral" as const }]
            : []),
        ],
        citations: a.notes.slice(0, 3).map((n) => note(n, now)),
        facts: [
          { label: "最近接触", value: `${quiet} 天前`, tone: "danger" },
          {
            label: "对方守约率",
            value: `${rel.theyMissed} 件未兑现`,
            tone: "danger",
          },
          {
            label: "我方守约率",
            value: rel.weMissed === 0 ? "未失约" : `${rel.weMissed} 件未兑现`,
            tone: rel.weMissed === 0 ? "success" : "warning",
          },
          ...(biggest
            ? [
                {
                  label: "停留阶段",
                  value: `${stageLabel(biggest.stage)} ${biggest.stageDays} 天`,
                },
              ]
            : []),
        ],
        rule: `开放商机 且 最近接触 > ${staleDays} 天 且 对方逾期承诺 ≥ 1`,
        analyses: ANALYSES_STALLED,
      });
    }

    // 2. The decision maker has never been in a recorded room.
    //    Structure and evidence are checked SEPARATELY and both reported: two
    //    independent routes to one verdict is worth more than either alone, and
    //    if the org chart was filled in optimistically the evidence half still
    //    catches it.
    if (a.openDeals.length > 0 && a.contacts.length > 0) {
      // PER DEAL, and that is the defect ADR-024 opens with. Until incr/0027
      // the buying role was a property of the person, so every open deal at one
      // customer shared one chain - acc_demo_2 has three, in three different
      // departments, and this badge was lit on all three or none. A person who
      // signs for the warehouse project and merely uses the scheduling one now
      // counts as the economic buyer for exactly one of them.
      //
      // The card stays account-level. Splitting the feed into one card per deal
      // is a change to what a judgement IS, and this batch is about who is who.
      const perDeal = a.openDeals.map((d) => {
        const nodes = chainForOpportunity(
          a.contacts,
          (a.buyingRoles ?? []).filter((r) => r.opportunityId === d.id),
        );
        // Recency uses THIS deal's nodes too. warm / cold / unrecorded would be
        // identical either way - they are evidence about people - but the walk
        // inside it asks whether a COACH can reach the ECONOMIC BUYER, and both
        // of those are per-deal roles now.
        const recency = analyzeChainRecency(nodes, a.relations, a.contactActivity, { now });
        const economic = nodes.filter((c) => c.decisionRole === "economic" && c.status === "active");
        return {
          deal: d,
          chain: analyzeChain(nodes, a.relations),
          economic,
          unrecorded: economic.filter((c) => recency.unrecorded.some((u) => u.id === c.id)),
        };
      });
      // Fire on the deals that actually have the problem. An account where one
      // of three deals has never reached its buyer is a real finding; reporting
      // it as if all three did would be the old lie in the other direction.
      const affected = perDeal.filter((d) => d.economic.length > 0 && d.unrecorded.length > 0);
      const chain = affected[0]?.chain ?? perDeal[0]!.chain;
      const economic = affected.flatMap((d) => d.economic);
      const economicUnrecorded = affected.flatMap((d) => d.unrecorded);

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
              ? [
                  {
                    label: "我方逾期",
                    value: `${days(ourOverdue[0].dueAt, now)} 天`,
                    tone: "warning" as const,
                  },
                ]
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
            // WHICH deals, when the customer has more than one. Before
            // incr/0027 this sentence could not be written: there was one
            // chain for the whole customer and no way to say which purchase
            // had never reached its buyer.
            ...(a.openDeals.length > 1
              ? [
                  {
                    kind: "structure" as const,
                    text: `涉及 ${affected.length} / ${a.openDeals.length} 个在办商机：${affected
                      .map((d) => d.deal.name)
                      .join("、")}。`,
                  },
                ]
              : []),
            ...a.notes.slice(0, 1).map((n) => note(n, now)),
          ],
          facts: [
            { label: "接触次数", value: String(touches) },
            { label: "其中见决策人", value: "0", tone: "danger" },
            {
              label: "结构可达",
              value: chain.economicBuyerUnreachable ? "否" : "是",
              tone: chain.economicBuyerUnreachable ? "danger" : "success",
            },
            ...(ourOverdue.length > 0
              ? [
                  {
                    label: "我方欠的事",
                    value: `逾期 ${days(ourOverdue[0].dueAt, now)} 天`,
                    tone: "danger" as const,
                  },
                ]
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
    if (
      ourOverdue.length > 0 &&
      !out.some((j) => j.id === `unreached:${a.accountId}`)
    ) {
      const worst = [...ourOverdue].sort(
        (x, y) => x.dueAt.getTime() - y.dueAt.getTime(),
      )[0];
      const late = days(worst.dueAt, now);
      out.push({
        id: `weowe:${a.accountId}`,
        source: "rule",
        urgency: late > 7 ? "today" : "week",
        claim: `我们答应${a.accountName}的事逾期 ${late} 天了：${worst.statement}`,
        subjectType: "account",
        subjectId: a.accountId,
        subjectName: a.accountName,
        tags: [
          ...baseTags,
          { label: "我方逾期", value: `${late} 天`, tone: "danger" },
        ],
        citations: [
          {
            kind: "commitment",
            ref: worst.id,
            when: worst.dueAt,
            text: worst.statement,
          },
          ...a.notes.slice(0, 1).map((n) => note(n, now)),
        ],
        facts: [
          { label: "逾期", value: `${late} 天`, tone: "danger" },
          {
            label: "我方未兑现",
            value: String(rel.weMissed),
            tone: rel.weMissed > 1 ? "danger" : "warning",
          },
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
      quiet > quietDays &&
      theirOverdue.length === 0 &&
      ourOverdue.length === 0
    ) {
      out.push({
        id: `quiet:${a.accountId}`,
        source: "rule",
        urgency: quiet > staleDays ? "week" : "watch",
        claim: `${a.accountName}已经 ${quiet} 天没有跟进记录。`,
        subjectType: "account",
        subjectId: a.accountId,
        subjectName: a.accountName,
        tags: [
          ...baseTags,
          { label: "", value: `${quiet} 天未跟进`, tone: "warning" },
        ],
        citations: a.notes.slice(0, 2).map((n) => note(n, now)),
        facts: [
          { label: "最近接触", value: `${quiet} 天前`, tone: "warning" },
          { label: "未兑现承诺", value: "无", tone: "success" },
        ],
        rule: `开放商机 且 最近接触 > ${quietDays} 天 且 双方均无逾期承诺`,
        analyses: ANALYSES_QUIET,
      });
    }

    // 5. A STRATEGIC ACCOUNT WHERE NOTHING HAS HAPPENED.
    //
    // Every rule above is event-triggered and every one of them requires an
    // open opportunity: something stalled, someone broke a promise, a deal went
    // quiet. That is right for transactional selling - with no live deal, a
    // quiet customer is simply a quiet customer.
    //
    // It is wrong for an account someone locked in as strategic. There the
    // absence IS the event: the plan is failing, it fails silently, and no
    // event will ever fire to say so. This rule is the only one here that
    // does not require an open deal, and that is its entire reason to exist.
    //
    // See ADR-013 section 3.
    if (a.plan) {
      const sinceContact = quiet;
      const sinceExec =
        a.plan.lastExecContactAt === null
          ? null
          : days(a.plan.lastExecContactAt, now);
      const contactLate =
        sinceContact !== null && sinceContact > a.plan.contactCadenceDays;
      // A decision-maker contact that has NEVER happened is late by definition -
      // it is the worse case, not the missing one.
      const execLate = sinceExec === null || sinceExec > a.plan.execCadenceDays;

      if (contactLate || execLate) {
        // The executive gap is the more serious of the two: ordinary contact
        // can be delegated, and a plan that has not reached a decision-maker
        // all period is not being worked at any level that matters.
        const worst = execLate;
        out.push({
          id: `cadence:${a.accountId}`,
          source: "rule",
          urgency: worst ? "today" : "week",
          claim: worst
            ? sinceExec === null
              ? `${a.accountName}是战略客户，本期还没有过一次决策人接触。`
              : `${a.accountName}是战略客户，已经 ${sinceExec} 天没见到决策人，节奏是 ${a.plan.execCadenceDays} 天。`
            : `${a.accountName}是战略客户，已经 ${sinceContact} 天没有任何接触，节奏是 ${a.plan.contactCadenceDays} 天。`,
          subjectType: "account",
          subjectId: a.accountId,
          subjectName: a.accountName,
          tags: [
            ...baseTags,
            // "neutral" is the absence of a status, and that is exactly right
            // here: being strategic is a classification, not an alarm.
            { label: "", value: "战略客户", tone: "neutral" as const },
            { label: "本期", value: a.plan.period, tone: "neutral" as const },
          ],
          // No citation of a note, deliberately: there is nothing to quote.
          // The evidence for this judgement is the SILENCE, and the facts
          // below are how it is measured.
          citations: [],
          facts: [
            {
              label: "距上次接触",
              value: sinceContact === null ? "无记录" : `${sinceContact} 天`,
              tone: contactLate ? "danger" : "neutral",
            },
            {
              label: "距决策人接触",
              value: sinceExec === null ? "无记录" : `${sinceExec} 天`,
              tone: execLate ? "danger" : "success",
            },
            { label: "接触节奏", value: `${a.plan.contactCadenceDays} 天` },
            { label: "决策人节奏", value: `${a.plan.execCadenceDays} 天` },
          ],
          rule: "战略客户 且 (距上次接触 > 接触节奏 或 距决策人接触 > 决策人节奏) · 不要求存在开放商机",
          analyses: ANALYSES_CADENCE,
        });
      }
    }
    // 7. SINGLE-THREADED (YC-021 L2 单线程风险预警). Every live deal at this
    //    customer runs through one person. Nothing is wrong YET - which is
    //    exactly why no event-triggered rule above can see it: the day that
    //    person leaves or goes quiet, every deal goes with them at once.
    //
    //    "Active" is evidence, not the roster: an in-post contact nobody has
    //    spoken to inside the staleness window is not a second thread. A
    //    roster holding only one in-post person is the same finding, stated
    //    from the other side.
    if (a.openDeals.length > 0 && a.contacts.length > 0) {
      const inPost = a.contacts.filter((c) => c.status === "active");
      const inPostIds = new Set(inPost.map((c) => c.id));
      const engaged = a.contactActivity.filter(
        (x) =>
          inPostIds.has(x.contactId) &&
          x.lastContactAt !== null &&
          days(x.lastContactAt, now) <= staleDays,
      );
      const onlyOnRoster = inPost.length === 1;
      const thread = onlyOnRoster ? inPost[0]!.id : engaged.length === 1 ? engaged[0]!.contactId : null;
      if (thread !== null) {
        const who = a.contacts.find((c) => c.id === thread)?.name ?? "同一个人";
        const seen = a.contactActivity.find((x) => x.contactId === thread)?.lastContactAt ?? null;
        out.push({
          id: `singlethread:${a.accountId}`,
          source: "rule",
          urgency: "week",
          claim: onlyOnRoster
            ? `${a.accountName}的档案里只有${who}一个在职联系人，${a.openDeals.length} 个在办商机都压在这一条线上。`
            : `${a.accountName}近 ${staleDays} 天只和${who}一个人有来往，${a.openDeals.length} 个在办商机都压在这一条线上。`,
          subjectType: "account",
          subjectId: a.accountId,
          subjectName: a.accountName,
          tags: [...baseTags, { label: "", value: "单线联系", tone: "warning" }],
          citations: [
            {
              kind: "structure",
              text: `在职联系人 ${inPost.length} 人，近 ${staleDays} 天有接触记录的 ${engaged.length} 人。`,
            },
            ...a.notes.slice(0, 2).map((n) => note(n, now)),
          ],
          // facts[0] IS the person, by contract: 风险分型 (risk-types.ts via
          // the customer page) names them from here rather than re-running
          // this rule under a policy it would have to guess.
          facts: [
            { label: "唯一联系人", value: who, tone: "warning" },
            { label: "在职联系人", value: String(inPost.length) },
            {
              label: "最近接触",
              value: seen === null ? "无记录" : `${days(seen, now)} 天前`,
            },
            { label: "在办商机", value: String(a.openDeals.length) },
          ],
          rule: `开放商机 且 (在职联系人 = 1 或 近 ${staleDays} 天有接触的在职联系人 = 1)`,
          analyses: ANALYSES_UNREACHED,
        });
      }
    }

    // 8. ONE PERSON, TWO DEALS (YC-021 L3 多单相互影响). A key person - the
    //    one who signs, the one who opens doors, the one who blocks - on two
    //    open deals at once ties them together: a "no" on one is heard on the
    //    other, and the same budget holder is being asked twice. Read from the
    //    stated per-deal roles (incr/0027) only; a person with no stated role
    //    on a deal is not claimed to matter to it.
    if (a.openDeals.length > 1 && (a.buyingRoles ?? []).length > 0) {
      const openIds = new Set(a.openDeals.map((d) => d.id));
      const byPerson = new Map<string, { opportunityId: string; buyingRole: DecisionRole }[]>();
      for (const r of a.buyingRoles ?? []) {
        if (!openIds.has(r.opportunityId) || !KEY_ROLES.has(r.buyingRole)) continue;
        const list = byPerson.get(r.personId) ?? [];
        list.push({ opportunityId: r.opportunityId, buyingRole: r.buyingRole });
        byPerson.set(r.personId, list);
      }
      const shared = [...byPerson.entries()].filter(([, links]) => links.length > 1);
      if (shared.length > 0) {
        const dealName = (id: string) => a.openDeals.find((d) => d.id === id)?.name ?? id;
        const personName = (id: string) => a.contacts.find((c) => c.id === id)?.name ?? "未命名联系人";
        const [firstId, firstLinks] = shared[0]!;
        out.push({
          id: `shared:${a.accountId}`,
          source: "rule",
          urgency: "watch",
          claim:
            shared.length === 1
              ? `${personName(firstId)}同时是 ${firstLinks.length} 个在办商机的关键人，这几单的推进会互相牵动。`
              : `${a.accountName}有 ${shared.length} 位关键人同时出现在多个在办商机上，这些单子的推进会互相牵动。`,
          subjectType: "account",
          subjectId: a.accountId,
          subjectName: a.accountName,
          tags: [...baseTags, { label: "共享关键人", value: String(shared.length), tone: "neutral" }],
          // One line per shared person, naming every deal and the role on it -
          // the whole finding is WHICH deals, so it is spelled out, not counted.
          citations: shared.map(([personId, links]) => ({
            kind: "structure" as const,
            text: `${personName(personId)}：${links
              .map((l) => `「${dealName(l.opportunityId)}」${KEY_ROLE_LABEL[l.buyingRole] ?? l.buyingRole}`)
              .join("；")}`,
          })),
          facts: shared.slice(0, 3).map(([personId, links]) => ({
            label: personName(personId),
            value: `${links.length} 单`,
          })),
          rule: "同一联系人 在 ≥ 2 个在办商机上 被标为 经济决策人 / 内线 / 阻碍者",
          analyses: ANALYSES_UNREACHED,
        });
      }
    }
  }

  // 6. The one team-level judgement: is anybody recording anything.
  if (input.captureWeeks && input.captureWeeks.length > 0) {
    const done = input.captureWeeks.filter((w) => w.complete);
    const latest = done[done.length - 1];
    if (latest && latest.coverage !== null) {
      const pct = Math.round(latest.coverage * 100);
      // Against its own past, which is the only comparison a coverage number
      // supports - there is no external benchmark for "how much this team
      // writes down".
      const before = done[done.length - 2];
      const prev =
        before && before.coverage !== null
          ? Math.round(before.coverage * 100)
          : null;
      const delta = prev === null ? 0 : pct - prev;
      const worst = done.every(
        (w) => (w.coverage ?? 1) >= (latest.coverage ?? 0),
      );
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
          {
            label: "覆盖率",
            value: `${pct}%`,
            tone: pct < 50 ? "warning" : "success",
          },
        ],
        citations: [],
        facts: [
          {
            label: "覆盖率",
            value: `${pct}%`,
            tone: pct < 50 ? ("warning" as const) : ("success" as const),
          },
          ...(prev !== null
            ? [
                {
                  label: "较上周",
                  value: `${delta >= 0 ? "+" : ""}${delta} 点`,
                  tone:
                    delta >= 0 ? ("success" as const) : ("warning" as const),
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
  return out
    .map((j) => ({ ...j, freshness: annotateFreshness(j.citations, now) }))
    .sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}

/** Counts per tier, for the filter's badges. */
export function countByUrgency(
  js: readonly Judgement[],
): Record<Urgency, number> {
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
export function resolveScope(
  requested: Scope | undefined,
  ownedCount: number,
): Scope {
  if (requested) return requested;
  return ownedCount > 0 ? "mine" : "all";
}
