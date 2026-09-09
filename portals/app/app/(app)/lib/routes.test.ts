import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DOMAIN_NAV_ENTRIES, NAV_ENTRIES } from "./navigation";
import { DOMAIN_LABEL } from "./messages";

// Every navigation entry must have a page behind it.
//
// This exists because the failure it catches is invisible in every other check:
// a nav entry pointing at a route nobody built type-checks, builds, and renders
// perfectly - right up until a member clicks it and gets a 404. The eight-domain
// nav shipped before five of its destinations did, and nothing failed.

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
/* TWO SURFACE GROUPS (2026-09-07). A nav href resolves under (app) OR (screen):
   the situation screen is a page of this product with an entry in the rail, but
   it deliberately does not wear the shell, so its file lives in the other group.
   Checking only (app) would have reported a working link as a 404. */
const SCREEN_DIR = join(APP_DIR, "..", "(screen)");

test("every nav entry has a page file", () => {
  for (const entry of NAV_ENTRIES) {
    const segment = entry.href.replace(/^\//, "");
    const candidates = [
      join(APP_DIR, segment, "page.tsx"),
      join(SCREEN_DIR, segment, "page.tsx"),
    ];
    assert.ok(
      candidates.some((c) => existsSync(c)),
      `nav entry "${entry.key}" points at ${entry.href} but no page.tsx exists under (app) or (screen)`,
    );
  }
});

test("every nav entry has a display label", () => {
  // A missing label falls back to the raw key, which ships as "pipeline" in a
  // Chinese interface rather than failing.
  for (const entry of NAV_ENTRIES) {
    assert.ok(
      DOMAIN_LABEL[entry.key],
      `nav entry "${entry.key}" has no label in DOMAIN_LABEL`,
    );
  }
});

test("all nine capability partitions are reachable from the nav", () => {
  // Nine since 2026-08-26: the catalogue (ADR-017).
  assert.equal(DOMAIN_NAV_ENTRIES.length, 9);
  assert.deepEqual(DOMAIN_NAV_ENTRIES.map((e) => e.key).sort(), [
    "account",
    "campaign",
    "catalog",
    "copilot",
    "delivery",
    "pipeline",
    "planning",
    "signal",
    "strategy",
  ]);
});
