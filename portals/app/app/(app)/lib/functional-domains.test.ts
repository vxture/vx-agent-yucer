import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CROSSCUTTING_MODULES,
  DOMAINS_WITH_HOME,
  activeDomainFromPath,
  FUNCTIONAL_DOMAINS,
  activeDomainKey,
  hasHome,
  primaryHref,
  resolveFunctionalDomains,
  routeCount,
  type DomainModule,
} from "./functional-domains";
import { FACT_DOMAINS } from "../domain/[key]/facts";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import {
  resolveNavigation,
  ADMIN_NAV_ENTRIES,
  DOMAIN_NAV_ENTRIES,
  NAV_ENTRIES,
  type ResolvedNavEntry,
} from "./navigation";
import {
  DOMAIN_GROUP_LABEL,
  DOMAIN_GROUP_QUESTION,
  PLANNED_MODULE_LABEL,
} from "./messages";

// The launcher is the ONLY entrance to the domain pages, so the failure this
// file exists to catch is a page that is built, routed, permitted - and absent
// from the one menu that leads to it. Nothing else notices: it type-checks, it
// builds, the route responds, and it is simply unreachable.

const allModules: DomainModule[] = [
  ...FUNCTIONAL_DOMAINS.flatMap((d) => [...d.modules]),
  ...CROSSCUTTING_MODULES,
];

const builtKeys = allModules
  .filter(
    (m): m is Extract<DomainModule, { kind: "built" }> => m.kind === "built",
  )
  .map((m) => m.navKey);

test("every built module points at a real nav entry", () => {
  const known = new Set(NAV_ENTRIES.map((e) => e.key));
  for (const key of builtKeys) {
    assert.ok(
      known.has(key),
      `launcher lists built module "${key}", which is not a nav entry`,
    );
  }
});

/**
 * The copilot is the ONE domain page deliberately absent from the launcher.
 *
 * It is not a place you go - it reads the record and puts what it wants
 * decided into the deck, the home stream and the detail panels. A menu entry
 * said the opposite: that it is one more feature to remember to open.
 *
 * That decision costs something, and this constant is where the cost is
 * booked: its page still exists, so SOMETHING has to lead to it or it is
 * unreachable except by URL. The test below checks the replacement is real
 * rather than trusting the prose above it.
 */
const REACHED_ELSEWHERE: Record<string, string> = {
  copilot: "../components/agent-panel.tsx",
};

test("every domain page is reachable from the launcher, exactly once", () => {
  const listed = builtKeys.filter((k) => k !== "home");

  for (const entry of DOMAIN_NAV_ENTRIES) {
    if (entry.key in REACHED_ELSEWHERE) continue;
    assert.ok(
      listed.includes(entry.key),
      `domain page "${entry.key}" exists but no launcher module points at it - it would be reachable only by URL`,
    );
  }
  assert.equal(
    new Set(listed).size,
    listed.length,
    `a page is listed under two domains: ${listed.join(", ")}`,
  );
});

test("a page kept out of the launcher is reachable from where it says it is", () => {
  // The exemption is only honest if the replacement route exists. Reading the
  // file is crude and it is the point: the claim being checked is "there is a
  // link to /copilot in the assistant panel", and nothing weaker than looking
  // actually checks it. Delete the link and this fails, which is the moment
  // the page would otherwise have gone quietly unreachable.
  const here = dirname(fileURLToPath(import.meta.url));
  for (const [key, where] of Object.entries(REACHED_ELSEWHERE)) {
    const entry = DOMAIN_NAV_ENTRIES.find((e) => e.key === key);
    assert.ok(entry, `no nav entry "${key}"`);
    const source = readFileSync(join(here, where), "utf8");
    assert.ok(
      source.includes(`"${entry.href}"`),
      `"${key}" is exempt from the launcher on the grounds that ${where} links to ${entry.href}, and it does not`,
    );
  }
});

