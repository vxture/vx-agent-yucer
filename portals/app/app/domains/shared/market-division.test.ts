import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  DIVISION_TEMPLATES,
  frameMembers,
  isPseudoCity,
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

  assert.equal(isSystemDivision(DIVISION_TEMPLATES, "CHINA-EAST", east.name, eastProvinces), true);
  // renamed -> theirs
  assert.equal(isSystemDivision(DIVISION_TEMPLATES, "CHINA-EAST", "东部大区", eastProvinces), false);
  // a province moved out -> theirs
  assert.equal(
    isSystemDivision(DIVISION_TEMPLATES, "CHINA-EAST", east.name, eastProvinces.filter((p) => p !== "山东省")),
    false,
  );
  // a division they invented -> theirs
  assert.equal(isSystemDivision(DIVISION_TEMPLATES, "CHINA-XINJIANG", "新疆基地", ["新疆维吾尔自治区"]), false);
});

test("every shipped code carries its frame, in the shape the database CHECKs", () => {
  // chk_market_division_code_frame (0046): ^[A-Z]{2,8}-[A-Z0-9][A-Z0-9_]*$ and
  // a china code starts with CHINA-, a province code with the province's
  // letters. A template that shipped `east` would import a workspace straight
  // into a row the database refuses.
  for (const t of DIVISION_TEMPLATES) {
    const prefix = t.scope === "china" ? "CHINA-" : `${t.province}-`;
    for (const d of t.divisions) {
      assert.match(d.code, /^[A-Z]{2,8}-[A-Z0-9][A-Z0-9_]*$/, `${t.key}: ${d.code}`);
      assert.ok(d.code.startsWith(prefix), `${t.key}: ${d.code} must start with ${prefix}`);
    }
  }
});

// --- 省级市场 - 陕西 first (incr/0045) ---------------------------------------

test("every provincial-level division with ground below it is a frame, carved by its own unit", () => {
  // Owner, 2026-09-09: 全国的都加上; the ground is the table's (0038), via
  // province-frames.ts. 34 minus the three with nothing below them.
  assert.equal(PROVINCE_FRAMES.length, 31);
  const codes = new Set(PROVINCE_FRAMES.map((f) => f.code));
  for (const missing of ["TW", "HK", "MO"]) assert.ok(!codes.has(missing), `${missing} has no ground`);
  const by = (code: string) => PROVINCE_FRAMES.find((f) => f.code === code)!;
  assert.deepEqual([by("SN").units.length, by("SC").units.length, by("HA").units.length], [10, 21, 17]);
  // A municipality is carved by DISTRICT - it has no cities under it.
  for (const m of ["BJ", "TJ", "SH", "CQ"]) assert.equal(by(m).unit, "district", m);
  assert.equal(by("BJ").units[0]!.short, "东城");
  assert.equal(by("SN").unit, "city");
  for (const f of PROVINCE_FRAMES) {
    assert.ok(f.units.length > 0, `${f.province}: no ground`);
    for (const u of f.units) {
      assert.ok(u.code.startsWith(f.adcode.slice(0, 2)), `${u.name} under ${f.adcode}`);
      assert.ok(!isPseudoCity(u.code), `${u.name} is a filing row, not a place`);
      if (u.name.endsWith("市")) assert.ok(!u.short.endsWith("市"), `${u.name} / ${u.short}`);
    }
  }
  assert.equal(isPseudoCity("419000"), true, "省直辖县级行政区划");
  assert.equal(isPseudoCity("110100"), true, "市辖区 under 北京");
  assert.equal(isPseudoCity("610100"), false, "西安 - the same digits under 陕西");
  assert.equal(isPseudoCity("410100"), false);
  assert.equal(scopeOpen({ kind: "province", code: "SN" }), true);
  assert.equal(scopeOpen({ kind: "province", code: "BJ" }), true);
  assert.equal(scopeOpen({ kind: "province", code: "TW" }), false, "台湾 has no ground yet");
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
  assert.deepEqual(frameMembers({ kind: "province", code: "TW" }), [], "an unopened province has no ground");
  assert.equal(frameMembers({ kind: "province", code: "CQ" }).length, 38, "重庆: 26 districts and 12 counties");
  assert.deepEqual(frameMembers({ kind: "global", code: null }), []);
});

