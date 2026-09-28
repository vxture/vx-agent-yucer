import { specFor } from "../../authz/actions";
import type { PermissionHolder } from "../../authz/decide";
import { CAPABILITY_MATRIX, type FeatureKey } from "../../entitlement/capability";
import { TIERS, type Entitlement, type Tier } from "../../entitlement/types";
import { resolveNavigation, type NavEntry } from "./navigation";

// 高级功能升级页 (owner 2026-09-28): a module this workspace has not bought
// opens ONE template in the centre pane - what it is, what else the tier
// brings, and 【升级】 - instead of throwing the member at the pricing page.
//
// Every fact on the page is the gate's own: the module is locked when
// resolveNavigation says so (the launcher's rule, so the two cannot disagree),
// the tier is the decision's requiredTier, and "同时解锁" is the capability
// matrix's difference between the tier they have and the tier they need -
// never a hand-kept list that drifts from the matrix.

export interface UpgradeTarget {
  readonly key: string;
  readonly href: string;
  readonly icon: NavEntry["icon"];
  readonly currentTier: Tier | null;
  readonly requiredTier: Tier;
  /** Tiers passed on the way (above the current, below the required) - each
   *  reads as "all of <tier>", so a two-tier jump is not a list of eleven. */
  readonly viaTiers: readonly Tier[];
  /** What the required tier itself adds, besides this module, in the matrix's order. */
  readonly alsoUnlocks: readonly FeatureKey[];
}

/**
 * The upgrade facts for one module, or null when it is not locked by tier
 * for this member - visible, unknown, or refused on permission (a permission
 * gap stays silent, as everywhere in the shell: upgrading would not open it).
 */
export function upgradeTarget(key: string, holder: PermissionHolder, entitlement: Entitlement): UpgradeTarget | null {
  const entry = resolveNavigation(holder, entitlement).find((e) => e.key === key);
  if (!entry || entry.state !== "locked" || !entry.decision.requiredTier) return null;
  const required = entry.decision.requiredTier;
  const own = specFor(entry.action).feature;
  const at = TIERS.indexOf(required);
  const from = entitlement.tier ? TIERS.indexOf(entitlement.tier) : -1;
  const below = new Set<FeatureKey>(at > 0 ? CAPABILITY_MATRIX[TIERS[at - 1]!] : []);
  return {
    key: entry.key,
    href: entry.href,
    icon: entry.icon,
    currentTier: entitlement.tier ?? null,
    requiredTier: required,
    viaTiers: TIERS.slice(from + 1, at),
    alsoUnlocks: CAPABILITY_MATRIX[required].filter((f) => f !== own && !below.has(f)),
  };
}

