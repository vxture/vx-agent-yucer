// Permission gate catalog (docs/20-specs/50-role-permission-catalog.md).
//
// AUTHORITY NOTE: local_authz.role / permission / role_permission in the database
// are the runtime authority; those tables are seeded by
// deploy/database/ddl/incr/0001_seed_authz_catalog.sql and are runtime-read-only
// (98_column_locks.sql revokes UPDATE). This file is a TYPED MIRROR of that seed,
// not a second source of truth: catalog.test.ts parses the seed SQL and asserts
// exact parity, so drift fails the build rather than diverging silently.
//
// The mirror exists because three consumers need the catalog without a database:
// the offline/in-memory store, compile-time PermCode checking, and the UI's
// affordance computation (which buttons even render).
//
// These are PRODUCT FUNCTION roles. They are NOT the platform governance roles
// (owner/manager/member/readonly/guest, see auth/lib/claims.ts) and there is
// deliberately no mapping table between the two.

export const PERM_CODES = [
  // D1 strategy
  "strategy.read",
  "strategy.write",
  // D2 planning
  "planning.read",
  "planning.write",
  // D3 campaign
  "campaign.read",
  "campaign.write",
  // D4 account
  "account.read",
  "account.write",
  // D5 signal
  "signal.read",
  "signal.triage",
  // D6 pipeline
  "pipeline.read",
  "pipeline.write",
  "pipeline.forecast",
  // D7 delivery
  "delivery.read",
  "delivery.write",
  // D8 copilot
  "copilot.use",
  "copilot.decide",
  "copilot.autopilot",
  // Product administration (NOT platform governance).
  "admin.manage",
  // --- added by numbered increment, and therefore listed in ARRIVAL order ---
  // Not grouped with the other D1 codes above, because this list mirrors the
  // seed and the seed grows by append-only increment. Regrouping for tidiness
  // would break the order parity that catches an accidental reshuffle.
  //
  // strategy.approve (incr/0002): approving a plan is not editing one. It is the
  // moment a plan becomes the number the rest of the chain is measured against,
  // and the same shape as the pipeline.write / pipeline.forecast split one level
  // down - "owns the deal, not the forecast commitment".
  "strategy.approve",
  // --- catalog (incr/0010), ADR-017 -----------------------------------------
  // The catalogue partition carries no feature key, so permissions are the ONLY
  // gate on it. Three, not two, because the floor price is a different job from
  // editing the catalogue - see the note in actions.ts.
  "catalog.read",
  "catalog.write",
  "catalog.price",
  // --- evidence capture (incr/0011), ADR-018 --------------------------------
  // Recording what happened is NOT editing the customer master record, and
  // collapsing them left the people who meet customers most unable to write
  // anything down. See ADR-018.
  "account.record",
  // --- discount authority (incr/0012), ADR-019 ------------------------------
  // Separate from pipeline.write on purpose: the person who quotes below the
  // floor must not be the person who signs it off, or the floor constrains
  // nobody. Not a feature key - keys are frozen at 19 and a signature is not
  // separately sellable.
  "pipeline.discount",
] as const;

export type PermCode = (typeof PERM_CODES)[number];

export const ROLE_CODES = [
  "sales_leader",
  "marketing_manager",
  "sales_rep",
  "presales",
  "delivery_manager",
  "sales_ops",
  "viewer",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

// Grants are listed literally, exactly as the seed lists them. They are NOT
// derived by pattern (no "every *.read" sweep): a permission added later must be
// granted deliberately, per role, in both places.
export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermCode[]> = {
  // Accountable for the whole chain, and the only role that may authorize the
  // copilot to act without a human decision.
  sales_leader: [
    "strategy.read",
    "strategy.write",
    "strategy.approve",
    "planning.read",
    "planning.write",
    "campaign.read",
    "campaign.write",
    "account.read",
    "account.write",
    "signal.read",
    "signal.triage",
    "pipeline.read",
    "pipeline.write",
    "pipeline.forecast",
    "delivery.read",
    "delivery.write",
    "copilot.use",
    "copilot.decide",
    "copilot.autopilot",
    "admin.manage",
    "catalog.read",
    "catalog.write",
    "catalog.price",
    "pipeline.discount",
    "account.record",
  ],
  // Demand side, up to the lead handoff: triages signals but never edits a deal.
  marketing_manager: [
    "strategy.read",
    "strategy.write",
    "campaign.read",
    "campaign.write",
    "signal.read",
    "signal.triage",
    "account.read",
    "pipeline.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "account.record",
  ],
  // Owns the deal, not the forecast commitment (pipeline.write without
  // pipeline.forecast is the deliberate split).
  sales_rep: [
    "account.read",
    "account.write",
    "signal.read",
    "signal.triage",
    "pipeline.read",
    "pipeline.write",
    "delivery.read",
    "campaign.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "account.record",
  ],
  presales: [
    "account.read",
    "account.write",
    "pipeline.read",
    "delivery.read",
    "copilot.use",
    "catalog.read",
    "account.record",
  ],
  delivery_manager: [
    "delivery.read",
    "delivery.write",
    "account.read",
    "pipeline.read",
    "copilot.use",
    "copilot.decide",
    "catalog.read",
    "account.record",
  ],
  // Sets the rules (quota, territory, forecast discipline, role assignment) but
  // does not edit the deals - the rule-setter is not also the data-editor.
  sales_ops: [
    "planning.read",
    "planning.write",
    "pipeline.read",
    "pipeline.forecast",
    "account.read",
    "campaign.read",
    "strategy.read",
    "admin.manage",
    "copilot.use",
    "catalog.read",
    "catalog.write",
    "catalog.price",
    // Setting the floor and granting an exception to it are two halves of one
    // authority; ops can already move a floor, so withholding the
    // transaction-level exception would be theatre, not separation of duties.
    "pipeline.discount",
  ],
  // Read-only, but keeps copilot.use: asking a question produces no write.
  viewer: [
    "strategy.read",
    "planning.read",
    "campaign.read",
    "account.read",
    "signal.read",
    "pipeline.read",
    "delivery.read",
    "copilot.use",
    "catalog.read",
  ],
};

/**
 * Default product role for a platform workspace:owner on first login. This is an
 * INITIALIZATION default only (catalog doc, "relation to platform roles"); it is
 * freely reassignable afterwards and is never re-applied on later logins.
 */
export const OWNER_BOOTSTRAP_ROLE: RoleCode = "sales_leader";

const PERM_SET: ReadonlySet<string> = new Set(PERM_CODES);
const ROLE_SET: ReadonlySet<string> = new Set(ROLE_CODES);

export function isPermCode(value: string): value is PermCode {
  return PERM_SET.has(value);
}

export function isRoleCode(value: string): value is RoleCode {
  return ROLE_SET.has(value);
}

/**
 * Union of the permissions held by a set of roles. Unknown role codes are
 * ignored rather than throwing: the database catalog can legitimately be ahead
 * of this mirror during a rolling deploy, and an unknown role must degrade to
 * "grants nothing", never to "grants everything".
 */
export function permissionsForRoles(roles: readonly string[]): PermCode[] {
  const out = new Set<PermCode>();
  for (const role of roles) {
    if (!isRoleCode(role)) continue;
    for (const perm of ROLE_PERMISSIONS[role]) out.add(perm);
  }
  // Stable catalog order, so callers can compare/serialize without sorting.
  return PERM_CODES.filter((p) => out.has(p));
}