test("administration is not one of the five", () => {
  const adminKeys = new Set(ADMIN_NAV_ENTRIES.map((e) => e.key));
  for (const key of builtKeys) {
    assert.ok(
      !adminKeys.has(key),
      `"${key}" is administration and is reached from the settings icon, not the launcher`,
    );
  }
});

test("a built module never carries a planned label", () => {
  // The invariant messages.ts states about PLANNED_MODULE_LABEL, checked rather
  // than asserted in prose. It held as a CLAIM and failed as data: every one of
  // the ten entries that lived there named a module that had since been built,
  // so none could render - and four had drifted away from the live label
  // without anything noticing, the newest of them opened by a rename in the
  // commit immediately before this one.
  //
  // That is the shape this repo keeps meeting: a second copy of something, kept
  // in a branch no reader reaches. The label map is allowed to be empty and is
  // allowed to grow again; what it may not do is name a page that exists.
  const navKeys = new Set(NAV_ENTRIES.map((e) => e.key));
  const shipped = Object.keys(PLANNED_MODULE_LABEL).filter((k) =>
    navKeys.has(k),
  );
  assert.deepEqual(
    shipped,
    [],
    `${shipped.join(", ")} have pages; their planned labels can never render and will drift`,
  );
});

test("every domain and planned module has a label", () => {
  assert.equal(FUNCTIONAL_DOMAINS.length, 5);
  for (const d of FUNCTIONAL_DOMAINS) {
    assert.ok(DOMAIN_GROUP_LABEL[d.key], `domain "${d.key}" has no label`);
    assert.ok(
      DOMAIN_GROUP_QUESTION[d.key],
      `domain "${d.key}" has no question line`,
    );
  }
  for (const m of allModules) {
    if (m.kind !== "planned") continue;
    assert.ok(
      PLANNED_MODULE_LABEL[m.key],
      `planned module "${m.key}" has no label and would render its raw key`,
    );
  }
});

test("a permission gap drops the row; an entitlement gap keeps it", () => {
  const entry = (
    key: string,
    state: "visible" | "locked",
  ): ResolvedNavEntry => {
    const found = NAV_ENTRIES.find((e) => e.key === key);
    assert.ok(found, `no nav entry "${key}"`);
    return {
      ...found,
      state,
      decision: { allowed: state === "visible" } as never,
    };
  };

  // Only /account is permitted, and it is locked on entitlement.
  const resolved = resolveFunctionalDomains([entry("account", "locked")]);
  const position = resolved.find((d) => d.key === "position");
  assert.ok(position, "the domain holding /account should survive");

  const built = position.modules.filter((m) => m.kind === "built");
  assert.deepEqual(
    built.map((m) => m.key),
    ["account"],
    "pipeline was refused on permission and must not appear",
  );
  assert.equal(built[0]?.kind === "built" ? built[0].state : null, "locked");

  // A domain with nothing permitted and nothing planned would be a heading
  // over an empty column.
  assert.ok(
    !resolved.some((d) => d.modules.length === 0),
    "an empty domain must not render",
  );
});

test("activeDomainKey finds the domain holding a route", () => {
  assert.equal(activeDomainKey("signal"), "recon");
  assert.equal(activeDomainKey("delivery"), "settlement");
  // The copilot is crosscutting on purpose - it belongs to none of the five.
  assert.equal(activeDomainKey("copilot"), null);
});

/** Every `.tsx` under `(app)/`, read once and shared by the guards below. */
const TSX: readonly { readonly file: string; readonly source: string }[] = (() => {
  const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const out: { file: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".tsx"))
        out.push({ file: p, source: readFileSync(p, "utf8") });
    }
  };
  walk(appDir);
  return out;
})();

/** Source of the pages only - a component rendering a sibling is not a route. */
const RENDERED = TSX.filter((f) => !f.file.includes("/components/"))
  .map((f) => f.source)
  .join("\n");

