import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// 表格三件标配 - owner ruling, 2026-09-06.
//
// Every table carries a 选择列, a 序号列 and a right-pinned 操作列, and the
// action column is there even when the reader has nothing to do in it. The
// rule is about the GRID: two tables in this product should not disagree
// about where things sit, and a column that appears for one reader and not
// another is the same disagreement inside one table.
//
// WHAT THIS ASKS, and what it deliberately cannot:
//   - `selectedKeys` (or the DS `leadingSpacer`, which holds that column's
//     width without offering the control) - checked.
//   - `indexStart` - checked.
//   - `rowActions` PRESENT AS A PROP - checked. Whether it is present for
//     every READER is a runtime question a text scan cannot answer, so the
//     second rule below reads the one thing that gives it away: a
//     `rowActions={...}` whose value is a conditional ending in `undefined`.
//     `RowActions` (components/table-fittings.tsx) is how a table renders the
//     empty case instead - an empty, disabled DS trigger.
//
// TABLES NOT YET CONVERTED ARE NAMED, NOT EXEMPTED. Every entry below belongs
// to a module the sidebar rebuild has not reached; the batch that rebuilds it
// converts its tables and deletes the line. A name still here when its module
// has been rebuilt is a miss, not a decision.

const LIB = import.meta.dirname;
const COMPONENTS = join(LIB, "..", "components");

/**
 * Tables whose module has not been rebuilt yet.
 *
 * The five 战略武备域 modules were converted with the ruling (2026-09-06):
 * product-roster, catalog-type-config, catalog-status-config, solution-roster,
 * segment-roster, plan-roster, price-book. 战果沉淀域 is being converted a
 * module at a time and renewal-roster was the first. Everything below is in a
 * domain whose turn has not come.
 */
const NOT_YET_CONVERTED: Record<string, string> = {
  "account-table.tsx": "D4 account - not rebuilt yet",
  "batch-completeness.tsx": "D4 account - not rebuilt yet",
  "campaign-table.tsx": "D3 campaign - not rebuilt yet",
  "contact-roster.tsx": "D4 account - not rebuilt yet",
  "execution-panel.tsx": "D3 campaign - not rebuilt yet",
  "lead-list.tsx": "D5 pipeline - not rebuilt yet",
  "line-editor.tsx": "D5 pipeline - not rebuilt yet",
  "member-roles.tsx": "admin - not rebuilt yet",
  "pending-reviews.tsx": "D5 pipeline - not rebuilt yet",
  "pipeline-board.tsx": "D5 pipeline - not rebuilt yet",
  "planning-table.tsx": "D6 planning - not rebuilt yet",
  "proposal-queue.tsx": "D9 copilot - not rebuilt yet",
  "quote-table.tsx": "D5 quote - not rebuilt yet",
  "routing-table.tsx": "D5 routing - not rebuilt yet",
  "territory-panel.tsx": "D2 territory - not rebuilt yet",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const TABLES = walk(COMPONENTS)
  .filter((p) => p.endsWith(".tsx") && !p.endsWith(".test.tsx"))
  .map((p) => ({ name: relative(COMPONENTS, p), text: readFileSync(p, "utf8") }))
  .filter((f) => f.text.includes("<DataTable"));

test("the sweep found the tables at all - guards against an empty run", () => {
  assert.ok(TABLES.length > 20, `expected many tables, found ${TABLES.length}`);
});

test("every converted table carries the three standard fittings", () => {
  const missing: string[] = [];
  for (const t of TABLES) {
    if (t.name in NOT_YET_CONVERTED) continue;
    const has = {
      选择: t.text.includes("selectedKeys") || t.text.includes("leadingSpacer"),
      序号: t.text.includes("indexStart"),
      操作: t.text.includes("rowActions"),
    };
    const gaps = Object.entries(has)
      .filter(([, ok]) => !ok)
      .map(([k]) => k);
    if (gaps.length > 0) missing.push(`${t.name} lacks ${gaps.join(" / ")}`);
  }
  assert.deepEqual(
    missing,
    [],
    `每张表都要有 选择列 / 序号列 / 操作列 (owner, 2026-09-06):\n  ${missing.join("\n  ")}`,
  );
});

/**
 * Tables that drop `rowActions` for a reason, named rather than exempted.
 *
 * There is exactly one, and it is not a table without operations: the
 * catalogue's SORT variant moves the operations into a regular trailing
 * column so each reorder stays one click (the 新建与排序同一页面 ruling), and
 * the 64px single-trigger slot would then be a SECOND operations column on
 * the same row. The fitting is satisfied by the column that replaced it.
 */
const ACTIONS_REPLACED: Record<string, string> = {
  "product-roster.tsx":
    "the sort variant puts 上移/下移 in a regular trailing column; the 64px slot would be a second one",
};

// The half of the ruling that is easy to lose: the column has to survive a
// reader who cannot act. A `rowActions` bound to `canWrite ? ... : undefined`
// is exactly the shape that does not.
test("the action column does not vanish for a reader who cannot act", () => {
  const vanishing: string[] = [];
  for (const t of TABLES) {
    if (t.name in NOT_YET_CONVERTED || t.name in ACTIONS_REPLACED) continue;
    // A `rowActions` prop whose value can be undefined, or a
    // `const rowActions = cond ? fn : undefined` feeding one.
    if (
      /rowActions\s*=\s*\{[^}]*\bundefined\b/.test(t.text) ||
      /\n\s*(?::|\?)\s*undefined;\n/.test(t.text.slice(t.text.indexOf("const rowActions")))
    ) {
      vanishing.push(t.name);
    }
  }
  assert.deepEqual(
    vanishing,
    [],
    `操作列即使没有操作项也要占位 - render <RowActions items={[]} /> instead of ` +
      `dropping the prop:\n  ${vanishing.join("\n  ")}`,
  );
});

test("every not-yet-converted entry still names a table that exists", () => {
  const names = new Set(TABLES.map((t) => t.name));
  const stale = Object.keys(NOT_YET_CONVERTED).filter((n) => !names.has(n));
  assert.deepEqual(stale, [], `these listed tables are gone - drop the lines: ${stale.join(", ")}`);
});
