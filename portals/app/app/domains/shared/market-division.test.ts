import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  DIVISION_TEMPLATES,
  frameMembers,
  isSystemDivision,
  MARKET_DIVISIONS,
  MARKET_DIVISION_PROVINCES,
  PROVINCE_FRAMES,
  scopeOpen,
  templatesFor,
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

test("every template places its frame's whole ground, in exactly one division each", () => {
  // The same invariant the primary key enforces on a tenant's own rows. A
  // template that broke it would import a workspace straight into a state the
  // database would then refuse. The ground is the FRAME's: all 34 provinces
  // for a china carve, all of 陕西's cities for 陕西三分法.
  for (const t of DIVISION_TEMPLATES) {
    const codes = new Set(t.divisions.map((d) => d.code));
    const ground = frameMembers({ kind: t.scope, code: t.province }).map((m) => m.key);
    assert.ok(ground.length > 0, `${t.key}: its frame has no ground`);
    assert.deepEqual(
      Object.keys(t.members).sort(), [...ground].sort(),
      `${t.key} must place its whole ground`,
    );
    for (const [member, code] of Object.entries(t.members)) {
      assert.ok(codes.has(code), `${t.key}: ${member} points at unknown ${code}`);
    }
    for (const d of t.divisions) {
      assert.ok(
        Object.values(t.members).includes(d.code),
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
  assert.deepEqual({ ...five.members }, { ...MARKET_DIVISION_PROVINCES });
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
  // code starts with CHINA-, a province code with the province's letters. A
  // template that shipped `east` would import a workspace straight into a row
  // the database refuses.
  for (const t of DIVISION_TEMPLATES) {
    const prefix = t.scope === "china" ? "CHINA-" : `${t.province}-`;
    for (const d of t.divisions) {
      assert.match(d.code, /^[A-Z]{2,8}-[A-Z][A-Z0-9_]*$/, `${t.key}: ${d.code}`);
      assert.ok(d.code.startsWith(prefix), `${t.key}: ${d.code} must start with ${prefix}`);
    }
  }
});

// --- 省级市场 - 陕西 first (incr/0045) ---------------------------------------

test("陕西 is the first province frame, carved by city, and it is the only one open", () => {
  // Formal, not an example (owner, 2026-09-09). A province frame is made of
  // prefecture-level CITIES - 陕西看市级 - and there are ten of them.
  assert.deepEqual(PROVINCE_FRAMES.map((f) => f.code), ["SN"]);
  const sn = PROVINCE_FRAMES[0]!;
  assert.equal(sn.province, "陕西省");
  assert.equal(sn.adcode, "610000");
  assert.equal(sn.cities.length, 10);
  for (const c of sn.cities) {
    assert.match(c.code, /^61\d{2}00$/, `${c.name}: a prefecture-level code under 610000`);
    assert.ok(c.name.endsWith("市") && !c.short.endsWith("市"), `${c.name} / ${c.short}`);
  }
  assert.equal(scopeOpen({ kind: "province", code: "SN" }), true);
  assert.equal(scopeOpen({ kind: "province", code: "GD" }), false, "广东 is not open yet");
  assert.equal(scopeOpen({ kind: "province", code: null }), false);
  assert.equal(scopeOpen({ kind: "global", code: null }), false);
  assert.equal(scopeOpen({ kind: "china", code: null }), true);
});

test("the frame's ground is what a region may hold: 34 provinces, or 陕西's ten cities", () => {
  assert.deepEqual(
    frameMembers({ kind: "china", code: null }).map((m) => m.key),
    [...ALL_PROVINCES],
  );
  const cities = frameMembers({ kind: "province", code: "SN" });
  assert.deepEqual(cities.map((m) => m.label), ["西安", "铜川", "宝鸡", "咸阳", "渭南", "延安", "汉中", "榆林", "安康", "商洛"]);
  assert.deepEqual(frameMembers({ kind: "province", code: "GD" }), [], "an unopened province has no ground");
  assert.deepEqual(frameMembers({ kind: "global", code: null }), []);
});

test("a frame is offered only its own carves", () => {
  assert.deepEqual(templatesFor({ kind: "china", code: null }).map((t) => t.key), ["five", "seven"]);
  assert.deepEqual(templatesFor({ kind: "province", code: "SN" }).map((t) => t.key), ["shaanxi-three"]);
  assert.deepEqual(templatesFor({ kind: "province", code: "GD" }), []);
  // And 陕西三分法 is the carve everybody agrees on: 关中 / 陕北 / 陕南.
  const three = DIVISION_TEMPLATES.find((t) => t.key === "shaanxi-three")!;
  assert.deepEqual(three.divisions.map((d) => d.name), ["关中", "陕北", "陕南"]);
  const by = (code: string) => Object.entries(three.members).filter(([, c]) => c === code).map(([k]) => k);
  assert.deepEqual(by("SN-SHAANBEI").sort(), ["610600", "610800"], "延安 榆林");
  assert.deepEqual(by("SN-SHAANNAN").sort(), ["610700", "610900", "611000"], "汉中 安康 商洛");
  assert.equal(by("SN-GUANZHONG").length, 5);
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