/**
 * A section promises a PLACE on a page, and the anchor has to be there.
 *
 * `section()` resolves to `/{host}#{anchor}`. A `#` that matches no `id`
 * opens the right page and scrolls nowhere, which reads - to the person who
 * clicked it - exactly like the feature not existing. That is the same lie the
 * section form was added to stop telling, one step further in.
 *
 * It shipped that way: 6d relabelled the win/loss review from planned to a
 * section of /pipeline and pointed it at `#winloss`, and no element carried
 * that id. The label became honest and the destination it now promised did
 * not exist.
 */
test("every section anchor exists as an id on some page", () => {
  const ids = new Set<string>();
  for (const { source } of TSX) {
    for (const m of source.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1]);
  }
  const dangling = allModules
    .filter(
      (m): m is Extract<DomainModule, { kind: "section" }> =>
        m.kind === "section",
    )
    .filter((m) => !ids.has(m.anchor))
    .map((m) => `${m.key} -> #${m.anchor}`);
  assert.deepEqual(
    dangling,
    [],
    `these sections link to an anchor no element carries: ${dangling.join(", ")}`,
  );
});

/**
 * The component a module is guarded by, for modules that are already built.
 *
 * Asserted to EXIST. Without that half, a rename leaves a dead name behind
 * that matches nothing and therefore passes forever - see the note on the
 * planned check below, where eleven of twelve names were fiction.
 */
const SHIPPED_AS: Record<string, string> = {
  // `TerritoryPanel`, and the real name matters more here than anywhere else in
  // this map: the planned check looks for the component NAME, so had this
  // stayed in NOT_BUILT as the guessed "TerritoryTable" it would have gone on
  // passing while the surface existed under a different name. That is the
  // blind spot the note below admits to, hit for real.
  territory: "TerritoryPanel",
  winLossReview: "PendingReviews",
  collection: "CollectionsPanel",
  // Three sections since 2026-08-30, one per module page. They shared a
  // component while /catalog was one route with three anchors; each module
  // now names the section that actually renders it, which is what makes this
  // guard able to tell them apart. /catalog's section became ProductRoster on
  // 2026-09-05, when the module page grew its row operations.
  catalog: "ProductRoster",
  renewal: "RenewalTable",
  forecastRule: "ForecastRuleTable",
  solution: "SolutionSection",
  pricebook: "PriceSection",
};

/**
 * What the component WOULD be called if someone built these.
 *
 * Asserted to be rendered by nothing. Building one under this name turns the
 * planned check red, which is the moment the label has to move.
 */
const NOT_BUILT: Record<string, string> = {
  segment: "SegmentTable",
  namedAccount: "NamedAccountRoster",
  routing: "LeadRouting",
  quote: "QuoteEditor",
};

test("the component names this file guards by are real", () => {
  const defined = TSX.map((f) => f.source).join("\n");
  const fiction = Object.entries(SHIPPED_AS)
    .filter(
      ([, c]) =>
        !new RegExp(`export (?:function|const) ${c}\\b`).test(defined),
    )
    .map(([key, c]) => `${key} -> ${c}`);
  assert.deepEqual(
    fiction,
    [],
    `these modules are guarded by a component that does not exist, so the ` +
      `guard cannot fire: ${fiction.join(", ")}`,
  );
});

/**
 * A module that is built must not be labelled planned.
 *
 * This test exists because the panel shipped saying two working features did
 * not exist. 赢丢复盘 renders on /pipeline and 回款管理 renders inside
 * /delivery; both were marked "planned" because neither has a route of its own,
 * and "no route" is not "no feature".
 *
 * The check is crude on purpose: for each planned module, look for a component
 * whose name matches its key and see whether any page renders it. Crude catches
 * the real case - somebody builds the surface and forgets this file.
 *
 * WHAT IT PROVES, AND WHAT IT DOES NOT. It matches a component NAME, so it
 * only fires when the surface is built under the name written above. The first
 * version had one map of twelve names of which ELEVEN matched no component in
 * the repo - it could not have failed. Splitting the names in two and
 * asserting both halves fixes that, but not the case underneath it: a surface
 * built under a name nobody guessed is still invisible here. `namedAccount` is
 * the live example - 6c shipped its write path as `DesignateAccount` on
 * /account/[id]. It stays planned because the MODULE is the roster and the
 * roster does not exist (see the note in functional-domains.ts), but the guard
 * did not decide that, a person did.
 */
