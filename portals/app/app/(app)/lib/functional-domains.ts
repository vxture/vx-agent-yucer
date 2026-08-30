// The five FUNCTIONAL domains - the launcher's map of the product.
//
// WHY THIS IS NOT THE EIGHT-DOMAIN LIST. ADR-001 splits the product into eight
// CAPABILITY domains by object ownership: who owns the row, who may write it.
// That split is a data-governance answer and it is correct for what it decides.
// It is the wrong shape for a person deciding where to go: "delivery" and
// "pipeline" own different tables, but a rep chasing money owed after a win
// crosses both without noticing, and "which of the eight owns this object" is
// not a question anyone standing in front of a menu is asking.
//
// So this file is a SECOND grouping over the same routes, for navigation only.
// It owns no data, gates nothing, and is deliberately derived from the nav
// entries rather than restating them - see DomainModule below.
//
// WHY THESE NAMES (the labels themselves live in messages.ts - see TD-002 for
// why interface text is confined to that file). The product already speaks in
// two registers. One is the RECORD face, using words a traditional CRM also
// uses - accounts, opportunities, projects. The other is the JUDGEMENT face,
// using words only this product uses, and that register is the product's claim
// about itself: a CRM records what you enter, this reads the record and tells
// you what needs deciding.
//
// The domain names are the loudest five words in the interface, so they take
// the second register, and each reuses vocabulary the product already ships
// rather than inventing more. MODULE names stay in the first register on
// purpose: five domain names are read once and remembered, module names are
// clicked daily, and there precision beats stance.
//
// Administration is NOT here. It is reached from the settings icon - it is
// setup, not a battlefield, and listing it beside five business domains would
// say it is a sixth thing you do.

import type { IconName } from "@vxture/design-ui";
import type { ResolvedNavEntry, NavState } from "./navigation";

/**
 * A module is either BUILT or PLANNED, and the two carry different data.
 *
 * A built module names a nav entry and takes its href, icon, action and label
 * from it. It deliberately cannot carry its own - a launcher row and a nav
 * entry describing the same page differently is a drift nothing would catch,
 * and this product has already shipped one nav pointing at five routes that
 * did not exist (see routes.test.ts).
 *
 * A planned module has no destination, so it carries its own icon and label
 * key. It exists in this list because the map is more useful complete: a
 * greyed row for quoting answers "does this product do quotes" with "yes, not
 * yet"; an absent row answers it with "no".
 */
export type DomainModule =
  | { readonly kind: "built"; readonly navKey: string }
  /**
   * BUILT, BUT LIVING INSIDE ANOTHER MODULE'S PAGE.
   *
   * The third kind exists because the first version of this file had only two
   * and therefore told a lie: it marked 赢丢复盘 and 回款计划 as "planned" when
   * both were shipped - the first renders on /pipeline, the second inside
   * /delivery. The mistake was equating "has no route of its own" with "does
   * not exist", and a panel that says a working feature is unbuilt is worse
   * than one that omits it.
   *
   * A section carries the nav key of the page it lives on plus its own anchor,
   * so clicking it lands on that page AND scrolls to the part it named.
   */
  | {
      readonly kind: "section";
      readonly key: string;
      readonly icon: IconName;
      readonly navKey: string;
      readonly anchor: string;
    }
  | { readonly kind: "planned"; readonly key: string; readonly icon: IconName };

export interface FunctionalDomain {
  /** Key into DOMAIN_GROUP_LABEL / DOMAIN_GROUP_QUESTION. */
  readonly key: string;
  readonly icon: IconName;
  readonly modules: readonly DomainModule[];
}

const built = (navKey: string): DomainModule => ({ kind: "built", navKey });
const planned = (key: string, icon: IconName): DomainModule => ({
  kind: "planned",
  key,
  icon,
});
const section = (
  key: string,
  icon: IconName,
  navKey: string,
  anchor: string,
): DomainModule => ({ kind: "section", key, icon, navKey, anchor });

/**
 * Order is the chain the product is built around, upstream to downstream:
 * what we sell -> who we aim at -> how we find them -> how we win -> how the
 * money arrives. A member reading the panel top-left to bottom-right is
 * reading the sales motion in order.
 */