test("a frame is offered only its own carves", () => {
  assert.deepEqual(templatesFor(DIVISION_TEMPLATES, { kind: "china", code: null }).map((t) => t.key), ["five", "seven"]);
  assert.deepEqual(
    templatesFor(DIVISION_TEMPLATES, { kind: "province", code: "SN" }).map((t) => t.key),
    ["shaanxi-three", "sn-units"],
    "the traditional carve, then one region per unit",
  );
  assert.deepEqual(templatesFor(DIVISION_TEMPLATES, { kind: "province", code: "SC" }).map((t) => t.key), ["sichuan-five", "sc-units"]);
  assert.deepEqual(templatesFor(DIVISION_TEMPLATES, { kind: "province", code: "HA" }).map((t) => t.key), ["henan-five", "ha-units"]);
  // A province with no traditional carve typed yet still has the by-unit one.
  assert.deepEqual(templatesFor(DIVISION_TEMPLATES, { kind: "province", code: "ZJ" }).map((t) => t.key), ["zj-units"]);
  // The six typed carves, in table order; each places its whole province -
  // the generic template test proves the placement.
  assert.deepEqual(
    PROVINCE_FRAMES.filter((f) => f.traditional).map((f) => f.code),
    ["JS", "HA", "HN", "GD", "SC", "SN"],
  );
  // Every carve carries the name the table has - the mirror is checked
  // against yucer_ref.market_carve by market-carve.db.test.ts.
  for (const t of DIVISION_TEMPLATES) assert.ok(t.name.length > 0, `${t.key} has no name`);
  assert.equal(DIVISION_TEMPLATES.find((t) => t.key === "bj-units")!.name, "北京各区独立");
  assert.equal(DIVISION_TEMPLATES.find((t) => t.key === "sn-units")!.name, "陕西各市独立");
  assert.equal(DIVISION_TEMPLATES.length, 2 + 6 + 31);
  // 四川五区 and 河南五分法 each hold their whole province - the generic
  // template test proves it; these pin the reading the owner can veto.
  const sc = DIVISION_TEMPLATES.find((t) => t.key === "sichuan-five")!;
  assert.deepEqual(sc.divisions.map((d) => d.name), ["成都平原", "川南", "川东北", "攀西", "川西北"]);
  const ha = DIVISION_TEMPLATES.find((t) => t.key === "henan-five")!;
  assert.deepEqual(ha.divisions.map((d) => d.name), ["豫中", "豫北", "豫东", "豫西", "豫南"]);
  // And 陕西三分法 is the carve everybody agrees on: 关中 / 陕北 / 陕南.
  const three = DIVISION_TEMPLATES.find((t) => t.key === "shaanxi-three")!;
  assert.deepEqual(three.divisions.map((d) => d.name), ["关中", "陕北", "陕南"]);
  const by = (code: string) => Object.entries(three.members).filter(([, c]) => c === code).map(([k]) => k);
  assert.deepEqual(by("SN-SHAANBEI").sort(), ["610600", "610800"], "延安 榆林");
  assert.deepEqual(by("SN-SHAANNAN").sort(), ["610700", "610900", "611000"], "汉中 安康 商洛");
  assert.equal(by("SN-GUANZHONG").length, 5);
  // 各市独立: ten cities, ten regions, each holding exactly its own city, in
  // GB/T 2260 order, coded by ADCODE - the shape 0046 CHECKs.
  const units = DIVISION_TEMPLATES.find((t) => t.key === "sn-units")!;
  assert.equal(units.divisions.length, 10);
  assert.deepEqual(units.divisions.slice(0, 2), [
    { code: "SN-610100", name: "西安", sortOrder: 1 },
    { code: "SN-610200", name: "铜川", sortOrder: 2 },
  ]);
  assert.equal(units.members["610100"], "SN-610100");
  assert.equal(new Set(Object.values(units.members)).size, 10, "no two cities share a region");
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
