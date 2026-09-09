import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ALL_PROVINCES, PROVINCE_CODE, provinceTag, shortProvince } from "./provinces";
import { CHINA } from "../../(screen)/lib/china-geometry";

// The province vocabulary exists in THREE places and they must agree exactly:
// this module, incr/0035's CHECK constraint, and the screen's map geometry.
//
// 大区 IS NOT ONE OF THEM ANY MORE. The roll-up from a province to its division
// used to live here as a hard-coded seven, which made the carve a property of
// the build; it is per-workspace data now (incr/0036) and is covered by
// market-division.test.ts. What is left here is the vocabulary itself.
//
// A disagreement does not throw. It drops a province from a national total and
// says nothing - which is the whole reason the column is CHECK-constrained in
// the first place, and the reason that constraint is worth testing FROM here
// rather than only against a live database.

const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");
const INCR = join(ROOT, "deploy/database/ddl/incr/0035_account_province.sql");

test("34 provincial-level divisions, no duplicates", () => {
  assert.equal(ALL_PROVINCES.length, 34);
  assert.equal(new Set(ALL_PROVINCES).size, 34);
});

test("the CHECK constraint lists exactly the same names", () => {
  // THE ONE THAT ACTUALLY BITES. If the DDL and this module drift, the database
  // refuses a province the aggregation expects (a write nobody can explain) or
  // accepts one the map has no shape for (a province that vanishes from the
  // roll-up). Parsed from the real file, not a copy.
  const sql = readFileSync(INCR, "utf8");
  const block = sql.slice(sql.indexOf("province IN ("), sql.indexOf("))", sql.indexOf("province IN (")));
  const inSql = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  assert.deepEqual([...inSql].sort(), [...ALL_PROVINCES].sort());
});

test("the map has a shape for every province, and no shape without one", () => {
  /* THE THIRD LEG. The header claims three copies must agree - this module, the
     CHECK constraint, and the map geometry - and the first two were tested while
     the third was asserted. A province in the vocabulary with no shape draws
     nothing and reads as "no business there"; a shape outside the vocabulary can
     never be selected and is dead weight in a 109KB module. */
  const keys = Object.keys(CHINA.provinces);
  assert.deepEqual(
    [...keys].sort(),
    [...ALL_PROVINCES].sort(),
    "the geometry keys and the vocabulary must be the same set",
  );
});





test("short labels stay unambiguous", () => {
  assert.equal(shortProvince("内蒙古自治区"), "内蒙古");
  assert.equal(shortProvince("新疆维吾尔自治区"), "新疆");
  assert.equal(shortProvince("香港特别行政区"), "香港");
  assert.equal(shortProvince("黑龙江省"), "黑龙江");
  // 34 provinces must still be 34 distinct labels after shortening - the map
  // draws these, and two provinces sharing a label is a map that lies.
  const shorts = ALL_PROVINCES.map(shortProvince);
  assert.equal(new Set(shorts).size, 34);
});

test("every province has a distinct two-letter code", () => {
  // The tag in configuration is `JS 江苏`; a province with no code would silently
  // render as a bare name beside 33 coded ones, and two provinces sharing a code
  // would make the tag ambiguous exactly where it is meant to disambiguate.
  const codes = ALL_PROVINCES.map((p) => PROVINCE_CODE[p]);
  assert.equal(codes.filter(Boolean).length, 34);
  assert.equal(new Set(codes).size, 34);
  for (const c of codes) assert.match(c!, /^[A-Z]{2}$/);
});

test("the tag is the code and the short name, in that order", () => {
  assert.equal(provinceTag("江苏省"), "JS 江苏");
  assert.equal(provinceTag("内蒙古自治区"), "NM 内蒙古");
  assert.equal(provinceTag("香港特别行政区"), "HK 香港");
});
