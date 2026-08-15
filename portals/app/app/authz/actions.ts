// Product action catalog - the single table that wires each concrete product
// action to its two gates.
//
// Without this table the pairing lives scattered across route handlers and page
// components, and the two gates drift apart one endpoint at a time (the classic
// failure: a mutation endpoint that checks entitlement but forgets the
// permission, or a page that hides a button the API still honours). Here the
// pairing is data, so it can be reviewed as a list and asserted in a test.
//
// `feature: null` means the action is product baseline rather than packaged
// capability - it still needs the access formula, just no feature key.
// `permission: null` would mean "any signed-in member"; nothing uses it today.

import type { FeatureKey } from "../entitlement/capability";
import type { PermCode } from "./catalog";

/** The eight capability domains, spelled as agent_playbook.scope_domain does. */
export const DOMAINS = [
  "strategy",
  "planning",
  "campaign",
  "account",
  "signal",
  "pipeline",
  "delivery",
  "copilot",
] as const;

export type Domain = (typeof DOMAINS)[number];

/**
 * Where an action is filed. "admin" is product administration, which is NOT a
 * ninth capability domain - it has no feature key, no schema and no page of its
 * own; it is the settings surface the other eight share.
 */
export type ActionScope = Domain | "admin";

export interface ActionSpec {
  domain: ActionScope;
  /** Entitlement gate input. null = baseline, no feature key required. */
  feature: FeatureKey | null;
  /** Permission gate input. */
  permission: PermCode | null;
  /** True if the action writes. Drives the read/write assertions below. */
  writes: boolean;
}