export const FUNCTIONAL_DOMAINS: readonly FunctionalDomain[] = [
  {
    // What we fight with.
    key: "armory",
    icon: "package",
    modules: [
      built("strategy"),
      built("segment"),
      built("catalog"),
      built("solution"),
      built("pricebook"),
    ],
  },
  {
    // Who we aim at, who goes, and who carries the number.
    key: "deployment",
    icon: "users",
    modules: [
      // A page of its own since 2026-08-30. It sat above the target table on
      // /planning because a territory is a PRECONDITION for a regional target;
      // that relationship is still stated there, and the module is now where
      // the menu says it is.
      built("territory"),
      // A page since 2026-08-30. The write path shipped in 6c on
      // /account/[id]; what was missing was the ROSTER - who our named
      // accounts are, together - and a control on a detail page is not a
      // surface.
      built("namedAccount"),
      built("planning"),
      planned("forecastRule", "trend-up"),
    ],
  },
  {
    // Turning fire into leads.
    key: "recon",
    icon: "target",
    modules: [
      built("campaign"),
      built("signal"),
      planned("routing", "user-switch"),
    ],
  },
  {
    // How this one is won.
    key: "position",
    icon: "flag",
    modules: [
      built("account"),
      built("pipeline"),
      built("quote"),
      built("winLossReview"),
    ],
  },
  {
    // How the money actually arrives after a win.
    key: "settlement",
    icon: "coins",
    modules: [
      built("delivery"),
      built("collection"),
      planned("renewal", "file-text"),
    ],
  },
];

/**
 * What sits above the five columns. Just the home stream.
 *
 * THE COPILOT WAS HERE AND IS NOT ANY MORE. It has a page and it is a
 * capability domain (D8), but it is not a place you go: it reads the record and
 * puts what it wants decided into the deck beside whatever you are looking at,
 * into the home stream, and into the panels on the detail pages. A menu entry
 * for it said the opposite - that it is one more feature to remember to open -
 * which is the framing this product exists to reject. It is reached where its
 * output is, which is everywhere.
 *
 * The home stream stays because it IS a destination: it is where you land and
 * what you come back to.
 */
export const CROSSCUTTING_MODULES: readonly DomainModule[] = [built("home")];

/** A module resolved against one member's gates, ready to render. */
export type ResolvedModule =
  | {
      readonly kind: "built";
      readonly key: string;
      readonly icon: IconName;
      readonly href: string;
      readonly state: NavState;
    }
  | {
      readonly kind: "section";
      readonly key: string;
      readonly icon: IconName;
      /** The host page plus the anchor, so the link lands where it says. */
      readonly href: string;
    }
  | { readonly kind: "planned"; readonly key: string; readonly icon: IconName };

export interface ResolvedDomain {
  readonly key: string;
  readonly icon: IconName;
  readonly modules: readonly ResolvedModule[];
}

/**
 * Apply one member's resolved navigation to the map.
 *
 * The gate asymmetry from navigation.ts is preserved rather than re-decided
 * here: an entitlement gap stays visible as `locked` (a door worth buying), a
 * permission gap is DROPPED (a door their colleague can open and they cannot -
 * showing it leaks who-can-do-what and offers them nothing to act on).
 *
 * `resolveNavigation` has already done that filtering, so a built module whose
 * navKey is absent from `nav` was refused on permission, and disappears here
 * by simply not being found.
 */
function resolveModules(
  modules: readonly DomainModule[],
  byKey: ReadonlyMap<string, ResolvedNavEntry>,
): ResolvedModule[] {
  const out: ResolvedModule[] = [];
  for (const m of modules) {
    if (m.kind === "planned") {
      out.push(m);
      continue;
    }
    if (m.kind === "section") {
      // A section inherits its host page's reachability, including silence:
      // if the member cannot open /pipeline, naming a part of /pipeline tells
      // them about a door they still cannot use.
      const host = byKey.get(m.navKey);
      if (!host || host.state !== "visible") continue;
      out.push({
        kind: "section",
        key: m.key,
        icon: m.icon,
        href: `${host.href}#${m.anchor}`,
      });
      continue;
    }
    const entry = byKey.get(m.navKey);
    if (!entry) continue; // permission gap - silent, by design
    out.push({
      kind: "built",
      key: entry.key,
      icon: entry.icon,
      href: entry.href,
      state: entry.state,
    });
  }
  return out;
}

export function resolveFunctionalDomains(
  nav: readonly ResolvedNavEntry[],
): ResolvedDomain[] {
  const byKey = new Map(nav.map((e) => [e.key, e]));
  const out: ResolvedDomain[] = [];
  for (const domain of FUNCTIONAL_DOMAINS) {
    const modules = resolveModules(domain.modules, byKey);
    // A domain whose every built module was refused on permission and which
    // has nothing planned would render as a title over nothing. Drop it.
    if (modules.length === 0) continue;
    out.push({ key: domain.key, icon: domain.icon, modules });
  }
  return out;
}

