import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  DIVISION_TEMPLATES,
  isSystemDivision,
  MARKET_DIVISIONS,
  MARKET_DIVISION_PROVINCES,
} from "./market-division";
import { ALL_PROVINCES } from "./provinces";

/* The preset exists in TWO places and they must agree exactly: incr/0036, which
 * every real database is seeded from, and market-division.ts, which the
 * in-memory store the demo runs on is seeded from.
 *
 * A disagreement does not throw. It produces a demo whose map is grouped one
 * way and a deployment whose map is grouped another, and the screen looks
 * correct in both. The SQL is the authority; these tests read it.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");
const SQL = readFileSync(
  join(ROOT, "deploy/database/ddl/incr/0036_market_division.sql"), "utf8",
);
const SCOPE_SQL = readFileSync(
  join(ROOT, "deploy/database/ddl/incr/0043_market_scope.sql"), "utf8",
);

/* THE AUTHORITY IS TWO INCREMENTS READ IN ORDER. 0036 seeds `east`; 0043
 * rewrites every china code to `CHINA-EAST` and CHECKs the shape from then on.
 * A shipped increment is never edited, so the seed still says `east` and the
 * build says `CHINA-EAST` - and this is the rule that joins them, taken from
 * 0043's own UPDATE rather than assumed. */
function migrated(code: string): string {
  assert.match(
    SCOPE_SQL,
    /SET division_code = 'CHINA-' \|\| upper\(division_code\)/,
    "0043's code migration is the rule this test applies",
  );
  return "CHINA-" + code.toUpperCase();
}

test("the five divisions match the ones the SQL seeds", () => {
  const block = SQL.slice(SQL.indexOf("CROSS JOIN (VALUES"), SQL.indexOf("AS v(code, name, ord)"));
  const rows = [...block.matchAll(/\('([a-z]+)',\s*'([^']+)',\s*(\d+)\)/g)]
    .map((m) => ({ code: migrated(m[1]!), name: m[2]!, sortOrder: Number(m[3]) }));
  assert.equal(rows.length, 5, "东 南 西 北 中 - five, per the owner");
  assert.deepEqual(rows, [...MARKET_DIVISIONS]);
});

test("every province is placed, in exactly one division, in both copies", () => {
  const block = SQL.slice(SQL.indexOf("FROM (VALUES", SQL.indexOf("market_division_province (workspace_id")),
                          SQL.indexOf("AS v(province, code)"));
  const pairs = [...block.matchAll(/\('([^']+)','([a-z]+)'\)/g)];
  const fromSql: Record<string, string> = {};
  for (const [, province, code] of pairs) {
    assert.ok(!(province! in fromSql), `${province} is mapped twice in the SQL`);
    fromSql[province!] = migrated(code!);
  }
  assert.equal(Object.keys(fromSql).length, ALL_PROVINCES.length);
  assert.deepEqual(fromSql, { ...MARKET_DIVISION_PROVINCES });
});

test("the mapping covers the province vocabulary exactly", () => {
  // A province with no division cannot be drilled into and reads on the map as
  // though it were outside the country; one outside the vocabulary can never
  // be selected at all.
  assert.deepEqual(
    Object.keys(MARKET_DIVISION_PROVINCES).sort(),
    [...ALL_PROVINCES].sort(),
  );
});

test("every division named in the mapping is one of the five", () => {
  const codes = new Set(MARKET_DIVISIONS.map((d) => d.code));
  for (const [province, code] of Object.entries(MARKET_DIVISION_PROVINCES)) {
    assert.ok(codes.has(code), `${province} points at unknown division ${code}`);
  }
  // and none of the five is empty - an empty 大区 is a breadcrumb entry that
  // leads to a blank map.
  for (const d of MARKET_DIVISIONS) {
    assert.ok(
      Object.values(MARKET_DIVISION_PROVINCES).includes(d.code),
      `${d.name} has no provinces`,
    );
  }
});

// --- 系统配置 (templates) ---------------------------------------------------

test("both templates place every province, in exactly one division each", () => {
  // The same invariant the primary key enforces on a tenant's own rows. A
  // template that broke it would import a workspace straight into a state the
  // database would then refuse.
  for (const t of DIVISION_TEMPLATES) {
    const codes = new Set(t.divisions.map((d) => d.code));
    assert.deepEqual(
      Object.keys(t.provinces).sort(), [...ALL_PROVINCES].sort(),
      `${t.key} must place all 34`,
    );
    for (const [province, code] of Object.entries(t.provinces)) {
      assert.ok(codes.has(code), `${t.key}: ${province} points at unknown ${code}`);
    }
    for (const d of t.divisions) {
      assert.ok(
        Object.values(t.provinces).includes(d.code),
        `${t.key}: ${d.name} holds nothing`,
      );
    }
  }
});

test("the five-way template is the preset the SQL seeds", () => {
  // Otherwise "import 五分法" would hand a workspace something different from
  // what a fresh database gives it.
  const five = DIVISION_TEMPLATES.find((t) => t.key === "five")!;
  assert.deepEqual([...five.divisions], [...MARKET_DIVISIONS]);
  assert.deepEqual({ ...five.provinces }, { ...MARKET_DIVISION_PROVINCES });
});

test("系统 or 自定义 is derived, and flips the moment a tenant changes anything", () => {
  /* No stored column, so the label cannot drift from the truth. Compared on
     NAME AND PROVINCE SET, not code alone: keeping the code and re-carving the
     ground is a tenant's own decision and must not be labelled as ours. */
  const east = MARKET_DIVISIONS.find((d) => d.code === "CHINA-EAST")!;
  const eastProvinces = Object.entries(MARKET_DIVISION_PROVINCES)
    .filter(([, c]) => c === "CHINA-EAST").map(([p]) => p);

  assert.equal(isSystemDivision("CHINA-EAST", east.name, eastProvinces), true);
  // renamed -> theirs
  assert.equal(isSystemDivision("CHINA-EAST", "东部大区", eastProvinces), false);
  // a province moved out -> theirs
  assert.equal(
    isSystemDivision("CHINA-EAST", east.name, eastProvinces.filter((p) => p !== "山东省")),
    false,
  );
  // a division they invented -> theirs
  assert.equal(isSystemDivision("CHINA-XINJIANG", "新疆基地", ["新疆维吾尔自治区"]), false);
});

test("every shipped code carries its frame, in the shape the database CHECKs", () => {
  // chk_market_division_code_frame: ^[A-Z]{2,8}-[A-Z][A-Z0-9_]*$ and a china
  // code starts with CHINA-. A template that shipped `east` would import a
  // workspace straight into a row the database refuses.
  for (const t of DIVISION_TEMPLATES) {
    for (const d of t.divisions) {
      assert.match(d.code, /^[A-Z]{2,8}-[A-Z][A-Z0-9_]*$/, `${t.key}: ${d.code}`);
      assert.equal(d.code.startsWith("CHINA-"), t.scope === "china", `${t.key}: ${d.code}`);
    }
  }
});

test("the seven-way template speaks the vocabulary territory routing matches on", () => {
  // account.region and territory.regions hold these exact strings; a template
  // that spelled them differently would import a workspace whose divisions
  // route nothing.
  const seven = DIVISION_TEMPLATES.find((t) => t.key === "seven")!;
  assert.deepEqual(
    seven.divisions.map((d) => d.name).sort(),
    ["东北", "华东", "华中", "华北", "华南", "西北", "西南"].sort(),
  );
});