// The surface ("ui" | "data") is deliberately NOT part of a spec: it is a
// property of the call site, not of the action. A page render passes "ui"; an
// API route serving data passes "data".
export const ACTIONS = {
  // --- D1 strategy ---------------------------------------------------------
  "strategy.plan.view": { domain: "strategy", feature: "strategy.plan", permission: "strategy.read", writes: false },
  "strategy.plan.create": { domain: "strategy", feature: "strategy.plan", permission: "strategy.write", writes: true },
  "strategy.plan.update": { domain: "strategy", feature: "strategy.plan", permission: "strategy.write", writes: true },
  "strategy.plan.approve": { domain: "strategy", feature: "strategy.plan", permission: "strategy.write", writes: true },
  "strategy.segment.view": { domain: "strategy", feature: "strategy.segment", permission: "strategy.read", writes: false },
  "strategy.segment.upsert": { domain: "strategy", feature: "strategy.segment", permission: "strategy.write", writes: true },

  // --- D2 planning ---------------------------------------------------------
  "planning.territory.view": { domain: "planning", feature: "planning.territory", permission: "planning.read", writes: false },
  "planning.territory.upsert": { domain: "planning", feature: "planning.territory", permission: "planning.write", writes: true },
  "planning.target.view": { domain: "planning", feature: "planning.target", permission: "planning.read", writes: false },
  "planning.target.create": { domain: "planning", feature: "planning.target", permission: "planning.write", writes: true },
  "planning.target.update": { domain: "planning", feature: "planning.target", permission: "planning.write", writes: true },
  // Attainment is computed by D6 from forecast snapshots but read on a D2
  // surface; it is gated as a planning read, not a forecast submission.
  "planning.attainment.view": { domain: "planning", feature: "planning.target", permission: "planning.read", writes: false },

  // --- D3 campaign ---------------------------------------------------------
  "campaign.view": { domain: "campaign", feature: "campaign.manage", permission: "campaign.read", writes: false },
  "campaign.upsert": { domain: "campaign", feature: "campaign.manage", permission: "campaign.write", writes: true },
  "campaign.execution.view": { domain: "campaign", feature: "campaign.execute", permission: "campaign.read", writes: false },
  "campaign.execution.upsert": { domain: "campaign", feature: "campaign.execute", permission: "campaign.write", writes: true },

  // --- D4 account ----------------------------------------------------------
  "account.view": { domain: "account", feature: "account.manage", permission: "account.read", writes: false },
  "account.upsert": { domain: "account", feature: "account.manage", permission: "account.write", writes: true },
  "account.contact.upsert": { domain: "account", feature: "account.manage", permission: "account.write", writes: true },
  "account.graph.view": { domain: "account", feature: "account.graph", permission: "account.read", writes: false },
  "account.graph.link": { domain: "account", feature: "account.graph", permission: "account.write", writes: true },
  "account.offering.view": { domain: "account", feature: "account.manage", permission: "account.read", writes: false },
  "account.offering.upsert": { domain: "account", feature: "account.manage", permission: "account.write", writes: true },

  // --- D5 signal -----------------------------------------------------------
  "signal.view": { domain: "signal", feature: "signal.inbox", permission: "signal.read", writes: false },
  "signal.triage": { domain: "signal", feature: "signal.inbox", permission: "signal.triage", writes: true },
  // Re-scoring is the automatic scorer, a pro-tier capability; triaging by hand
  // stays available on starter.
  "signal.rescore": { domain: "signal", feature: "signal.autoscore", permission: "signal.triage", writes: true },
  "signal.feed.configure": { domain: "signal", feature: "signal.external_feed", permission: "admin.manage", writes: true },
  "signal.lead.view": { domain: "signal", feature: "signal.inbox", permission: "signal.read", writes: false },
  "signal.lead.upsert": { domain: "signal", feature: "signal.inbox", permission: "signal.triage", writes: true },
  // Conversion creates an opportunity, so it is gated as a pipeline write even
  // though the button lives on the lead. The seam belongs to the receiving side.
  "signal.lead.convert": { domain: "pipeline", feature: "pipeline.manage", permission: "pipeline.write", writes: true },

  // --- D6 pipeline ---------------------------------------------------------
  "pipeline.view": { domain: "pipeline", feature: "pipeline.manage", permission: "pipeline.read", writes: false },
  "pipeline.opportunity.create": { domain: "pipeline", feature: "pipeline.manage", permission: "pipeline.write", writes: true },
  "pipeline.opportunity.update": { domain: "pipeline", feature: "pipeline.manage", permission: "pipeline.write", writes: true },
  "pipeline.opportunity.advance": { domain: "pipeline", feature: "pipeline.manage", permission: "pipeline.write", writes: true },
  "pipeline.forecast.view": { domain: "pipeline", feature: "pipeline.forecast", permission: "pipeline.read", writes: false },
  // Submitting a snapshot is a commitment upward, which is why it needs the
  // dedicated pipeline.forecast permission rather than pipeline.write.
  "pipeline.forecast.snapshot": { domain: "pipeline", feature: "pipeline.forecast", permission: "pipeline.forecast", writes: true },
  "pipeline.forecast.categorize": { domain: "pipeline", feature: "pipeline.forecast", permission: "pipeline.forecast", writes: true },
  "pipeline.winloss.view": { domain: "pipeline", feature: "pipeline.winloss", permission: "pipeline.read", writes: false },
  "pipeline.winloss.record": { domain: "pipeline", feature: "pipeline.winloss", permission: "pipeline.write", writes: true },

  // --- D7 delivery ---------------------------------------------------------
  "delivery.project.view": { domain: "delivery", feature: "delivery.project", permission: "delivery.read", writes: false },
  "delivery.project.upsert": { domain: "delivery", feature: "delivery.project", permission: "delivery.write", writes: true },
  "delivery.milestone.upsert": { domain: "delivery", feature: "delivery.project", permission: "delivery.write", writes: true },
  "delivery.task.upsert": { domain: "delivery", feature: "delivery.project", permission: "delivery.write", writes: true },
  "delivery.revenue.view": { domain: "delivery", feature: "delivery.revenue", permission: "delivery.read", writes: false },
  "delivery.revenue.upsert": { domain: "delivery", feature: "delivery.revenue", permission: "delivery.write", writes: true },

  // --- D8 copilot ----------------------------------------------------------
  "copilot.session.open": { domain: "copilot", feature: "copilot.ask", permission: "copilot.use", writes: true },
  "copilot.ask": { domain: "copilot", feature: "copilot.ask", permission: "copilot.use", writes: true },
  // Asking for proposals is a higher tier than asking a question: a proposal is
  // the copilot reaching into the domain, an answer is not.
  "copilot.suggest": { domain: "copilot", feature: "copilot.suggest", permission: "copilot.use", writes: true },
  "copilot.action.decide": { domain: "copilot", feature: "copilot.suggest", permission: "copilot.decide", writes: true },
  "copilot.action.decide_batch": { domain: "copilot", feature: "copilot.suggest", permission: "copilot.decide", writes: true },
  "copilot.autopilot.enable": { domain: "copilot", feature: "copilot.autopilot", permission: "copilot.autopilot", writes: true },
  "copilot.playbook.view": { domain: "copilot", feature: "copilot.ask", permission: "copilot.use", writes: false },
  "copilot.playbook.upsert": { domain: "copilot", feature: "copilot.suggest", permission: "admin.manage", writes: true },

  // --- Product administration (baseline, no feature key) --------------------
  // Role assignment must not be tier-gated: a workspace that can use the product
  // at all must be able to say who does what inside it.
  "admin.member.view": { domain: "admin", feature: null, permission: "admin.manage", writes: false },
  "admin.member.role.assign": { domain: "admin", feature: null, permission: "admin.manage", writes: true },
  "admin.member.role.revoke": { domain: "admin", feature: null, permission: "admin.manage", writes: true },
} as const satisfies Record<string, ActionSpec>;

export type ActionId = keyof typeof ACTIONS;

export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

export function specFor(action: ActionId): ActionSpec {
  return ACTIONS[action];
}