export function resolveCrosscutting(
  nav: readonly ResolvedNavEntry[],
): ResolvedModule[] {
  return resolveModules(
    CROSSCUTTING_MODULES,
    new Map(nav.map((e) => [e.key, e])),
  );
}

/**
 * Where the domain NAME goes when clicked, and the rule is measured rather
 * than uniform.
 *
 * THE OLD ANSWER WAS "its first reachable module", and that was a quiet lie
 * for three of the five. Clicking 阵地 landed on /account - the same
 * destination as clicking the 客户 row directly underneath it. The name
 * promised a place and delivered one of its parts, chosen by list order, and
 * nothing on the screen said which part it had picked.
 *
 * THE RULE, and it splits the five on evidence rather than on taste:
 *
 *   one route  -> the domain IS that page. deployment is /planning and
 *                 settlement is /delivery; every other row in those columns is
 *                 a section of that same page or unbuilt. Sending the name
 *                 there is not a lie, it is the fact about that domain, and a
 *                 home page would be a door standing in front of a door.
 *
 *   two+ routes -> no single page is the domain, so the name gets a HOME that
 *                 says what crosses its modules. armory (/strategy + /catalog),
 *                 recon (/campaign + /signal) and position (/account +
 *                 /pipeline) each hold two real places and a fact that lives
 *                 between them.
 *
 * A home page earns its existence only by saying something no module page
 * says. The earlier version of this file argued against five landing pages
 * whose whole content would be the module list the reader is already looking
 * at, and that argument still stands - it is why the homes carry cross-module
 * state and why two domains have none.
 */
export const DOMAIN_HOME_PREFIX = "/domain";

/** Routes - not sections, not planned rows - are what makes a domain plural. */
export function routeCount(key: string): number {
  const d = FUNCTIONAL_DOMAINS.find((x) => x.key === key);
  if (!d) return 0;
  return d.modules.filter((m) => m.kind === "built").length;
}

/** The five keys that have a home page, derived from the rule, never listed. */
export const DOMAINS_WITH_HOME: readonly string[] = FUNCTIONAL_DOMAINS.filter(
  (d) => d.modules.filter((m) => m.kind === "built").length >= 2,
).map((d) => d.key);

export function hasHome(key: string): boolean {
  return routeCount(key) >= 2;
}

/**
 * Where the name goes. Null when the domain is kept alive by planned rows
 * alone: a heading that navigates nowhere is worse than one that does not
 * offer to.
 */
export function primaryHref(domain: ResolvedDomain): string | null {
  if (hasHome(domain.key)) return `${DOMAIN_HOME_PREFIX}/${domain.key}`;
  for (const m of domain.modules) {
    if (m.kind === "built" && m.state === "visible") return m.href;
  }
  return null;
}

/**
 * Which of the five you are standing in, from the PATH rather than the nav key.
 *
 * The nav key is the first path segment, which is the domain's own key for a
 * module route (/account -> "account") but is the literal "domain" for a home
 * (/domain/position). Reading only the nav key therefore lost the domain on
 * exactly the page that IS the domain - the module strip vanished on the home
 * it belongs to. The path knows; the key does not.
 */
export function activeDomainFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "domain" && segments[1]) {
    return hasHome(segments[1]) ? segments[1] : null;
  }
  return activeDomainKey(segments[0] ?? "home");
}

/** Which of the five contains the route currently on screen, if any. */
export function activeDomainKey(navKey: string): string | null {
  for (const domain of FUNCTIONAL_DOMAINS) {
    for (const m of domain.modules) {
      if (m.kind === "built" && m.navKey === navKey) return domain.key;
    }
  }
  return null;
}

/**
 * The modules of the domain the given route belongs to, for the second-level
 * nav that shows while you are inside it.
 *
 * Returns the domain KEY alongside them because the nav names the domain -
 * without it the strip is a row of links with no statement about where you
 * are, which is the half that makes it a nav rather than a toolbar.
 */
export function domainOf(
  pathname: string,
  nav: readonly ResolvedNavEntry[],
): ResolvedDomain | null {
  const key = activeDomainFromPath(pathname);
  if (!key) return null;
  return resolveFunctionalDomains(nav).find((d) => d.key === key) ?? null;
}
