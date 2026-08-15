import { test } from "node:test";
import assert from "node:assert/strict";
import { money } from "../../shared/money";
import { unwrap } from "../../shared/result";
import {
  TARGET_METRICS,
  assertScopeUnchanged,
  planTargetCreation,
  planTargetUpdate,
  scopeKey,
  validateTargetScope,
  type SalesTarget,
  type TargetScope,
} from "./target";

const scope = (over: Partial<TargetScope> = {}): TargetScope => ({
  period: "2026Q3",
  scopeType: "owner",
  territoryId: null,
  ownerSub: "usr_1",
  metric: "revenue",
  ...over,
});

const target = (over: Partial<SalesTarget> = {}): SalesTarget => ({
  ...scope(),
  targetAmount: money(1_000_000),
  status: "draft",
  planId: null,
  ...over,
});

test("the scope tuple is the target's identity", () => {
  const a = scopeKey(scope());
  assert.equal(a, scopeKey(scope()));
  assert.notEqual(a, scopeKey(scope({ period: "2026Q4" })));
  assert.notEqual(a, scopeKey(scope({ metric: "margin" })));
  assert.notEqual(a, scopeKey(scope({ ownerSub: "usr_2" })));
});

test("a scope carries exactly the key its type needs", () => {
  assert.ok(validateTargetScope(scope({ scopeType: "workspace", ownerSub: null })).ok);
  assert.ok(validateTargetScope(scope({ scopeType: "territory", territoryId: "t1", ownerSub: null })).ok);

  const over = validateTargetScope(scope({ scopeType: "workspace" }));
  assert.equal(over.ok === false && over.violations[0].code, "scope_overspecified");

  const under = validateTargetScope(scope({ scopeType: "territory", ownerSub: null }));
  assert.equal(under.ok === false && under.violations[0].code, "scope_incomplete");
});

test("a target needs a period and a known metric", () => {
  assert.equal(validateTargetScope(scope({ period: " " })).ok, false);
  assert.equal(validateTargetScope(scope({ metric: "vibes" as never })).ok, false);
});

test("every declared metric is accepted", () => {
  for (const metric of TARGET_METRICS) {
    assert.ok(validateTargetScope(scope({ metric })).ok, metric);
  }
});

test("a new target starts as a draft", () => {
  const t = unwrap(planTargetCreation({ scope: scope(), targetAmount: money(500_000) }));
  assert.equal(t.status, "draft");
  assert.equal(t.targetAmount.amount, 500_000);
});

test("a second target for the same scope is refused by name, not by a constraint error", () => {
  const r = planTargetCreation({
    scope: scope(),
    targetAmount: money(1),
    existing: [scope()],
  });
  assert.equal(r.ok === false && r.violations[0].code, "duplicate_scope");
});

test("a different period or metric is a different target, not a duplicate", () => {
  assert.ok(planTargetCreation({ scope: scope({ period: "2026Q4" }), targetAmount: money(1), existing: [scope()] }).ok);
  assert.ok(planTargetCreation({ scope: scope({ metric: "new_logo" }), targetAmount: money(1), existing: [scope()] }).ok);
});

test("a negative target is refused", () => {
  const r = planTargetCreation({ scope: scope(), targetAmount: money(-1) });
  assert.equal(r.ok === false && r.violations[0].code, "amount_negative");
});

// --- Updates ----------------------------------------------------------------

test("only the number and the state move", () => {
  assert.ok(planTargetUpdate(target(), { targetAmount: money(1_200_000) }).ok);
  assert.ok(planTargetUpdate(target(), { status: "committed" }).ok);
  assert.ok(planTargetUpdate(target(), { planId: "plan_1" }).ok);
});

test("a closed target is frozen", () => {
  // Re-opening it to change the number is how a missed quarter becomes a met one.
  const r = planTargetUpdate(target({ status: "closed" }), { targetAmount: money(1) });
  assert.equal(r.ok === false && r.violations[0].code, "target_closed");
});

test("status only moves forward", () => {
  const r = planTargetUpdate(target({ status: "committed" }), { status: "draft" });
  assert.equal(r.ok === false && r.violations[0].code, "status_regression");
  assert.ok(planTargetUpdate(target({ status: "committed" }), { status: "closed" }).ok);
});

test("changing the currency is refused - it changes what was committed", () => {
  const r = planTargetUpdate(target(), { targetAmount: money(1_000_000, "USD") });
  assert.equal(r.ok === false && r.violations[0].code, "currency_mismatch");
});

test("an unknown status is refused", () => {
  const r = planTargetUpdate(target(), { status: "cancelled" as never });
  assert.equal(r.ok === false && r.violations[0].code, "unknown_status");
});

test("the identity tuple is not writable, in either naming style", () => {
  for (const key of ["period", "scopeType", "scope_type", "territoryId", "ownerSub", "owner_sub", "metric"]) {
    const r = assertScopeUnchanged({ [key]: "x" });
    assert.equal(r.ok, false, key);
    assert.equal(r.ok === false && r.violations[0].code, "scope_immutable");
  }
  assert.ok(assertScopeUnchanged({ targetAmount: 1, status: "committed", planId: "p" }).ok);
});
