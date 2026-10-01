import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPeriod, offeredPeriods, periodYearOf, quartersOf, resolvePeriod } from "./periods";

// THESE TESTS NAME THEIR OWN DATE. The file they replace passed a literal
// "2026Q3" as the default and was true until 2026-10-01; a test that reads the
// clock would only move the same fault to a day nobody is watching. Every
// assertion here gives `now` explicitly.

const D = (iso: string) => new Date(`${iso}T12:00:00Z`);
const Q3 = D("2026-08-15");
const Q4 = D("2026-10-01");

// resolvePeriod is an ALLOWLIST, not a parser, and that is the whole point:
// the value it returns goes on into a query. Its own comment says a
// hand-edited `?period=` must not become an arbitrary string, so these are the
// tests for that sentence rather than for the happy path.

test("every period the control offers survives the round trip", () => {
  for (const now of [Q3, Q4, D("2027-01-02")]) {
    const { quarters, year } = offeredPeriods(now);
    for (const p of [...quarters, year]) {
      assert.equal(resolvePeriod(p, now), p, `${p} is offered on ${now.toISOString()} and must be honoured`);
    }
  }
});

test("anything not on the list becomes the default, never itself", () => {
  // The injection shapes a `?period=` would actually carry. None of them is
  // rejected with an error - the control has no way to show one - so the
  // guarantee is that the caller gets a known-good value back regardless.
  for (const hostile of [
    "2026Q5",
    "2026q1",
    " 2026Q1",
    "2026Q1'",
    "'; DROP TABLE opportunity; --",
    "__proto__",
    "constructor",
    "2024Q1", // two years back: not offered, not honoured
  ]) {
    assert.equal(resolvePeriod(hostile, Q4), defaultPeriod(Q4), `${hostile} must not pass through`);
  }
});

test("absent and empty both mean the default", () => {
  assert.equal(resolvePeriod(undefined, Q4), "2026Q4");
  assert.equal(resolvePeriod("", Q4), "2026Q4");
});

test("the default is the quarter today is in - it moves on the first day of a quarter", () => {
  assert.equal(defaultPeriod(D("2026-09-30")), "2026Q3");
  assert.equal(defaultPeriod(D("2026-10-01")), "2026Q4", "the day this file used to go stale");
  assert.equal(defaultPeriod(D("2026-12-31")), "2026Q4");
  assert.equal(defaultPeriod(D("2027-01-01")), "2027Q1", "and across the year");
});

test("the default is itself on the list the control offers", () => {
  // Otherwise the fallback would be a value the control cannot offer, and the
  // selector would open on an option that is not in it.
  for (const now of [Q3, Q4, D("2027-01-02"), D("2026-01-01"), D("2026-12-31")]) {
    assert.ok(offeredPeriods(now).quarters.includes(defaultPeriod(now)), `default on ${now.toISOString()}`);
  }
});

test("the control offers the current year's four quarters and its roll-up", () => {
  assert.deepEqual(offeredPeriods(Q4), { quarters: ["2026Q1", "2026Q2", "2026Q3", "2026Q4"], year: "Y2026" });
  assert.deepEqual(offeredPeriods(D("2027-01-02")).quarters, ["2027Q1", "2027Q2", "2027Q3", "2027Q4"], "2027 has periods to offer");
});

test("last year stays honoured, though not offered - January's review of Q4", () => {
  const jan = D("2027-01-05");
  assert.equal(resolvePeriod("2026Q4", jan), "2026Q4");
  assert.equal(resolvePeriod("Y2026", jan), "Y2026");
  assert.ok(!offeredPeriods(jan).quarters.includes("2026Q4"));
});

test("the periods are identifiers, not copy - ASCII only", () => {
  // The file exists because these lived in messages.ts and looked translatable.
  // A "translated" 2026Q1 is a query parameter the server no longer accepts, on
  // one locale only. Pinning the shape is what keeps them out of a dictionary.
  for (const p of [...quartersOf(2026), periodYearOf(2026)]) {
    assert.match(p, /^[A-Z0-9]+$/, `${p} must stay an identifier`);
  }
});
