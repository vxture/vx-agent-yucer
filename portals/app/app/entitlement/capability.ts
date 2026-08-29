import { type Entitlement, TIERS, type Tier, hasProductAccess } from "./types";

// Capability matrix (product_220 section 3). tier -> feature keys is PRODUCT
// knowledge - the platform never configures feature keys. The template shipped
// the versioned mechanism plus an EMPTY matrix; this file is the yucer product's
// blank-zone fill (product_240 section 2.9).
//
// Feature keys are namespaced by capability domain, `<domain>.<feature>`, where
// the domain prefix is one of the eight domains in
// docs/20-specs/20-capability-domains.md (D1..D8). The key set below is the
// commercial packaging surface; it is NOT the permission model - who inside a
// workspace may do a thing is local_authz (docs/20-specs/50-role-permission-
// catalog.md). Both gates apply: entitlement first (did the workspace buy it),
// then role permission (may this member do it).

export const FEATURE_KEYS = [
  // D1 strategy - market and GTM strategy
  "strategy.plan",
  "strategy.segment",
  // D2 planning - targets, quota, territory
  "planning.target",
  "planning.territory",
  // D3 campaign - market execution
  "campaign.manage",
  "campaign.execute",
  // D4 account - customer management
  "account.manage",
  "account.graph",
  // D5 signal - opportunity detection
  "signal.inbox",
  "signal.autoscore",
  "signal.external_feed",
  // D6 pipeline - opportunity management
  "pipeline.manage",
  "pipeline.forecast",
  "pipeline.winloss",
  // D7 delivery - project landing and revenue
  "delivery.project",
  "delivery.revenue",
  // D8 copilot - sales intelligence assistant
  "copilot.ask",
  "copilot.suggest",
  "copilot.autopilot",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

// Cumulative per tier: each tier is spread into the next, so a higher tier
// literally contains every lower-tier key. canUseFeature does a flat `includes`
// (no inheritance at lookup time), so the arrays must be complete - building
// them by spreading is what keeps that true.
const FREE: FeatureKey[] = [
  // Enough to run the core loop by hand: customers, deals, and asking the agent.
  "account.manage",
  "pipeline.manage",
  "copilot.ask",
];

const STARTER: FeatureKey[] = [
  ...FREE,
  // Demand in, delivery out - the full-chain skeleton, still manually driven.
  "signal.inbox",
  "campaign.manage",
  "delivery.project",
];

const PRO: FeatureKey[] = [
  ...STARTER,
  // The management layer: plan against quota, forecast, and let the agent
  // propose next actions.
  "planning.target",
  "planning.territory",
  "account.graph",
  "signal.autoscore",
  "pipeline.forecast",
  "copilot.suggest",
];

const BUSINESS: FeatureKey[] = [
  ...PRO,
  // Strategy down to landing: the closed loop, including the learning loop.
  "strategy.plan",
  "strategy.segment",
  "campaign.execute",
  "signal.external_feed",
  "pipeline.winloss",
  "delivery.revenue",
];

const ENTERPRISE: FeatureKey[] = [
  ...BUSINESS,
  // Agent executes accepted actions on a standing authorization.
  "copilot.autopilot",
];

export const CAPABILITY_MATRIX: Record<Tier, FeatureKey[]> = {
  free: FREE,
  starter: STARTER,
  pro: PRO,
  business: BUSINESS,
  enterprise: ENTERPRISE,
};

export function canUseFeature(e: Entitlement, key: FeatureKey): boolean {
  if (!hasProductAccess(e) || e.tier == null) return false;
  return CAPABILITY_MATRIX[e.tier].includes(key);
}

/** Lowest tier that unlocks a feature, or null if no tier grants it. */
export function minTierFor(key: FeatureKey): Tier | null {
  for (const tier of TIERS) {
    if (CAPABILITY_MATRIX[tier].includes(key)) return tier;
  }
  return null;
}
