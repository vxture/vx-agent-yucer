import { test } from "node:test";
import assert from "node:assert/strict";
import { money } from "../../shared/money";
import { unwrap } from "../../shared/result";
import {
  TARGET_METRICS,
  planTargetCreation,
  planTargetUpdate,
  currencyOf,
  measure,
  scopeKey,
  summaryTarget,
  targetValue,
  unitOf,
  validateTargetScope,
  type PublishedTotals,
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
  targetValue: { unit: "money", amount: 1_000_000, currency: "CNY" },
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
  const t = unwrap(planTargetCreation({ scope: scope(), targetValue: { unit: "money", amount: 500_000, currency: "CNY" } }));
  assert.equal(t.status, "draft");
  assert.equal(t.targetValue.amount, 500_000);
});

test("a second target for the same scope is refused by name, not by a constraint error", () => {
  const r = planTargetCreation({
    scope: scope(),
    targetValue: { unit: "money", amount: 1, currency: "CNY" },
    existing: [scope()],
  });
  assert.equal(r.ok === false && r.violations[0].code, "duplicate_scope");
});

test("a different period or metric is a different target, not a duplicate", () => {
  assert.ok(planTargetCreation({ scope: scope({ period: "2026Q4" }), targetValue: { unit: "money", amount: 1, currency: "CNY" }, existing: [scope()] }).ok);
  assert.ok(planTargetCreation({ scope: scope({ metric: "new_logo" }), targetValue: { unit: "count", amount: 1 }, existing: [scope()] }).ok);
});

test("a negative target is refused", () => {
  const r = planTargetCreation({ scope: scope(), targetValue: { unit: "money", amount: -1, currency: "CNY" } });
  assert.equal(r.ok === false && r.violations[0].code, "amount_negative");
});

// --- Updates ----------------------------------------------------------------

test("only the number and the state move", () => {
  assert.ok(planTargetUpdate(target(), { targetValue: { unit: "money", amount: 1_200_000, currency: "CNY" } }).ok);
  assert.ok(planTargetUpdate(target(), { status: "committed" }).ok);
  assert.ok(planTargetUpdate(target(), { planId: "plan_1" }).ok);
});

test("a closed target is frozen", () => {
  // Re-opening it to change the number is how a missed quarter becomes a met one.
  const r = planTargetUpdate(target({ status: "closed" }), { targetValue: { unit: "money", amount: 1, currency: "CNY" } });
  assert.equal(r.ok === false && r.violations[0].code, "target_closed");
});

test("status only moves forward", () => {
  const r = planTargetUpdate(target({ status: "committed" }), { status: "draft" });
  assert.equal(r.ok === false && r.violations[0].code, "status_regression");
  assert.ok(planTargetUpdate(target({ status: "committed" }), { status: "closed" }).ok);
});

test("changing the currency is refused - it changes what was committed", () => {
  const r = planTargetUpdate(target(), { targetValue: { unit: "money", amount: 1_000_000, currency: "USD" } });
  assert.equal(r.ok === false && r.violations[0].code, "currency_mismatch");
});

test("an unknown status is refused", () => {
  const r = planTargetUpdate(target(), { status: "cancelled" as never });
  assert.equal(r.ok === false && r.violations[0].code, "unknown_status");
});

// --- Units and measurement (TD-013, ADR-020) --------------------------------

test("the unit follows the metric, and only new_logo is a count", () => {
  assert.equal(unitOf("new_logo"), "count");
  for (const m of ["revenue", "pipeline", "margin"] as const) {
    assert.equal(unitOf(m), "money", m);
  }
});

test("a count target carries no currency at all", () => {
  const v = targetValue("new_logo", 10, "CNY");
  assert.equal(v.unit, "count");
  assert.equal(currencyOf(v), null);
  // The type is what makes this true rather than the convention: `currency` is
  // not a property of the count branch, so nothing can read one off it.
  assert.equal("currency" in v, false);
});

test("a money target keeps its currency", () => {
  const v = targetValue("revenue", 1_000_000, "USD");
  assert.equal(currencyOf(v), "USD");
});

test("a value whose unit disagrees with its metric is refused", () => {
  const r = planTargetCreation({
    scope: scope({ metric: "new_logo" }),
    targetValue: { unit: "money", amount: 10, currency: "CNY" },
  });
  assert.equal(r.ok === false && r.violations[0].code, "unit_mismatch");
});

