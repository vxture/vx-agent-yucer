import { test } from "node:test";
import assert from "node:assert/strict";
import { diffClaims, moreOptimisticThanRule, slippageOf, type ClaimState } from "./claims";

const AT = new Date("2026-09-25T00:00:00Z");
const base: ClaimState = {
  amount: 1_000_000,
  currency: "CNY",
  expectedCloseAt: new Date("2026-10-20T00:00:00Z"),
  forecastCategory: "commit",
  probability: 70,
};
const ctx = { source: "manual" as const, actorSub: "usr_me", reason: "  客户预算会推迟  ", occurredAt: AT };

test("only what changed is written, normalised, with who and why", () => {
  const events = diffClaims(base, { ...base, expectedCloseAt: new Date("2026-11-09T00:00:00Z"), amount: 1_000_000.004 }, ctx);
  assert.deepEqual(events.map((e) => [e.field, e.fromValue, e.toValue]), [["expected_close_at", "2026-10-20", "2026-11-09"]]);
  assert.equal(events[0].reason, "客户预算会推迟");
  assert.equal(events[0].actorSub, "usr_me");
});

test("an unchanged save writes nothing; null is a value (unpriced, no date)", () => {
  assert.deepEqual(diffClaims(base, { ...base }, ctx), []);
  const cleared = diffClaims(base, { ...base, amount: null, expectedCloseAt: null }, ctx);
  assert.deepEqual(cleared.map((e) => [e.field, e.toValue]), [["amount", null], ["expected_close_at", null]]);
});

test("slippage counts later moves only, sums their days, flags a quarter crossed, and counts lost dates apart", () => {
  const s = slippageOf([
    { field: "expected_close_at", fromValue: "2026-10-05", toValue: "2026-10-20" },
    { field: "expected_close_at", fromValue: "2026-10-20", toValue: "2026-11-09" },
    { field: "expected_close_at", fromValue: "2026-11-09", toValue: "2026-11-01" },
    { field: "expected_close_at", fromValue: "2026-11-01", toValue: null },
    { field: "expected_close_at", fromValue: null, toValue: "2026-12-01" },
    { field: "amount", fromValue: "1.00", toValue: "2.00" },
  ]);
  assert.deepEqual(s, { pushes: 2, pushedDays: 35, crossedQuarter: false, datesLost: 1 });
  assert.equal(slippageOf([{ field: "expected_close_at", fromValue: "2026-09-28", toValue: "2026-10-02" }]).crossedQuarter, true);
});

test("a reason is owed only when the category is more optimistic than the rule's", () => {
  assert.equal(moreOptimisticThanRule("commit", "best_case"), true);
  assert.equal(moreOptimisticThanRule("best_case", "pipeline"), true);
  assert.equal(moreOptimisticThanRule("pipeline", "commit"), false);
  assert.equal(moreOptimisticThanRule("commit", "commit"), false);
  assert.equal(moreOptimisticThanRule("commit", null), false);
  assert.equal(moreOptimisticThanRule("closed", "pipeline"), false);
});