test("nothing marked planned is already rendered somewhere", () => {
  const lying: string[] = [];
  for (const m of allModules) {
    if (m.kind !== "planned") continue;
    const component = NOT_BUILT[m.key] ?? SHIPPED_AS[m.key];
    if (!component) continue;
    if (new RegExp(`<${component}\\b`).test(RENDERED)) lying.push(m.key);
  }
  assert.deepEqual(
    lying,
    [],
    `these are marked planned but a page already renders them - mark them "section" or "built": ${lying.join(", ")}`,
  );
});

// --- domain homes: the rule, and the two things that can drift from it ------

test("a domain home exists exactly where the domain holds two or more routes", () => {
  // The rule is measured, never listed: deployment IS /planning and settlement
  // IS /delivery, so a home for either would be a door in front of a door.
  for (const d of FUNCTIONAL_DOMAINS) {
    const routes = d.modules.filter((m) => m.kind === "built").length;
    assert.equal(
      hasHome(d.key),
      routes >= 2,
      `${d.key} has ${routes} route(s); hasHome must follow that, not a hand-kept list`,
    );
  }
  // FIVE since 2026-08-30, and the change came from the modules rather than
  // from an edit here: promoting the six sections to pages gave deployment and
  // settlement a second route each, so the measured rule reached them on its
  // own. The list is asserted, not maintained - if it ever needs hand-editing
  // to pass, the rule stopped being measured.
  assert.deepEqual(
    [...DOMAINS_WITH_HOME].sort(),
    ["armory", "deployment", "position", "recon", "settlement"],
  );
});

test("the domain name never resolves to one of its own module rows", () => {
  // The defect this replaced: clicking 阵地 landed on /account, the same
  // destination as the 客户 row directly under it - a name promising a place
  // and delivering one of its parts, picked by list order.
  const nav: ResolvedNavEntry[] = NAV_ENTRIES.map((e) => ({
    ...e,
    state: "visible" as const,
    decision: { allowed: true } as never,
  }));
  for (const d of resolveFunctionalDomains(nav)) {
    const href = primaryHref(d);
    if (!href) continue;
    const moduleHrefs = d.modules
      .filter((m) => m.kind !== "planned")
      .map((m) => (m as { href: string }).href);
    if (routeCount(d.key) >= 2) {
      assert.equal(
        moduleHrefs.includes(href),
        false,
        `${d.key}'s name lands on one of its own modules (${href})`,
      );
      assert.equal(href, `/domain/${d.key}`);
    } else {
      // One route: the name IS that page, and saying so is the fact about
      // this domain rather than a lie about it.
      assert.ok(moduleHrefs.includes(href), `${d.key} has one route; its name must go there`);
    }
  }
});

test("every domain with a home has a fact assembler, and no assembler is orphaned", () => {
  // Two halves that drift in opposite directions: a home with no facts renders
  // the module list this page was argued against, and an assembler for a
  // domain with no home is code nothing can reach.
  assert.deepEqual([...FACT_DOMAINS].sort(), [...DOMAINS_WITH_HOME].sort());
});

test("the domain is found from a HOME path, not only from a module route", () => {
  // The regression the domain homes introduced: activeKey is the first path
  // segment, which is "domain" on /domain/position - so the module strip
  // vanished on exactly the page that IS the domain.
  assert.equal(activeDomainFromPath("/account"), "position");
  assert.equal(activeDomainFromPath("/domain/position"), "position");
  assert.equal(activeDomainFromPath("/domain/armory"), "armory");
  // Every domain has a home now; a key that is not a domain still has none.
  assert.equal(activeDomainFromPath("/domain/settlement"), "settlement");
  assert.equal(activeDomainFromPath("/domain/nonsense"), null);
  assert.equal(activeDomainFromPath("/"), null);
});

