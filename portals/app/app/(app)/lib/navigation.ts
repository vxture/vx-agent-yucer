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
  | "stack"
  | "graph"
  | "chart-bar"
  | "workflow"
  | "buildings"
  | "lightbulb"
  // The opportunity board. Was "table", which named the SHAPE rather than the
  // meaning - every page in this product is a table - while a pipeline is
  // stages a deal moves through.
  | "kanban"
  | "cube"
  | "sparkles"
  | "settings"
  // The six promoted from sections (2026-08-30). Their icons come from the
  // launcher rows they used to be, so the same module keeps the same glyph in
  // the menu, the launcher and its own page.
  | "chart-pie-slice"
  | "puzzle"
  // Pricing. Was "currency-cny", which pinned a glyph to one currency while
  // the product ships an English dictionary; a balance is also what a floor
  // price IS - the point below which a discount needs a signature.
  | "scales"
  | "map-pin"
  | "clock-counter-clockwise"
  | "wallet"
  | "star"
  | "user-switch"
  // Quoting. Took "file-text" from renewal (below): a receipt is proof that
  // money MOVED, which is the one thing a quote is not.
  | "file-text"
  // Renewal. It carried "file-text" as a launcher row; refresh says the thing
  // the module is actually for, and freed the document glyph for quoting.
  | "refresh"
  // The assault objective itself.
  | "target"
  // Same for the forecast rule.
  | "trend-up";

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
export const DOMAIN_NAV_ENTRIES: readonly NavEntry[] = [
  {
    key: "strategy",
    href: "/strategy",
    icon: "graph",
    action: "strategy.plan.view",
  },
  {
    key: "planning",
    href: "/planning",
    icon: "chart-bar",
    action: "planning.target.view",
  },
  {
    key: "campaign",
    href: "/campaign",
    icon: "workflow",
    action: "campaign.view",
  },
  {
    key: "account",
    href: "/account",
    icon: "buildings",
    action: "account.view",
  },
  { key: "signal", href: "/signal", icon: "lightbulb", action: "signal.view" },
  {
    key: "pipeline",
    href: "/pipeline",
    icon: "kanban",
    action: "pipeline.view",
  },
  {
    key: "delivery",
    href: "/delivery",
    icon: "cube",
    action: "delivery.project.view",
  },
  {
    key: "copilot",
    href: "/copilot",
    icon: "sparkles",
    action: "copilot.playbook.view",
  },
  // D9. Its action carries `feature: null` - the catalogue is not sold
  // separately (ADR-017) - so this entry can never be "locked", only present or
  // absent. That is the correct shape for it: a workspace that has bought
  // anything at all needs to know what it sells.
  {
    key: "catalog",
    href: "/catalog",
    icon: "stack",
    action: "catalog.product.view",
  },

];

/**
 * Where work happens, as opposed to where data lives.
 *
 * Kept OUT of DOMAIN_NAV_ENTRIES so the eight-domain invariant stays an
 * assertion about the product rather than becoming "nine things, one of which
 * is not a domain". D8 (the copilot) remains a domain and stays in that list -
 * what changed is only where the shell PUTS it, which is a presentation
 * decision and does not belong in the product's own inventory.
 *
 * The rearrangement it serves: the copilot used to be the ninth thing in a flat
 * menu, which said it was one more optional feature to remember to click. It is
 * the product. The home stream is its output and it also sits permanently in a
 * column beside the work.
 */
export const WORK_NAV_ENTRIES: readonly NavEntry[] = [
  { key: "home", href: "/", icon: "sparkles", action: "account.view" },
];

/**
 * Administration sits outside the chain, and is kept in its own list so the
 * eight-capability-domain invariant stays assertable rather than becoming "nine
 * things, one of which is not a domain".
 *
 * Its action carries `feature: null`, so no individual FEATURE can lock it - a
 * workspace unable to administer its own members because of its price plan
 * would be a workspace nobody can get into. Base product access still applies,
 * which is what keeps an unsubscribed workspace on the subscribe screen rather
 * than dropping it into a shell containing only this entry.
 */
export const ADMIN_NAV_ENTRIES: readonly NavEntry[] = [
  {
    key: "admin",
    href: "/admin/members",
    icon: "settings",
    action: "admin.member.view",
  },
  {
    key: "adoption",
    href: "/admin/adoption",
    icon: "chart-bar",
    action: "admin.adoption.view",
  },
];

/**
 * Modules that are pages of their own but are NOT capability partitions.
 *
 * Kept out of DOMAIN_NAV_ENTRIES for the same reason admin is: that list is an
 * assertion about the product's nine partitions, and a route guard checks its
 * length. Six more entries in it would turn "nine partitions, each reachable"
 * into "fifteen things, six of which are not partitions" - and the assertion
 * would have been deleted to make room, which is how an invariant dies.
 *
 * Each was a SECTION of a partition's page until 2026-08-30. Owner decision:
 * every module is a page, because with a per-domain menu of three to five
 * entries, two of them landing on the same page with different anchors reads
 * as a broken menu rather than as one screen with parts.
 */
