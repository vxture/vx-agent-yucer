import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// A parallel slot KEEPS ITS LAST CONTENT on a client-side move to a route it
// has no page for (default.tsx is only for full loads). The deck is a slot, so
// without a catch-all the side panel of the previous page - its deal, its
// customer, its 记一笔 destination - stays on screen over a page it knows
// nothing about. That shipped: a note written on the deal list was filed on
// the deal opened before it.
//
// The fix is one file; this test is what stops it being deleted as "unused".

const DECK = join(import.meta.dirname, "..", "@deck");

test("the deck slot has a catch-all page and a root page, so no route can show a stale deck", () => {
  const catchAll = join(DECK, "[...rest]", "page.tsx");
  assert.ok(existsSync(catchAll), "@deck/[...rest]/page.tsx is missing - soft navigation will show the previous page's deck");
  const src = readFileSync(catchAll, "utf8");
  assert.match(src, /from "\.\.\/default"/, "the catch-all must render the default deck, not a copy of it");
  assert.match(src, /export const dynamic = "force-dynamic"/, "the deck reads the session - it cannot be static");

  // "/" is not matched by a required catch-all, and an OPTIONAL one cannot sit
  // beside the home page at all (Next refuses to start) - so the root has its own.
  const root = join(DECK, "page.tsx");
  assert.ok(existsSync(root), "@deck/page.tsx is missing - the home page keeps the previous page's deck");
  assert.match(readFileSync(root, "utf8"), /from "\.\/default"/);
});

test("the catch-all is REQUIRED, not optional - [[...x]] stops the app from starting beside the home page", () => {
  assert.ok(!existsSync(join(DECK, "[[...rest]]")), "an optional catch-all collides with '/'");
});

test("default.tsx stays, for the full page load Next still resolves through it", () => {
  assert.ok(existsSync(join(DECK, "default.tsx")));
});
