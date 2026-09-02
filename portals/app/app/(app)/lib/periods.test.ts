import { test } from "node:test";
import assert from "node:assert/strict";
import { PERIODS, PERIOD_YEAR, DEFAULT_PERIOD, resolvePeriod } from "./periods";

// resolvePeriod is an ALLOWLIST, not a parser, and that is the whole point:
// the value it returns goes on into a query. Its own comment says a
// hand-edited `?period=` must not become an arbitrary string, so these are the
// tests for that sentence rather than for the happy path.

test("every period the control offers survives the round trip", () => {
  for (const p of [...PERIODS, PERIOD_YEAR]) {
    assert.equal(resolvePeriod(p), p, `${p} is offered by the control and must be honoured`);
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
  ]) {
    assert.equal(resolvePeriod(hostile), DEFAULT_PERIOD, `${hostile} must not pass through`);
  }
});

test("absent and empty both mean the default", () => {
  assert.equal(resolvePeriod(undefined), DEFAULT_PERIOD);
  assert.equal(resolvePeriod(""), DEFAULT_PERIOD);
});

test("the default is itself on the allowlist", () => {
  // Otherwise the fallback would be a value the control cannot offer, and the
  // selector would open on an option that is not in it.
  assert.ok(
    [...PERIODS, PERIOD_YEAR].includes(DEFAULT_PERIOD as (typeof PERIODS)[number]),
    "the fallback must be a period the control can display",
  );
});

test("the periods are identifiers, not copy - ASCII only", () => {
  // The file exists because these lived in messages.ts and looked translatable.
  // A "translated" 2026Q1 is a query parameter the server no longer accepts, on
  // one locale only. Pinning the shape is what keeps them out of a dictionary.
  for (const p of [...PERIODS, PERIOD_YEAR]) {
    assert.match(p, /^[A-Z0-9]+$/, `${p} must stay an identifier`);
  }
});
