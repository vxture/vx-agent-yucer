import type { CallProfile } from "../../../agent/atlas/profiles";
import type { FeatureKey } from "../../../entitlement/capability";

// What the agent can do, as a stable set of keys - see ADR-015.
//
// ONE AGENT, MANY CAPABILITIES. Not seven agents: Atlas's applicationId is
// already the agent instance and the metering axis, and ADR-007 brought in
// karda precisely so knowledge is SHARED rather than partitioned per stage.
//
// What genuinely differs between scenarios is the expertise, the evidence worth
// retrieving, the tools, and (through the task) which model serves it. All four
// hang off a capability key. None of them needs a separate identity.
//
// The key is frozen once written. An audit has to answer "which capability
// proposed this AT THE TIME", and a rewritable key would make "how accurate is
// this capability" permanently unanswerable - which is most of why it exists.

export const CAPABILITIES = [
  "deal.stall_risk",
  "deal.competition",
  "account.chain_map",
  "account.cadence",
  "signal.triage",
  "pricing.discount_approval",
  "delivery.payment_risk",
  "campaign.return",
  "strategy.segment_coverage",
  "strategy.territory_attainment",
  // L4 batch six (owner, 2026-09-22): 增购机会 - its own group, so growing the
  // installed base never reads as pushing a deal already in flight.
  "account.upsell",
  // L2 batch 7b: 说法核对 - two follow-ups disagreeing on the same fact.
  "account.consistency",
  // Deal batch 4b (YC-066 §04 证据抽取): reads each new follow-up on a deal
  // and proposes what it says about the buying evidence slots.
  "deal.evidence",
  // Deal batch 5c (YC-066 §04 推进计划生成): 3-6 dated steps toward the stage's
  // unmet exit criteria; each accepted step becomes a commitment.
  "deal.plan",
  // Deal batch 10b (YC-066 S4 价格参谋): a discount strategy and what to ask
  // in exchange, when a line waits for a signature. A finding, not a proposal.
  "deal.price",
  // Deal batch 9e (YC-066 预测会简报): the forecast meeting's narrative over
  // 预测检视台's own numbers. A finding, not a proposal.
  "forecast.brief",
  // Deal batch 11a (YC-066 S6 会前包): agenda, talk tracks, objections and
  // questions over the rule-built pack. A finding, not a proposal.
  "deal.meeting",
  // Deal batch 12b (YC-066 S7 复盘底稿): a narrative over the rule's four
  // sections and a suggested reason code - never pre-selected.
  "deal.review",
  // Deal batch 8b (YC-066 S3/S5): 局势简报, 风险解读 and 卡点诊断 in one run
  // over the rule's assessment. Findings; no level moves.
  "deal.brief",
  // Deal batch 8c (YC-066 S6 下一步最佳动作): one dated action for us, its
  // reason naming an unmet exit criterion or the stall. A proposal; accepted,
  // it is our commitment. Written when the deal page opens on changed data
  // (owner 2026-09-28), not by a daily sweep.
  "deal.next_action",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export interface CapabilitySpec {
  /**
   * The feature key this capability lives under (YC-042 section 03, owner
   * 2026-09-24: "功能有, 对应的参谋就有"). A workspace that can use the host
   * feature can use its advisor - running it, receiving its proposals and
   * deciding them. There is no separate advisor tier gate any more:
   * `copilot.suggest` now covers only the session tool loop, where the member
   * asks the model to reach into the domain.
   */
  readonly feature: FeatureKey;
  /**
   * How the model is called for this work (agent/atlas/profiles.ts): the
   * route, whether it reasons, its output budget and its deadline.
   *
   * The product names the profile; the OPERATOR decides which model serves
   * its route (endpoints.ts). Pinning a model here would take that back and
   * forfeit the endpoint's fallback chain.
   *
   * `judgement` - the one profile that reasons - is the owner's ruling
   * (2026-09-30) for exactly four: deal.price, deal.next_action, deal.plan,
   * account.consistency. Giving it to another capability is a new ruling,
   * not an edit; capability.test.ts holds the list.
   */
  readonly profile: CallProfile;
  /**
   * What this capability is allowed to look at.
   *
   * Narrower than "everything the member may read", deliberately: a discount
   * approval does not need the customer's meeting notes, and a capability that
   * retrieves more than it needs produces reasoning nobody can follow.
   */
  readonly evidence: readonly ("interactions" | "commitments" | "chain" | "deals" | "lines" | "projects" | "signals" | "segments" | "targets")[];
}

/**
 * The catalogue.
 *
 * Deliberately a Record over the union rather than a lookup with a fallback:
 * adding a capability without deciding its task and evidence scope should be a
 * compile error, not a silent default to "chat over everything".
 */
export const CAPABILITY_SPEC: Record<Capability, CapabilitySpec> = {
  "deal.stall_risk": {
    feature: "pipeline.manage",
    profile: "drafting",
    evidence: ["interactions", "commitments", "deals"],
  },
  "deal.competition": {
    feature: "pipeline.manage",
    profile: "drafting",
    evidence: ["interactions", "deals", "signals"],
  },
  "account.chain_map": {
    feature: "account.manage",
    profile: "drafting",
    evidence: ["interactions", "chain"],
  },
  "account.cadence": {
    feature: "account.manage",
    profile: "drafting",
    // No interactions on purpose: this capability exists BECAUSE there are
    // none. Its evidence is the chain and the deals that are not moving.
    evidence: ["chain", "deals"],
  },
  "signal.triage": {
    feature: "signal.inbox",
    // Runs in bulk over a feed, so cost per call dominates quality per call.
    profile: "triage",
    evidence: ["signals"],
  },
  "pricing.discount_approval": {
    feature: "pipeline.manage",
    profile: "drafting",
    // Lines and the price book only. A discount decision does not need the
    // customer's meeting notes, and pulling them in would bury the one number
    // the decision turns on.
    evidence: ["lines", "deals"],
  },
  "delivery.payment_risk": {
    feature: "delivery.project",
    profile: "drafting",
    evidence: ["projects", "deals"],
  },
  "campaign.return": {
    feature: "campaign.manage",
    profile: "drafting",
    evidence: ["deals", "signals"],
  },
  "strategy.segment_coverage": {
    feature: "strategy.segment",
    profile: "drafting",
    evidence: ["segments", "deals"],
  },
  "strategy.territory_attainment": {
    feature: "planning.territory",
    profile: "drafting",
    evidence: ["targets", "deals"],
  },
  // Filed by the rule-based upsell sweep today; if a model is ever asked for
  // upsell reasoning it reads the deals and their lines, not meeting notes.
  "account.upsell": {
    feature: "account.manage",
    profile: "drafting",
    evidence: ["deals", "lines"],
  },
  // The deal's unmet criteria and the promises already open - no notes.
  "deal.plan": {
    feature: "pipeline.manage",
    profile: "judgement",
    evidence: ["commitments", "deals"],
  },
  // The board's computed figures only - totals, change, unverified deals,
  // owners. It reads no notes: the numbers are the brief.
  "forecast.brief": {
    feature: "pipeline.forecast",
    profile: "drafting",
    evidence: ["deals"],
  },
  // The rule's four review sections and the outcome's reasons - no notes.
  "deal.review": {
    feature: "pipeline.winloss",
    profile: "drafting",
    evidence: ["commitments", "chain", "deals", "lines"],
  },
  // The chosen attendees, the open promises, the goal and recent notes.
  "deal.meeting": {
    feature: "pipeline.manage",
    profile: "drafting",
    evidence: ["interactions", "commitments", "chain", "deals"],
  },
  // The concession sheet (rule numbers) and the deal's follow-ups - the
  // buyer's own words about price are what the strategy answers.
  "deal.price": {
    feature: "pipeline.manage",
    profile: "judgement",
    evidence: ["interactions", "lines", "deals"],
  },
  // The rule's assessment, the stall holder, open promises and recent notes.
  "deal.brief": {
    feature: "pipeline.manage",
    profile: "drafting",
    evidence: ["interactions", "commitments", "chain", "deals"],
  },
  // The goals (unmet criteria, the stall), open promises and recent notes.
  "deal.next_action": {
    feature: "pipeline.manage",
    profile: "judgement",
    evidence: ["interactions", "commitments", "deals"],
  },
  // One new follow-up against what the slots already say.
  "deal.evidence": {
    feature: "pipeline.manage",
    profile: "drafting",
    evidence: ["interactions", "deals"],
  },
  // Reads the notes and nothing else: a conflict is between two records.
  "account.consistency": {
    feature: "account.manage",
    profile: "judgement",
    evidence: ["interactions"],
  },
};

export function isCapability(v: string): v is Capability {
  return (CAPABILITIES as readonly string[]).includes(v);
}

/**
 * Resolve a stored key to a display label.
 *
 * The labels live in the UI's message table, not here: this module is domain
 * logic and a domain that owns its own display strings inverts the dependency -
 * and it would put user-visible text outside the one file TD-002 contains it
 * in. Unknown and absent both fall back, because unlabelled history must stay
 * visibly unlabelled rather than be guessed into a capability.
 */
export function capabilityLabel(
  v: string | null,
  labels: Readonly<Record<string, string>>,
  unknown: string,
): string {
  return v && isCapability(v) ? (labels[v] ?? unknown) : unknown;
}
