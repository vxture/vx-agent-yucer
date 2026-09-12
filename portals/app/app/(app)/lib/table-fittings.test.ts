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
  "pending-reviews.tsx": "D5 pipeline - not rebuilt yet",
  "pipeline-board.tsx": "D5 pipeline - not rebuilt yet",
  "planning-table.tsx": "D6 planning - not rebuilt yet",
  "proposal-queue.tsx": "D9 copilot - not rebuilt yet",
  "quote-table.tsx": "D5 quote - not rebuilt yet",
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
    const exempt = FITTING_EXEMPTIONS[t.name]?.skip ?? [];
    const has = {
      选择: exempt.includes("选择") || t.text.includes("selectedKeys") || t.text.includes("leadingSpacer"),
      序号: exempt.includes("序号") || t.text.includes("indexStart"),
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

/**
 * Tables where one or more of 选择列 / 序号列 does not apply, by owner
 * decision - not backlog. 操作 is never in this list: every table keeps it.
 * Each entry names WHICH fitting(s) it skips and why, so an entry naming
 * one but relying on the OTHER also being absent stays a bug, not a pass.
 */
const FITTING_EXEMPTIONS: Record<string, { skip: readonly ("选择" | "序号")[]; reason: string }> = {
  "permission-tree.tsx": {
    skip: ["选择", "序号"],
    reason:
      "owner, 2026-09-10: 去掉左侧占位列 (a hierarchical tree of permission " +
      "points is never bulk-selected; the DS's `leadingSpacer` held the " +
      "column's width without offering the control - dead space with extra " +
      "steps) 与 把 xx.xx.xx 直接作为编号 (the tree's own path number - " +
      "05.01.01, each ancestor's ordinal among its siblings - IS this " +
      "table's 编号; the DS's `indexStart` flat 1-N count beside it would " +
      "say nothing new)",
  },
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

test("every registry entry (backlog or by-design) still names a table that exists", () => {
  const names = new Set(TABLES.map((t) => t.name));
  const stale: string[] = [];
  for (const n of Object.keys(NOT_YET_CONVERTED)) if (!names.has(n)) stale.push(`NOT_YET_CONVERTED.${n}`);
  for (const n of Object.keys(ACTIONS_REPLACED)) if (!names.has(n)) stale.push(`ACTIONS_REPLACED.${n}`);
  for (const n of Object.keys(FITTING_EXEMPTIONS)) if (!names.has(n)) stale.push(`FITTING_EXEMPTIONS.${n}`);
  for (const n of Object.keys(WIDTH_EXEMPTIONS)) if (!names.has(n)) stale.push(`WIDTH_EXEMPTIONS.${n}`);
  assert.deepEqual(stale, [], `these listed tables are gone - drop the lines: ${stale.join(", ")}`);
});

// PIN THE EDGES, LEAVE ONE BUSINESS COLUMN AUTO - owner ruling, 2026-09-06
// (see EDGE_COLUMNS's own comment in components/table-fittings.tsx).
//
// Under `table-fixed`, a `w-[...]` width on a header cell is only HONOURED
// while some other column in the same row is left with no `width` at all:
// that column absorbs the slack, and everything with a specified width - the
// 64px edges, a 64px or wider action column, and any business column that
// also states a width - holds exactly what it says. Pin every column and
// there is nothing left to absorb the surplus, so table-fixed shares it out
// PROPORTIONALLY instead and the "fixed" columns grow with the container.
// org-panel.tsx measured this live at 1800px: 选择/序号/操作 came in at
// 73.4px/73.4px/73.5px, not 64px, because its title, tier, children, kind,
// leader and members columns were all pinned and nothing was left over to
// absorb the slack (`max-width` does NOT rescue this - table-fixed's
// column-sizing pass reads a cell's `width` and, once that's absent, hands
// the whole remaining slack to that column without consulting `max-width` at
// all; tried on org-panel's title column first and measured a computed
// maxWidth of 208px next to an actual rendered width of 552px).
//
// THE SAME PHYSICS APPLIES WITHOUT EDGE_COLUMNS. permission-tree.tsx pins
// every column via ACTION_COLUMN alone (no selection/index columns - see
// FITTING_EXEMPTIONS above) and measured the identical defect: 操作 at 96px
// instead of 64px at 1800px, scaled by the exact same 1.5x every other pinned
// column scaled by. So this check runs for any table importing EDGE_COLUMNS
// and/or ACTION_COLUMN, not only the EDGE_COLUMNS ones.
//
// WHAT THIS CANNOT DO: it does not parse a real AST, so "how many business
// columns does this table have" is a text heuristic - it counts `id: "..."`
// occurrences that are paired with a `header:` key close by, which is how
// every column definition in this codebase is written (a row-menu item like
// `{ id: "up", label: ... }` pairs with `label:`, never `header:`, so it does
// not match). The gap between `id:` and `header:` is BOUNDED (at most 200
// characters, not a `*`/`+`) specifically so the pattern cannot backtrack
// unboundedly on a pathological file - CodeQL flagged an earlier version of
// this heuristic (a repeated optional-comment group with `\s*` sitting
// directly against a literal `\n`, which gave the engine many equivalent
// ways to split the whitespace on a failed match) for exponential
// backtracking; a single bounded gap has no such ambiguity. Verified against
// this file's own history: run against org-panel.tsx and permission-tree.tsx
// at the commit before their fix, both are reported as violations; after the
// fix, both pass (and the counts this heuristic finds now match a manual
// column count exactly or over-count only slightly, never under).
function countBusinessColumnDefs(text: string): number {
  const re = /\bid:\s*"[a-zA-Z0-9_]+"[^{}]{0,200}?\bheader:/g;
  return (text.match(re) ?? []).length;
}

function pinnedNthChildWidths(text: string): number[] {
  // `:w-[` only - a `:max-w-[` does not pin the column for table-fixed's
  // column-sizing pass (see the block comment above), so it does not count
  // against "leave one column auto".
  const re = /\[&_thead_th:nth-child\((\d+)\)\]:w-\[/g;
  const found = new Set<number>();
  for (const m of text.matchAll(re)) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

/**
 * Tables where every business column is legitimately pinned - named with the
 * reason, same as every other registry in this file.
 *
 * org-panel.tsx (owner, 2026-09-11: 30%/70% 拆分标题列与其他区，70% 再在业务
 * 列之间均分) pins all seven business columns to percentages that sum to
 * exactly 100%, not six rem values with a gap - the concern this check
 * guards ("a column with no width absorbs the slack, or 选择/序号/操作 grow
 * past 64px") does not apply when there is no gap left to absorb. Measured
 * live at 1800px and 900px: 选择/序号/操作 held exactly 64px both times.
 */
const WIDTH_EXEMPTIONS: Record<string, string> = {
  "org-panel.tsx": "七个业务列百分比之和恰好 100% (30% + 6×11.6667%)，没有缺口需要靠自动列吸收 - 1800px 与 900px 均实测选择/序号/操作仍为 64px (owner, 2026-09-11)",
  "division-panel.tsx": "四个业务列百分比之和恰好 100% (40% + 2×10% + 40%)，同 org-panel.tsx 的理由 - 没有缺口需要靠自动列吸收 (owner, 表格列宽新一轮规则: 首列按业务列数量分档)",
  "role-panel.tsx": "七个业务列百分比之和恰好 100% (30% + 8% + 10% + 10% + 8% + 8% + 26%)，同 org-panel.tsx 的理由 - 之前五个短列固定 rem + 说明列自适应，宽屏下实测说明列被压到 0px，改成全部按比例分 (owner, 表格列宽新一轮规则: 首列按业务列数量分档)",
  /* vocabulary-config.tsx 是泛型共享组件 (8 个调用方复用) - 它自己的源码
     里只写死了一个 `id: "name"` 列定义，正文列（`columns` prop）是调用方
     各自 `...columns` 展开进来的，这条扫描器的 regex 只认单文件里字面出现
     的 `id:"..."` + `header:`，看不见展开进来的那些，才把"1 个业务列全部
     钉死"误判成没有自动列吸收缺口。真实情况：调用方展开进来的列全部走
     DS 自己的 `width: "sm"|"lg"` 档位（不是 nth-child 百分比），从不参与
     这条扫描器数的"钉死列"，所以每个调用方实际上都还留着自动列 - 8 个
     调用方各自在浏览器里量过 (表格列宽新一轮规则)。 */
  "vocabulary-config.tsx": "泛型共享组件，业务列数因调用方而异 - 正文列走 DS width 档位而非 nth-child，扫描器看不到调用方展开进来的列 (owner, 表格列宽新一轮规则: 首列按业务列数量分档公式写在组件里)",
};

const USES_FITTING_WIDTHS = /import\s*\{[^}]*\b(?:EDGE_COLUMNS|ACTION_COLUMN)\b[^}]*\}\s*from\s*"\.\/table-fittings"/;

test("every table pinning EDGE_COLUMNS/ACTION_COLUMN leaves one business column auto", () => {
  const violations: string[] = [];
  for (const t of TABLES) {
    if (t.name in WIDTH_EXEMPTIONS) continue;
    if (!USES_FITTING_WIDTHS.test(t.text)) continue;
    const total = countBusinessColumnDefs(t.text);
    const pinned = pinnedNthChildWidths(t.text);
    if (total > 0 && pinned.length >= total) {
      violations.push(
        `${t.name}: ${pinned.length} column(s) pinned to a fixed width ` +
          `(nth-child ${pinned.join(", ")}) against ~${total} business column(s) found - ` +
          `none left auto, so 选择/序号/操作 will grow past their pinned width under a wide ` +
          `container instead of staying exact (table-fittings.tsx's EDGE_COLUMNS comment)`,
      );
    }
  }
  assert.deepEqual(
    violations,
    [],
    `PIN THE EDGES, LEAVE ONE BUSINESS COLUMN AUTO (table-fittings.tsx, owner ruling 2026-09-06):\n  ${violations.join("\n  ")}`,
  );
});