test("half a new customer is not a target", () => {
  const r = planTargetCreation({
    scope: scope({ metric: "new_logo" }),
    targetValue: { unit: "count", amount: 2.5 },
  });
  assert.equal(r.ok === false && r.violations[0].code, "count_not_integer");
});

const totals = (over: Partial<PublishedTotals> = {}): PublishedTotals => ({
  closedAmount: money(2_700_000),
  pipelineAmount: money(1_580_000),
  newLogoCount: 3,
  ...over,
});

test("revenue is measured against what CLOSED", () => {
  const m = measure(target({ metric: "revenue" }), totals());
  assert.equal(m.kind, "measured");
  assert.equal(m.kind === "measured" && m.achieved.amount, 2_700_000);
  assert.equal(m.kind === "measured" && m.ratio, 2.7);
});

test("pipeline is measured against the PIPELINE, not against closings", () => {
  // The defect this whole change exists for: every metric used closedAmount, so
  // a pipeline-building target was scored by how much of the pipeline had
  // already stopped being pipeline.
  const m = measure(target({ metric: "pipeline" }), totals());
  assert.equal(m.kind === "measured" && m.achieved.amount, 1_580_000);
});

test("a new-logo target is measured in customers, and the ratio is a count ratio", () => {
  const t = target({
    metric: "new_logo",
    targetValue: { unit: "count", amount: 10 },
  });
  const m = measure(t, totals({ newLogoCount: 3 }));
  assert.equal(m.kind === "measured" && m.achieved.unit, "count");
  assert.equal(m.kind === "measured" && m.achieved.amount, 3);
  assert.equal(m.kind === "measured" && m.ratio, 0.3);
});

test("margin reports that it cannot be measured, rather than a number", () => {
  // Nothing in this product records cost. Before ADR-020 this returned closed
  // revenue over the margin target and rendered it as a percentage.
  const m = measure(target({ metric: "margin" }), totals());
  assert.equal(m.kind === "not_measurable" && m.code, "no_cost_data");
});

test("an uncounted snapshot is not zero new logos", () => {
  const t = target({ metric: "new_logo", targetValue: { unit: "count", amount: 10 } });
  const m = measure(t, totals({ newLogoCount: null }));
  assert.equal(m.kind === "not_measurable" && m.code, "not_counted");
});

test("no snapshot is its own answer, not 0% attained", () => {
  assert.equal(
    measure(target(), null).kind === "not_measurable" &&
      (measure(target(), null) as { code: string }).code,
    "no_snapshot",
  );
});

test("a zero target has no ratio, but is still measured", () => {
  const m = measure(target({ targetValue: { unit: "money", amount: 0, currency: "CNY" } }), totals());
  assert.equal(m.kind, "measured");
  assert.equal(m.kind === "measured" && m.ratio, null);
});

test("a money summary never quotes a count target, even when it is the only one committed", () => {
  // The state the guard exists for: the revenue target is closed for the
  // period, so the only committed workspace target is a headcount. The old
  // inline find took it and the board rendered "10" as 10 wan.
  const committedCount = {
    scopeType: "workspace" as const,
    status: "committed" as const,
    metric: "new_logo" as const,
  };
  assert.equal(summaryTarget([committedCount]), null);

  const revenue = { scopeType: "workspace" as const, status: "committed" as const, metric: "revenue" as const };
  assert.equal(summaryTarget([committedCount, revenue]), revenue, "and it finds the money one past it");
});

test("a summary target must be committed and workspace-scoped", () => {
  const draft = { scopeType: "workspace" as const, status: "draft" as const, metric: "revenue" as const };
  const territory = { scopeType: "territory" as const, status: "committed" as const, metric: "revenue" as const };
  assert.equal(summaryTarget([draft, territory]), null);
});

test("margin's gap names the missing INPUT, not a missing capability", () => {
  // owner, 2026-08-28: the metric stays. `no_cost_data` says cost is not in
  // the model - which is a fact about the data, and something someone can act
  // on. A code meaning "this metric cannot be computed" would tell the reader
  // to stop looking, and then nobody supplies the input.
  const m = measure(target({ metric: "margin" }), totals());
  assert.equal(m.kind === "not_measurable" && m.code, "no_cost_data");
  assert.notEqual(
    m.kind === "not_measurable" && m.code,
    "not_counted",
    "and it is not confused with a snapshot that simply did not count",
  );
});
