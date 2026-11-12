import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmationFingerprint,
  confirmationMatches,
  createForecastConfirmation,
  sameForecastCall,
} from "./forecast-confirmation";
import { planSnapshot } from "../../domains/pipeline/lib/forecast";
const planned = planSnapshot({
  period: "Y2026",
  scope: { scopeType: "workspace", territoryId: null, ownerSub: null },
  currency: "CNY",
  opportunities: [],
});
if (!planned.ok) throw new Error("fixture");
const totals = planned.value;
const basis = [
  {
    metric: "revenue",
    sourceKind: "sales_plan" as const,
    revisionId: "v1",
    lineKey: "t",
    legacyTargetId: null,
    version: 1,
    target: "1000",
    currency: "CNY",
    resolvedAt: "2026-01-01T00:00:00Z",
  },
];
const identity = {
  workspaceId: "ws",
  sub: "me",
  period: "Y2026",
  scopeKey: "workspace",
};

test("confirmation binds workspace, person, scope, period and expiry", () => {
  const c = createForecastConfirmation(
    {
      ...identity,
      currency: "CNY",
      totals,
      basis,
      observedAt: "2026-01-01T00:00:00Z",
    },
    0,
  );
  assert.equal(confirmationMatches(c, identity, 1), true);
  for (const field of ["workspaceId", "sub", "period", "scopeKey"] as const)
    assert.equal(
      confirmationMatches(c, { ...identity, [field]: "other" }, 1),
      false,
    );
  assert.equal(confirmationMatches(c, identity, c.expiresAt), false);
});

test("fresh resolution time does not invalidate confirmation; changed target/version/amount does", () => {
  const original = confirmationFingerprint(totals, basis);
  assert.equal(
    confirmationFingerprint(totals, [{ ...basis[0], resolvedAt: "later" }]),
    original,
  );
  assert.notEqual(
    confirmationFingerprint(totals, [
      { ...basis[0], revisionId: "v2", version: 2 },
    ]),
    original,
  );
  assert.notEqual(
    confirmationFingerprint(totals, [{ ...basis[0], target: "800" }]),
    original,
  );
  assert.notEqual(
    confirmationFingerprint(
      { ...totals, closedAmount: { amount: 10, currency: "CNY" } },
      basis,
    ),
    original,
  );
});

test("a retry acknowledges the same report but cannot revise its call", () => {
  const snapshot = {
    ...totals,
    callAmount: { amount: 123, currency: "CNY" },
    callNote: "reviewed",
  };
  assert.equal(
    sameForecastCall(snapshot, { amount: 123, note: " reviewed " }),
    true,
  );
  assert.equal(
    sameForecastCall(snapshot, { amount: 124, note: "reviewed" }),
    false,
  );
  assert.equal(sameForecastCall(snapshot, { amount: -1 }), false);
});