export const MODULE_NAV_ENTRIES: readonly NavEntry[] = [
  // ONE LINE EACH, and that is not merely compactness. Written as eight-line
  // objects these entries are byte-for-byte alike apart from four strings, and
  // the duplication detector read the list as a block repeating itself - 86% on
  // a declarative table whose whole job is to look the same. A table that trips
  // its own tooling for being regular is written in the wrong shape.
  { key: "segment", href: "/segment", icon: "chart-pie-slice", action: "strategy.segment.view" },
  { key: "solution", href: "/solution", icon: "puzzle", action: "catalog.solution.view" },
  { key: "pricebook", href: "/pricebook", icon: "scales", action: "catalog.pricebook.view" },
  { key: "namedAccount", href: "/named", icon: "star", action: "account.view" },
  { key: "territory", href: "/territory", icon: "map-pin", action: "planning.territory.view" },
  { key: "winLossReview", href: "/winloss", icon: "clock-counter-clockwise", action: "pipeline.winloss.view" },
  { key: "quote", href: "/quote", icon: "file-text", action: "pipeline.view" },
  { key: "routing", href: "/routing", icon: "user-switch", action: "signal.lead.view" },
  { key: "collection", href: "/collection", icon: "wallet", action: "delivery.revenue.view" },
  // Gated on the DELIVERY read, not on the pipeline write. Seeing which terms
  // are coming up is a delivery question; opening the deal is a separate gate
  // the page applies to the button alone, so a delivery manager with no
  // pipeline write still sees what is lapsing.
  { key: "renewal", href: "/renewal", icon: "refresh", action: "delivery.project.view" },
  // `pipeline.forecast.view`, and the choice is between two DIFFERENT axes that
  // are easy to blur. Its feature is `pipeline.forecast` (pro tier) and its
  // permission is only `pipeline.read`:
  //
  //   - the TIER half keeps a workspace that has not bought forecasting out of
  //     a page built entirely on it. `pipeline.view` is free tier and would
  //     have given the capability's whole output away.
  //   - the PERMISSION half still lets a rep in, because seeing that the rule
  //     disagrees with them is the point. Applying it needs
  //     `pipeline.forecast.categorize`, which the page puts on the button alone.
  { key: "forecastRule", href: "/forecast", icon: "trend-up", action: "pipeline.forecast.view" },
  // 承诺达成 (owner ruling, 2026-08-31). The three readings that used to float
  // on the board as cards belonging to no module - the quarter's commitment
  // against its target, the coverage behind it, and what the commitment is
  // made of - gathered into one place and given a module of its own.
  //
  // Gated on the pipeline read: the figures are the pipeline's own, rolled up.
  // A member who may see deals may see what they add up to.
  { key: "attainment", href: "/attainment", icon: "target", action: "pipeline.view" },
];

export const NAV_ENTRIES: readonly NavEntry[] = [
  ...WORK_NAV_ENTRIES,
  ...DOMAIN_NAV_ENTRIES,
  ...MODULE_NAV_ENTRIES,
  ...ADMIN_NAV_ENTRIES,
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
export function defaultLandingHref(
  resolved: readonly ResolvedNavEntry[],
): string | null {
  return resolved.find((e) => e.state === "visible")?.href ?? null;
}

/** True when nothing at all is reachable - the surface should say so plainly
 * rather than rendering an empty shell. */
export function isFullyLockedOut(
  resolved: readonly ResolvedNavEntry[],
): boolean {
  return resolved.every((e) => e.state !== "visible");
}

/**
 * WHY nothing is reachable, which decides what to offer.
 *
 * The two causes need opposite remedies and were previously collapsed into one
 * "go subscribe" screen:
 *
 *   no_entitlement - the workspace has not bought anything. Buying is the fix.
 *   no_roles       - the workspace HAS bought, and this member holds no role.
 *                    Telling them to subscribe is worse than useless: they
 *                    cannot fix it by paying, and the thing they need is an
 *                    administrator, not a checkout page.
 *
 * The two are told apart by the shape of `resolved`, and that follows from the
 * gate's own ordering. A permission gap is dropped from the list while an
 * entitlement gap is kept as `locked`, so an EMPTY list means every domain was
 * refused on permission - which is only possible once entitlement has already
 * passed, since the entitlement half is evaluated first.
 */
export type LockoutReason = "no_entitlement" | "no_roles";

export function lockoutReason(
  resolved: readonly ResolvedNavEntry[],
): LockoutReason | null {
  if (!isFullyLockedOut(resolved)) return null;
  return resolved.length === 0 ? "no_roles" : "no_entitlement";
}
