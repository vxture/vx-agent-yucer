import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// The horizontal-scrollbar exception in globals.css, and the coupling it rests
// on.
//
// WHAT IT IS FOR. Five of twelve routes were hiding content off the right edge
// with no scrollbar, no cue and no drag target: /pipeline hid 270px of an 868px
// table, then /account 171, /delivery 129, /named 74, /signal 52. The cause was
// ours - a global rule hiding every scrollbar - and the repair narrows that rule
// to the vertical axis. Nothing about that repair is self-announcing if it
// breaks, which is what this guard is for.
//
// WHAT ACTUALLY BREAKS IT. The exception selects on a Tailwind class STRING that
// the design system emits from inside its own bundle - DataTable wraps its table
// in a plain `<div className="overflow-x-auto">` and leans on the native
// scrollbar. We cannot pass a class into that wrapper: DataTable's `className`
// lands on the outer element, not the scroller. So the selector reaches into a
// name we do not own, and a DS upgrade that renames it, drops it, or moves the
// table into `ScrollArea` takes the affordance away again - silently, because a
// selector that matches nothing is not an error. That is the exact failure shape
// this repo keeps meeting, so it gets a guard rather than a comment.
//
// The axis split is not a preference and is asserted below. `scrollbar-width` is
// the only property that suppresses the bar (`::-webkit-scrollbar:horizontal`
// was tried and leaves it gone) and it has NO per-axis form, so the exception
// has to name elements. That makes the breadth of the selector load-bearing in
// both directions: too narrow and the bar stays hidden, too broad and it lands
// on containers that scroll vertically too, putting a vertical bar back on the
// shell - the thing the global rule exists to prevent.

const APP = import.meta.dirname;
const GLOBALS = readFileSync(join(APP, "globals.css"), "utf8");

/** `overflow-x-<value>` values that actually produce a scrollbar. */
const SCROLLABLE = new Set(["auto", "scroll"]);

const CLASS_RE = /overflow-x-([a-z]+)/g;

function overflowXValues(text: string): Set<string> {
  return new Set([...text.matchAll(CLASS_RE)].map((m) => m[1]!));
}

function filesUnder(dir: string, keep: RegExp, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) filesUnder(p, keep, out);
    else if (keep.test(entry)) out.push(p);
  }
  return out;
}

const DS_DIST = [
  join(APP, "..", "node_modules", "@vxture", "design-ui", "dist"),
  join(APP, "..", "node_modules", "@vxture", "design-system", "dist"),
];

const dsText = DS_DIST.flatMap((d) => filesUnder(d, /\.(mjs|cjs|js)$/))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

const ourText = filesUnder(APP, /\.(tsx?|css)$/)
  .filter((f) => !/\.test\.tsx?$/.test(f) && !f.endsWith("globals.css"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

/** The class names globals.css actually reaches, via `[class*="..."]`. */
const covered = new Set(
  [...GLOBALS.matchAll(/\[class\*="(overflow-x-[a-z]+)"\]/g)].map((m) => m[1]!),
);

test("the DS bundles were read at all - guards against a vacuous pass", () => {
  // Every assertion below is over text scraped from node_modules. If the path
  // ever moves, the scrape returns "" and the whole file passes while checking
  // nothing, which is worse than having no guard.
  assert.ok(
    dsText.length > 100_000,
    `read only ${dsText.length} bytes from the DS bundles; the path in DS_DIST is probably wrong`,
  );
  assert.ok(dsText.includes("DataTable"), "the design-ui bundle should define DataTable");
});

test("the DS still scrolls a container horizontally with a plain class", () => {
  // The premise of the whole exception. If this fails the DS has changed how it
  // handles horizontal overflow - most likely by moving to ScrollArea, which
  // draws its own bar and would make our rule dead weight. Re-read DataTable
  // before touching the assertion.
  const scrollable = [...overflowXValues(dsText)].filter((v) => SCROLLABLE.has(v));
  assert.ok(
    scrollable.length > 0,
    "no scrollable overflow-x-* class left in the DS bundles - the exception in globals.css now matches nothing",
  );
});

test("every horizontally-scrolling class in play is covered by the exception", () => {
  // Too narrow, and content goes back to hiding with no cue. Covers OUR source
  // as well as the DS's: a page that hand-rolls a horizontal scroller needs the
  // bar for the same reason a DataTable does.
  const inPlay = [...overflowXValues(`${dsText}\n${ourText}`)].filter((v) => SCROLLABLE.has(v));
  const missing = inPlay.map((v) => `overflow-x-${v}`).filter((c) => !covered.has(c));
  assert.deepEqual(
    missing,
    [],
    `globals.css does not reach ${missing.join(", ")} - those scrollers still have no visible bar`,
  );
});

test("the exception does not reach non-scrolling overflow-x classes", () => {
  // The other direction, and the reason the selector is not just
  // `[class*="overflow-x-"]`. `scrollbar-width` is axis-agnostic: widening this
  // to `overflow-x-hidden` would land on the DS's genuinely dual-axis containers
  // (`overflow-y-auto overflow-x-hidden`) and put a VERTICAL bar back on them,
  // undoing the rule this is an exception to.
  const wrong = [...covered].filter((c) => !SCROLLABLE.has(c.replace("overflow-x-", "")));
  assert.deepEqual(wrong, [], `${wrong.join(", ")} does not scroll; covering it re-exposes vertical bars`);
});

test("the global rule this is an exception to is still there", () => {
  // An exception to a rule that no longer exists is not an exception, it is the
  // only rule - and it would read as "we decided to show scrollbars", which is
  // not what was decided.
  assert.match(GLOBALS, /scrollbar-width:\s*none/, "the global hide is gone; this exception no longer means anything");
  assert.match(GLOBALS, /\*::-webkit-scrollbar\s*\{[^}]*display:\s*none/, "the webkit half of the global hide is gone");
});

test("the exception releases scrollbar-width, which is the property that matters", () => {
  // Not decoration. `::-webkit-scrollbar:horizontal` alone leaves the bar hidden
  // - measured: scrollbar-width still computes to `none` and the gutter stays 0.
  // Releasing scrollbar-width brings it back with that pseudo-class removed
  // entirely, so this declaration is the one doing the work.
  const exception = GLOBALS.slice(GLOBALS.indexOf('[class*="overflow-x-'));
  assert.match(
    exception,
    /scrollbar-width:\s*(thin|auto)/,
    "the exception must release scrollbar-width; the webkit pseudo-element alone does not restore the bar",
  );
});