test("all four domain-naming surfaces send the name to the same place", () => {
  // The launcher, the module strip, the board archive and the domain home all
  // print the same five words. A reader who learns where 阵地经营域 goes in
  // one of them must not be surprised by another - so they all read
  // primaryHref rather than each deciding.
  const nav: ResolvedNavEntry[] = NAV_ENTRIES.map((e) => ({
    ...e,
    state: "visible" as const,
    decision: { allowed: true } as never,
  }));
  for (const d of resolveFunctionalDomains(nav)) {
    const href = primaryHref(d);
    assert.ok(href, `${d.key} must have somewhere to go with full access`);
    assert.equal(
      href,
      hasHome(d.key) ? `/domain/${d.key}` : href,
      `${d.key}: the name must go to its home when it has one`,
    );
  }
});

test("the board archive asks primaryHref rather than choosing its own destination", () => {
  // The other three surfaces import primaryHref and are covered by the test
  // above. The board builds its rows itself, so nothing in the type system
  // stops it picking rows[0].href and quietly disagreeing with the launcher
  // about where 阵地经营域 goes. Read the source and hold it to the shared
  // answer - the same textual judge gated.test.ts uses on the catalogue.
  const board = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "board.ts"),
    "utf8",
  );
  const archive = board.slice(board.indexOf("function archiveByDomain"));
  assert.match(
    archive.slice(0, archive.indexOf("\n}")),
    /href: primaryHref\(domain\)/,
    "the board must take the domain's destination from primaryHref, not invent one",
  );
});

// --- The locked row has to say what would unlock it -------------------------

/**
 * A REAL resolution, not a hand-forged decision.
 *
 * The first version of these tests built `decision: { allowed: false, reason:
 * "feature_not_in_tier" }` by hand and asserted on it - and every assertion
 * passed against a fixture that had simply omitted the field under test. Going
 * through resolveNavigation means the Decision is the one the gate actually
 * produces, which is the only version whose `requiredTier` means anything.
 */
function lockedNav(tier: Entitlement["tier"]) {
  return resolveNavigation(
    { permissions: new Set(permissionsForRoles(["sales_leader"])) },
    { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", tier },
  );
}

function builtModules(tier: Entitlement["tier"]) {
  return resolveFunctionalDomains(lockedNav(tier))
    .flatMap((d) => d.modules)
    .filter((m): m is Extract<typeof m, { kind: "built" }> => m.kind === "built");
}

test("a locked module carries the tier that would unlock it", () => {
  // THE DEFECT THIS CLOSES. The launcher rendered "需升级" - you cannot have
  // this, with no way to act on it. `Decision.requiredTier` has always held the
  // answer and nothing carried it as far as a row.
  const locked = builtModules("free").filter((m) => m.state === "locked");
  assert.ok(locked.length > 0, "the free tier must lock something, or this proves nothing");

  for (const m of locked) {
    assert.ok(
      typeof m.requiredTier === "string",
      `${m.key} is locked and names no tier, so the row can only say "unavailable"`,
    );
  }
});

test("the tier named is the LOWEST that unlocks the module, not the current one", () => {
  // "需 ENTERPRISE" on something STARTER already includes would send a reader
  // to buy what they have.
  const byKey = new Map(builtModules("free").map((m) => [m.key, m]));

  const forecast = byKey.get("forecastRule");
  assert.equal(forecast?.state, "locked", "pipeline.forecast is not a free-tier feature");
  assert.equal(forecast?.requiredTier, "pro");

  // And a module the free tier already has names nothing to buy.
  assert.equal(byKey.get("account")?.state, "visible");
});
