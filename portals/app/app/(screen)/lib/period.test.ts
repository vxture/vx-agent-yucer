import { strict as assert } from "node:assert";
import { test } from "node:test";
import { anchorOf, periodsFor, within } from "./period";

const L = {
  all: "全部",
  year: (y: number) => `${y} 年度`,
  quarter: (y: number, q: number) => `${y}Q${q}`,
};
const NOW = new Date(2026, 8, 7, 11, 30); // 2026-09-07, inside Q3

test("全部 plus the year plus its four quarters, built from the clock", () => {
  // Written down, the list would be right until the new year and then wrong
  // in a way nobody notices until a quarter is missing from the menu.
  const ps = periodsFor(NOW, L);
  assert.deepEqual(ps.map((p) => p.key), ["all", "year", "q1", "q2", "q3", "q4"]);
  assert.deepEqual(ps.map((p) => p.label),
    ["全部", "2026 年度", "2026Q1", "2026Q2", "2026Q3", "2026Q4"]);
});

test("the quarters tile the year exactly, with no gap and no overlap", () => {
  const [, year, ...qs] = periodsFor(NOW, L);
  assert.equal(qs[0]!.from!.getTime(), year!.from!.getTime());
  assert.equal(qs[3]!.to!.getTime(), year!.to!.getTime());
  for (let i = 1; i < 4; i++) {
    assert.equal(
      qs[i]!.from!.getTime(), qs[i - 1]!.to!.getTime(),
      `Q${i + 1} must start exactly where Q${i} ends`,
    );
  }
});

test("the boundary belongs to the later quarter, not to both", () => {
  // Half-open on purpose: the first instant of Q2 counted in Q1 as well would
  // double a deal that closed at midnight on 1 April.
  const [, , q1, q2] = periodsFor(NOW, L);
  const boundary = new Date(2026, 3, 1, 0, 0, 0);
  assert.equal(within(boundary, q1!), false);
  assert.equal(within(boundary, q2!), true);
  assert.equal(within(new Date(2026, 2, 31, 23, 59, 59), q1!), true);
});

test("全部 takes everything, including rows with no date", () => {
  const [all] = periodsFor(NOW, L);
  assert.equal(within(new Date(1999, 0, 1), all!), true);
  assert.equal(within(null, all!), true);
});

test("a row with no date is in no NAMED period", () => {
  // It cannot be placed, and placing it anyway would put an undated row into
  // whichever quarter happened to be selected.
  const [, year, q1] = periodsFor(NOW, L);
  assert.equal(within(null, year!), false);
  assert.equal(within(undefined, q1!), false);
});

test("the rolling windows end where the period does, but never in the future", () => {
  /* 近 12 期 is measured back from an anchor. Under a PAST quarter it has to
     end at that quarter, or the strip reaches forward into weeks the period
     excludes and draws an empty chart beside populated cells. Under a FUTURE
     quarter it must not run ahead of the clock and chart weeks that have not
     happened. */
  const [all, year, q1, , q3, q4] = periodsFor(NOW, L);
  assert.equal(anchorOf(all!, NOW).getTime(), NOW.getTime(), "全部 anchors on now");
  assert.equal(
    anchorOf(q1!, NOW).getTime(), q1!.to!.getTime() - 1,
    "a finished quarter anchors on its own end",
  );
  assert.equal(anchorOf(q3!, NOW).getTime(), NOW.getTime(), "the live quarter anchors on now");
  assert.equal(anchorOf(q4!, NOW).getTime(), NOW.getTime(), "a future quarter cannot run ahead");
  assert.equal(anchorOf(year!, NOW).getTime(), NOW.getTime());
});
