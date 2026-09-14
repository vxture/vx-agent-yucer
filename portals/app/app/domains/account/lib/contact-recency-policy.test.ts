import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONTACT_RECENCY_POLICY,
  planContactRecencyPolicy,
} from "./contact-recency-policy";

const P = (over: Partial<typeof DEFAULT_CONTACT_RECENCY_POLICY> = {}) => ({
  ...DEFAULT_CONTACT_RECENCY_POLICY,
  ...over,
});

test("the shipped policy is itself valid", () => {
  assert.equal(planContactRecencyPolicy(DEFAULT_CONTACT_RECENCY_POLICY).ok, true);
});

test("each number has a range", () => {
  for (const bad of [0, 366, 1.5]) {
    const q = planContactRecencyPolicy(P({ quietDays: bad }));
    assert.equal(q.ok === false && q.violations[0].code, "quiet_out_of_range", String(bad));
    const s = planContactRecencyPolicy(P({ staleDays: bad === 1.5 ? 22.5 : bad }));
    assert.equal(s.ok === false && s.violations[0].code, "stale_out_of_range", String(bad));
    const c = planContactRecencyPolicy(P({ chainWarmDays: bad }));
    assert.equal(c.ok === false && c.violations[0].code, "chain_warm_out_of_range", String(bad));
  }
  assert.equal(planContactRecencyPolicy(P({ quietDays: 1, staleDays: 2 })).ok, true);
  assert.equal(planContactRecencyPolicy(P({ quietDays: 365, staleDays: 366 })).ok, false);
});

test("stale has to sit above quiet - THE POINT: judgement.ts escalates the quiet card at staleDays", () => {
  const crossed = planContactRecencyPolicy(P({ quietDays: 30, staleDays: 30 }));
  assert.equal(crossed.ok === false && crossed.violations[0].code, "recency_bands_cross");
  const inverted = planContactRecencyPolicy(P({ quietDays: 40, staleDays: 20 }));
  assert.equal(inverted.ok === false && inverted.violations[0].code, "recency_bands_cross");
  assert.equal(planContactRecencyPolicy(P({ quietDays: 20, staleDays: 40 })).ok, true);
});
