// The eight-domain navigation, computed from the two gates.
//
// Nav is derived rather than hand-listed so it cannot drift from what a member
// can actually do. Each entry names the action that opens the domain, and the
// same authorize() call that guards the API decides whether the entry is
// visible, visible-but-locked, or absent.
//
// The three states matter and are not interchangeable:
//
//   visible  - entitled and permitted; go ahead.
//   locked   - the workspace has not bought it. Shown, with an upgrade path,
//              because a feature nobody can see is a feature nobody buys.
//   hidden   - the member lacks the permission. NOT shown: teasing someone with
//              a door their colleague can open but they cannot is noise they can
//              do nothing about, and it leaks who-can-do-what across the team.
//
// So an entitlement gap is advertised and a permission gap is silent. That
// asymmetry is deliberate.

// Imports the PURE decision module, never authz/context.ts: this file is read by
// client components, and context.ts carries the database client behind it.
import type { Entitlement } from "../../entitlement/types";
import type { Decision } from "../../authz/gate";
import type { ActionId } from "../../authz/actions";
import { can, type PermissionHolder } from "../../authz/decide";

/** Icon names are the DS's closed set; these are checked at compile time. */
export type NavIcon =
  | "graph"
  | "chart-bar"
  | "workflow"
  | "buildings"
  | "lightbulb"
  | "table"
  | "cube"
  | "sparkles"
  | "settings";

export interface NavEntry {
  /** Also the key into DOMAIN_LABEL; display text lives in the message catalog. */
  key: string;
  href: string;
  icon: NavIcon;
  action: ActionId;
}

/**
 * Domain order follows the chain the product is built around: strategy ->
 * planning -> campaign -> account -> signal -> pipeline -> delivery, with the
 * copilot last because it cuts across all of them.
 */
export const NAV_ENTRIES: readonly NavEntry[] = [
  { key: "strategy", href: "/strategy", icon: "graph", action: "strategy.plan.view" },
  { key: "planning", href: "/planning", icon: "chart-bar", action: "planning.target.view" },
  { key: "campaign", href: "/campaign", icon: "workflow", action: "campaign.view" },
  { key: "account", href: "/account", icon: "buildings", action: "account.view" },
  { key: "signal", href: "/signal", icon: "lightbulb", action: "signal.view" },
  { key: "pipeline", href: "/pipeline", icon: "table", action: "pipeline.view" },
  { key: "delivery", href: "/delivery", icon: "cube", action: "delivery.project.view" },
  { key: "copilot", href: "/copilot", icon: "sparkles", action: "copilot.playbook.view" },
];

export type NavState = "visible" | "locked";

export interface ResolvedNavEntry extends NavEntry {
  state: NavState;
  decision: Decision;
}

/**
 * Resolve the navigation for one member.
 *
 * Uses the "ui" surface, which is the stricter of the two formulas: a workspace
 * with bundled-only coverage keeps its data reachable but does not light up the
 * product surface.
 */
export function resolveNavigation(
  holder: PermissionHolder,
  entitlement: Entitlement,
  entries: readonly NavEntry[] = NAV_ENTRIES,
): ResolvedNavEntry[] {
  const out: ResolvedNavEntry[] = [];
  for (const entry of entries) {
    const decision = can(holder, entitlement, entry.action, "ui");

    if (decision.allowed) {
      out.push({ ...entry, state: "visible", decision });
      continue;
    }
    // A permission gap is silent; an entitlement gap is advertised.
    if (decision.reason === "permission_denied") continue;
    out.push({ ...entry, state: "locked", decision });
  }
  return out;
}

/** The first domain a member can actually open, for post-login landing. */
export function defaultLandingHref(resolved: readonly ResolvedNavEntry[]): string | null {
  return resolved.find((e) => e.state === "visible")?.href ?? null;
}

/** True when nothing at all is reachable - the surface should say so plainly
 * rather than rendering an empty shell. */
export function isFullyLockedOut(resolved: readonly ResolvedNavEntry[]): boolean {
  return resolved.every((e) => e.state !== "visible");
}
