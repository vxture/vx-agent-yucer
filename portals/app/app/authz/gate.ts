// The two gates, composed (docs/20-specs/40-capability-matrix.md "relation to the
// permission gate"; design_yucer_100 section 5).
//
//   entitlement gate  - did this WORKSPACE buy it?   authority: platform C2
//   permission gate   - may this MEMBER do it?       authority: local_authz
//
// The order is fixed: entitlement first, permission second. Reversed, a member
// with the permission would learn the shape of a feature the workspace never
// bought (the denial message itself leaks the feature's existence), so the two
// checks are not commutative even though both must pass.
//
// The gating formulas are rigid-zone (docs/20-specs/30-business-rules.md section
// 8): UI surface `tier != null`; data surface `tier != null || bundled`. They are
// imported from entitlement/types.ts and never restated here, so there is exactly
// one place they could ever be widened - and it is not this file.

import {
  type Entitlement,
  type Tier,
  hasDataAccess,
  hasProductAccess,
} from "../entitlement/types";
import { canUseFeature, minTierFor, type FeatureKey } from "../entitlement/capability";
import type { PermCode } from "./catalog";

/**
 * Which formula applies. "ui" is anything that renders a feature's surface;
 * "data" is a read/write of data already in the product. Bundled-only coverage
 * separates the two: it keeps a workspace's existing data reachable without
 * lighting up the product UI.
 */
export type Surface = "ui" | "data";

export type DenyReason =
  | "no_product_access" // ui surface, tier == null
  | "no_data_access" // data surface, tier == null and not bundled
  | "feature_not_in_tier" // covered, but this tier does not include the key
  | "permission_denied"; // entitled, but this member lacks the permission

/**
 * What the caller should offer the user. Exactly one remedy, never both: an
 * upgrade prompt shown to someone who is merely missing a permission sends them
 * to buy something they already have.
 */
export type Remedy = "none" | "upgrade" | "request_access";

export interface Decision {
  allowed: boolean;
  reason: DenyReason | null;
  remedy: Remedy;
  /** Lowest tier that would unlock the feature. Only set when remedy is "upgrade". */
  requiredTier: Tier | null;
  /** Permission the member is missing. Only set when reason is "permission_denied". */
  requiredPerm: PermCode | null;
}

const ALLOW: Decision = {
  allowed: true,
  reason: null,
  remedy: "none",
  requiredTier: null,
  requiredPerm: null,
};

function deny(reason: DenyReason, extra: Partial<Decision> = {}): Decision {
  return {
    allowed: false,
    reason,
    remedy: reason === "permission_denied" ? "request_access" : "upgrade",
    requiredTier: null,
    requiredPerm: null,
    ...extra,
  };
}

/**
 * Gate 1 - entitlement. `feature` is optional: an action that is part of the
 * product's baseline rather than a packaged feature passes with only the access
 * formula applied.
 *
 * Bundled-only coverage (tier == null, bundled == true) passes the data-surface
 * access formula but can never satisfy a feature key, because feature keys are
 * read off a tier and there is no tier to read. Denying is the conservative
 * direction the spec demands, and inventing a "bundled implies free tier" rule
 * would be the product re-deriving a commercial decision.
 */
export function entitlementGate(
  e: Entitlement,
  opts: { feature?: FeatureKey | null; surface: Surface },
): Decision {
  const covered = opts.surface === "ui" ? hasProductAccess(e) : hasDataAccess(e);
  if (!covered) {
    return deny(opts.surface === "ui" ? "no_product_access" : "no_data_access", {
      requiredTier: opts.feature ? minTierFor(opts.feature) : null,
    });
  }

  const feature = opts.feature ?? null;
  if (feature && !canUseFeature(e, feature)) {
    return deny("feature_not_in_tier", { requiredTier: minTierFor(feature) });
  }
  return ALLOW;
}

/** Gate 2 - permission. `held` is the member's effective permission set. */
export function permissionGate(held: Iterable<PermCode>, required: PermCode | null): Decision {
  if (required == null) return ALLOW;
  const set = held instanceof Set ? (held as Set<PermCode>) : new Set(held);
  return set.has(required) ? ALLOW : deny("permission_denied", { requiredPerm: required });
}

/**
 * Both gates in the mandated order. Returns the FIRST failure, so a caller that
 * is neither entitled nor permitted is told to upgrade and is never told which
 * permission it would then have needed.
 */
export function authorize(input: {
  entitlement: Entitlement;
  surface: Surface;
  feature?: FeatureKey | null;
  permission?: PermCode | null;
  held: Iterable<PermCode>;
}): Decision {
  const first = entitlementGate(input.entitlement, {
    feature: input.feature ?? null,
    surface: input.surface,
  });
  if (!first.allowed) return first;
  return permissionGate(input.held, input.permission ?? null);
}

/**
 * The one place the human-machine boundary can be crossed
 * (docs/20-specs/30-business-rules.md section 7 rule 3). Autonomous execution
 * needs THREE independent yeses, and the workspace opt-in is not implied by the
 * other two: buying the enterprise tier does not switch autopilot on, and neither
 * does holding the permission.
 *
 * Note the entitlement check runs on the "data" surface: autopilot executes
 * writes, it is not a rendered surface.
 */
export function autopilotAuthorized(input: {
  entitlement: Entitlement;
  held: Iterable<PermCode>;
  workspaceOptIn: boolean;
}): Decision {
  const gated = authorize({
    entitlement: input.entitlement,
    surface: "data",
    feature: "copilot.autopilot",
    permission: "copilot.autopilot",
    held: input.held,
  });
  if (!gated.allowed) return gated;
  // Entitled and permitted, but not switched on. That is not an upgrade problem
  // and not an access-request problem - it is a setting, so neither remedy fits.
  if (!input.workspaceOptIn) {
    return {
      allowed: false,
      reason: "permission_denied",
      remedy: "none",
      requiredTier: null,
      requiredPerm: "copilot.autopilot",
    };
  }
  return ALLOW;
}
