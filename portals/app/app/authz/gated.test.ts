import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Every action in the catalogue must actually gate something.
//
// The sibling of domains/shared/wired.test.ts, one layer up. That guard asks
// whether a domain verb has a caller; this one asks whether a declared GATE has
// a verb. Both exist because the same thing happened repeatedly: a piece was
// built, the piece next to it was not, and nothing said so.
//
// It was found by hand. `planning.territory.upsert` had been in this catalogue
// since batch 1, carrying `planning.territory` - one of the nineteen frozen
// feature keys, sold from PRO up - with no service verb, no port method and no
// surface behind it. A paying workspace could read territories that nothing in
// the product could create, and since a territory-scoped target needs a
// territory_id, it could not set a regional target either.
//
// Three more are in the same state (TD-016), and one was deleted rather than
// built: see ADR-022 on project_task. None of them is the OTHER shape -
// a surface that writes without a gate - which was checked at the same time and
// is the reassuring half of the finding.
//
// An ungated action is allowed. It has to be NAMED below with a reason, which
// turns "we forgot" into "we decided, and here is what ends it".

const ROOT = join(import.meta.dirname, "..");

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== "node_modules" && entry !== ".next") sources(p, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

const CATALOGUE = readFileSync(join(ROOT, "authz/actions.ts"), "utf8");
const ACTIONS = [...CATALOGUE.matchAll(/^ {2}"([a-z][a-zA-Z.]+)":\s*\{/gm)].map((m) => m[1]!);

const EVALUATED = new Set<string>();
// Separately: evaluated on the SERVER, which is the only place a gate actually
// stops anything. A component's `can(...)` decides whether to draw a button,
// and hiding a button is not access control - the same distinction PR #26 was
// about when pages reached past services to store handles.
//
// The split is `.tsx` (a React tree: pages and components) against `.ts`
// (services, server actions, authz). NOT "under domains/", which was the first
// attempt and immediately produced a false positive: admin.member.role.assign
// IS gated, in authz/admin.ts, which is server code that happens to live
// somewhere else. A guard that cries wolf costs more than no guard.
const ENFORCED = new Set<string>();
for (const file of sources(ROOT)) {
  if (file.endsWith(join("authz", "actions.ts"))) continue;
  const text = readFileSync(file, "utf8");
  const onServer = file.endsWith(".ts");
  for (const m of text.matchAll(/"([a-z][a-zA-Z]*(?:\.[a-zA-Z]+)+)"/g)) {
    EVALUATED.add(m[1]!);
    if (onServer) ENFORCED.add(m[1]!);
  }
}

/** The actions that WRITE, which are the ones a UI-only gate would leave open. */
const WRITING = [...CATALOGUE.matchAll(/^ {2}"([a-z][a-zA-Z.]+)":\s*\{[^}]*?writes:\s*true/gms)].map(
  (m) => m[1]!,
);

/**
 * Declared but not yet gating anything, each with what ends it.
 *
 * Not a wishlist - a list of gates that describe capabilities this product
 * does not have yet. Deleting an entry means the verb was written; adding one
 * means a new gate was declared ahead of its implementation, which is a
 * decision somebody should have to make on purpose.
 */
const KNOWN_UNGATED: Record<string, string> = {
  // Blocked outside this repo.
  "signal.feed.configure": "batch 5, external signal feed - blocked on the arda contract",
  "copilot.session.open": "agent plane not connected; 问参谋 is disabled in the launcher",
  "copilot.autopilot.enable": "agent plane not connected",
  "copilot.playbook.upsert": "playbooks are read-only until the agent plane lands",
};

test("the catalogue was parsed at all - guards against a silently empty test", () => {
  assert.ok(ACTIONS.length > 50, `expected many actions, parsed ${ACTIONS.length}`);
  assert.ok(EVALUATED.size > 50, `expected many evaluated strings, found ${EVALUATED.size}`);
});

test("every action either gates something or is named as not yet doing so", () => {
  const silent = ACTIONS.filter((a) => !EVALUATED.has(a) && !(a in KNOWN_UNGATED));
  assert.deepEqual(
    silent,
    [],
    `these actions gate nothing and are not named in KNOWN_UNGATED - either wire ` +
      `them up or say why they exist: ${silent.join(", ")}`,
  );
});

test("KNOWN_UNGATED names no action that is now wired", () => {
  // The half that keeps the list from rotting. Without it a name stays after
  // the verb is written, and the list slowly stops describing anything.
  const stale = Object.keys(KNOWN_UNGATED).filter((a) => EVALUATED.has(a));
  assert.deepEqual(stale, [], `these are gating something now - remove them: ${stale.join(", ")}`);
});

test("every WRITING action is gated on the server, not only in the interface", () => {
  // A page deciding whether to render a button is not a gate. The refusal has
  // to live behind the server action, which can be reached without the page
  // ever drawing anything.
  const uiOnly = WRITING.filter(
    (a) => !ENFORCED.has(a) && EVALUATED.has(a) && !(a in KNOWN_UNGATED),
  );
  assert.deepEqual(
    uiOnly,
    [],
    `these writes are checked in the interface and nowhere else, so the server ` +
      `action behind them is open: ${uiOnly.join(", ")}`,
  );
});

test("the writing actions were parsed at all", () => {
  assert.ok(WRITING.length > 15, `expected many writing actions, parsed ${WRITING.length}`);
});

test("KNOWN_UNGATED names no action the catalogue does not declare", () => {
  const ghosts = Object.keys(KNOWN_UNGATED).filter((a) => !ACTIONS.includes(a));
  assert.deepEqual(ghosts, [], `these are not actions at all: ${ghosts.join(", ")}`);
});
