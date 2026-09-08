import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { MARKET_DIVISIONS, MARKET_DIVISION_PROVINCES } from "./market-division";
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

test("the five divisions match the ones the SQL seeds", () => {
  const block = SQL.slice(SQL.indexOf("CROSS JOIN (VALUES"), SQL.indexOf("AS v(code, name, ord)"));
  const rows = [...block.matchAll(/\('([a-z]+)',\s*'([^']+)',\s*(\d+)\)/g)]
    .map((m) => ({ code: m[1]!, name: m[2]!, sortOrder: Number(m[3]) }));
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
    fromSql[province!] = code!;
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
