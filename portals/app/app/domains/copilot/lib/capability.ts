import type { CopilotTask } from "../../../agent/atlas/endpoints";

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
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export interface CapabilitySpec {
  /**
   * The shape of the work, which is what routes to a model.
   *
   * The product names the task; the OPERATOR decides which model serves it
   * (endpoints.ts). Pinning a model here would take that back and forfeit the
   * endpoint's fallback chain.
   */
  readonly task: CopilotTask;
  /**
   * What this capability is allowed to look at.
   *
   * Narrower than "everything the member may read", deliberately: a discount
   * approval does not need the customer's meeting notes, and a capability that
   * retrieves more than it needs produces reasoning nobody can follow.
   */
  readonly evidence: readonly ("interactions" | "commitments" | "chain" | "deals" | "lines" | "projects" | "signals")[];
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
    task: "propose",
    evidence: ["interactions", "commitments", "deals"],
  },
  "deal.competition": {
    task: "propose",
    evidence: ["interactions", "deals", "signals"],
  },
  "account.chain_map": {
    task: "propose",
    evidence: ["interactions", "chain"],
  },
  "account.cadence": {
    task: "propose",
    // No interactions on purpose: this capability exists BECAUSE there are
    // none. Its evidence is the chain and the deals that are not moving.
    evidence: ["chain", "deals"],
  },
  "signal.triage": {
    // Runs in bulk over a feed, so cost per call dominates quality per call.
    task: "score",
    evidence: ["signals"],
  },
  "pricing.discount_approval": {
    task: "propose",
    // Lines and the price book only. A discount decision does not need the
    // customer's meeting notes, and pulling them in would bury the one number
    // the decision turns on.
    evidence: ["lines", "deals"],
  },
  "delivery.payment_risk": {
    task: "propose",
    evidence: ["projects", "deals"],
  },
  "campaign.return": {
    task: "summarize",
    evidence: ["deals", "signals"],
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
