import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ENTRY_TARGETS } from "./entry";
import { NAV_ENTRIES } from "../../(app)/lib/navigation";
import { ACTIONS } from "../../authz/actions";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "(app)");

test("all six cards have a destination, and none is claimed twice", () => {
  assert.equal(ENTRY_TARGETS.length, 6);
  assert.equal(new Set(ENTRY_TARGETS.map((t) => t.key)).size, 6);
});

test("every destination is a page that exists", () => {
  // The failure this catches is invisible everywhere else: a link to a route
  // nobody built type-checks, builds and renders perfectly, right up until
  // somebody clicks it.
  for (const t of ENTRY_TARGETS) {
    const page = join(APP_DIR, t.href.replace(/^\//, ""), "page.tsx");
    assert.ok(existsSync(page), `${t.key} points at ${t.href}, which has no page.tsx`);
  }
});

test("each card is gated on the action its own destination declares", () => {
  /* THE ONE THAT ACTUALLY BITES. Gating a link on this screen's permissions
     rather than the destination's produces a button that appears and then
     leads to a refusal - the reader has been told they may go somewhere they
     may not. Two of the six are not in this screen's own gate set at all:
     /copilot wants copilot.playbook.view and /collection delivery.revenue.view.

     Checked against the navigation catalogue, which is what the routes
     themselves are built from, so the two cannot drift apart. */
  const byHref = new Map(NAV_ENTRIES.map((e) => [e.href, e]));
  for (const t of ENTRY_TARGETS) {
    const nav = byHref.get(t.href);
    assert.ok(nav, `${t.href} is not in the navigation catalogue`);
    assert.equal(
      t.action, nav.action,
      `${t.key} is gated on ${t.action} but ${t.href} enforces ${nav.action}`,
    );
  }
});

test("every action named is a real permission", () => {
  // A typo would gate on an action nobody holds, hiding the link from
  // everyone - a defect that looks exactly like "the feature is off".
  const known = new Set(Object.keys(ACTIONS));
  for (const t of ENTRY_TARGETS) {
    assert.ok(known.has(t.action), `${t.action} is not in the permission catalogue`);
  }
});
