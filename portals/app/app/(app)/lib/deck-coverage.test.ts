import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Parallel slots keep their previous content during unmatched soft navigation.
// Every workspace page needs a matching deck page, including default forwards.
// A global slot catch-all also captures sibling screen/demo route groups under
// Next 16 strict route matching, so the fallback must be scoped explicitly.
const APP = join(import.meta.dirname, "..");
const DECK = join(APP, "@deck");

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("@")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

test("every workspace route matches a deck so soft navigation cannot retain another object's context", () => {
  const missing = pages(APP).map((page) => relative(APP, page))
    .filter((page) => !existsSync(join(DECK, page)));
  assert.deepEqual(missing, []);
});

test("the deck cannot capture sibling demo and screen route groups", () => {
  assert.ok(!existsSync(join(DECK, "[...rest]")));
  assert.ok(!existsSync(join(DECK, "[[...rest]]")));
  for (const route of ["national", "enablement", "strategy-diag", "product-preview", "gate-screens"]) {
    assert.ok(!existsSync(join(DECK, route)), route);
  }
});

test("the default and root decks retain their request-scoped fallback", () => {
  assert.match(readFileSync(join(DECK, "default.tsx"), "utf8"), /export const dynamic = "force-dynamic"/);
  assert.match(readFileSync(join(DECK, "page.tsx"), "utf8"), /from "\.\/default"/);
});
