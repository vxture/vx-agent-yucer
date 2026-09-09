import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// 二级页面必须有面包屑 (owner, 2026-09-08).
//
// A page one segment deep is a module: the menu highlights it and the shell
// says where you are. A page BELOW that has neither - the board is gone on a
// detail page, and inside 配置管理 the sidebar names the section but not the
// form you opened from it - so the page has to answer "where am I" itself.
//
// WHY A GUARD RATHER THAN A CONVENTION. Two pages carried a hand-written
// breadcrumb for months (account detail, deal detail) while fourteen others
// had none, and nothing said so: a missing crumb is invisible to everyone
// except the person who is lost. The rule is worth having only if adding the
// fifteenth page cannot forget it.
//
// PARALLEL ROUTES ARE NOT PAGES in this sense: @deck/* renders into the deck
// slot beside whatever page is open, and a breadcrumb inside a dock panel
// would describe a place the reader is not.

const APP = join(import.meta.dirname, "..");

/**
 * Nested routes that deliberately carry no crumb, with the reason.
 *
 * Empty, and that is the point of writing it down: the next entry has to
 * argue for itself in this file rather than being an omission nobody sees.
 */
const NO_CRUMB: Record<string, string> = {};

function pages(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) pages(p, out);
    else if (e === "page.tsx") out.push(p);
  }
  return out;
}

const nested = pages(APP)
  .map((p) => ({ route: relative(APP, p).replace(/\/page\.tsx$/, ""), file: p }))
  .filter((r) => r.route.includes("/") && !r.route.startsWith("@"));

test("the sweep found the nested routes at all", () => {
  assert.ok(nested.length > 15, `expected many nested routes, found ${nested.length}`);
});

test("every second-level page shows where it is", () => {
  const missing = nested
    .filter((r) => !(r.route in NO_CRUMB))
    .filter((r) => !readFileSync(r.file, "utf8").includes("<PageCrumbs"))
    .map((r) => r.route);
  assert.deepEqual(
    missing.sort(),
    [],
    `二级页面需要面包屑 - these render none:\n  ${missing.join("\n  ")}`,
  );
});

test("the crumb is the shared binding, not a hand-rolled one", () => {
  // The DS Breadcrumb family is fine to use - through components/page-crumbs.
  // Used directly in a page, it is fourteen lines that drift: the two that
  // did it took their parent's name from two different dictionaries.
  const raw = nested
    .filter((r) => /<Breadcrumb\b/.test(readFileSync(r.file, "utf8")))
    .map((r) => r.route);
  assert.deepEqual(raw.sort(), [], `use <PageCrumbs>: ${raw.join(", ")}`);
});
