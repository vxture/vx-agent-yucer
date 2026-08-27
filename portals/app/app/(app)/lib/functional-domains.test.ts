import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CROSSCUTTING_MODULES,
  FUNCTIONAL_DOMAINS,
  activeDomainKey,
  resolveFunctionalDomains,
  type DomainModule,
} from "./functional-domains";
import {
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

/**
 * A module that is built must not be labelled planned.
 *
 * This test exists because the panel shipped saying two working features did
 * not exist. 赢丢复盘 renders on /pipeline and 回款计划 renders inside
 * /delivery; both were marked "planned" because neither has a route of its own,
 * and "no route" is not "no feature".
 *
 * The check is crude on purpose: for each planned module, look for a component
 * whose name matches its key and see whether any page renders it. Crude catches
 * the real case - somebody builds the surface and forgets this file.
 */
test("nothing marked planned is already rendered somewhere", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const appDir = join(here, "..");

  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".tsx")) pages.push(p);
    }
  };
  walk(appDir);
  const rendered = pages
    .filter((f) => !f.includes("/components/"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  // key -> the component that would render it, if it existed.
  const COMPONENT: Record<string, string> = {
    winLossReview: "PendingReviews",
    collection: "InstalmentList",
    quote: "QuoteEditor",
    namedAccount: "NamedAccountControl",
    territory: "TerritoryTable",
    segment: "SegmentTable",
    catalog: "ProductTable",
    solution: "SolutionList",
    pricebook: "PriceBook",
    forecastRule: "ForecastRuleTable",
    routing: "LeadRouting",
    renewal: "RenewalTable",
  };

  const lying: string[] = [];
  for (const m of allModules) {
    if (m.kind !== "planned") continue;
    const component = COMPONENT[m.key];
    if (!component) continue;
    if (new RegExp(`<${component}\\b`).test(rendered)) lying.push(m.key);
  }
  assert.deepEqual(
    lying,
    [],
    `these are marked planned but a page already renders them - mark them "section" or "built": ${lying.join(", ")}`,
  );
});
