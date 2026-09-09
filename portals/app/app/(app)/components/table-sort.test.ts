import { strict as assert } from "node:assert";
import { test } from "node:test";
import { sortRowsBy } from "./table-fittings";

// 列排序的两条判断 - both are decisions rather than mechanics, and neither is
// visible from the screen once the data happens to be tidy. The collections
// table's blanks all sit in its sibling table, so clicking 实收 there never
// exercises rule 1 at all (checked in the browser, 2026-09-07).

type Row = { v: string | number | null | undefined };
const rows = (...vs: Row["v"][]): Row[] => vs.map((v) => ({ v }));
const read = (r: Row) => r.v;
const out = (list: readonly Row[]) => list.map((r) => r.v);

test("numbers order numerically, not as text", () => {
  // The bug this catches: "1000" < "9" as strings.
  const asc = sortRowsBy(rows(9, 1000, 80), read, "asc");
  assert.deepEqual(out(asc), [9, 80, 1000]);
  const desc = sortRowsBy(rows(9, 1000, 80), read, "desc");
  assert.deepEqual(out(desc), [1000, 80, 9]);
});

test("empty sorts LAST in both directions - a missing value is not a small one", () => {
  const asc = sortRowsBy(rows(30, null, 10, undefined, 20, ""), read, "asc");
  assert.deepEqual(out(asc).slice(0, 3), [10, 20, 30]);
  assert.equal(out(asc).slice(3).every((v) => v === null || v === undefined || v === ""), true);

  // The half that a naive "nulls are -Infinity" implementation gets wrong.
  const desc = sortRowsBy(rows(30, null, 10, undefined, 20, ""), read, "desc");
  assert.deepEqual(out(desc).slice(0, 3), [30, 20, 10]);
  assert.equal(out(desc).slice(3).every((v) => v === null || v === undefined || v === ""), true);
});

test("Chinese orders by pinyin, not by code unit", () => {
  /* 阿里巴巴 / 北方通信 is the pair that DISCRIMINATES, and picking it took a
     failed attempt: 长江/北方/华东 sort identically under both rules, so the
     first version of this test passed while proving nothing. 阿 is U+963F and
     北 is U+5317, so code units put 北方 first while pinyin (a < b) puts 阿里
     first - the orders genuinely disagree, and only one is the one a reader
     scanning a column expects. */
  const sample = ["北方通信", "阿里巴巴"];
  const asc = sortRowsBy(rows(...sample), read, "asc");
  assert.deepEqual(out(asc), ["阿里巴巴", "北方通信"]);
  assert.deepEqual([...sample].sort(), ["北方通信", "阿里巴巴"]);
  assert.notDeepEqual(out(asc), [...sample].sort());
});

test("the input array is not mutated", () => {
  const input = rows(3, 1, 2);
  const copy = out(input);
  sortRowsBy(input, read, "asc");
  assert.deepEqual(out(input), copy);
});
