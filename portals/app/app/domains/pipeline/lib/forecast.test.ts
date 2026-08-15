import { test } from "node:test";
import assert from "node:assert/strict";
import { money } from "../../shared/money";
import { unwrap } from "../../shared/result";
import {
  FORECAST_CATEGORIES,
  accuracy,
  attainment,
  inScope,
  isZero,
  openPipelineTotal,
  planCategoryChange,
  planSnapshot,
  rollUp,
  validateScope,
  type ForecastableOpportunity,
} from "./forecast";

const AT = new Date("2026-08-15T10:00:00Z");

function o(over: Partial<ForecastableOpportunity> = {}): ForecastableOpportunity {
  return {
    id: "opp",
    stage: "propose",
    forecastCategory: "pipeline",
    amount: money(100),
    territoryId: null,
    ownerSub: null,
    ...over,
  };
}

test("the four categories match the spec", () => {
  assert.deepEqual([...FORECAST_CATEGORIES], ["pipeline", "best_case", "commit", "closed"]);
});

// --- Roll-up ----------------------------------------------------------------

test("each opportunity lands in exactly one bucket - the buckets do not nest", () => {
  // A best_case total that quietly contained commit would double-count against
  // a commit total shown beside it.
  const t = unwrap(
    rollUp([
      o({ id: "a", forecastCategory: "commit", amount: money(100) }),
      o({ id: "b", forecastCategory: "best_case", amount: money(50) }),
      o({ id: "c", forecastCategory: "pipeline", amount: money(25) }),
      o({ id: "d", forecastCategory: "closed", amount: money(10), stage: "won" }),
    ]),
  );
  assert.equal(t.commitAmount.amount, 100);
  assert.equal(t.bestCaseAmount.amount, 50);
  assert.equal(t.pipelineAmount.amount, 25);
  assert.equal(t.closedAmount.amount, 10);
});

test("money arithmetic is exact - no floating point drift in a total", () => {
  // 0.1 + 0.2 in floats is the canonical failure; a forecast that disagrees with
  // the sum of its own rows by a cent destroys trust in the whole number.
  const t = unwrap(
    rollUp([
      o({ forecastCategory: "commit", amount: money(0.1) }),
      o({ forecastCategory: "commit", amount: money(0.2) }),
    ]),
  );
  assert.equal(t.commitAmount.amount, 0.3);
});

test("an amount-less opportunity contributes zero rather than vanishing", () => {
  const t = unwrap(rollUp([o({ forecastCategory: "commit", amount: null })]));
  assert.equal(t.commitAmount.amount, 0);
});

test("mixed currencies are refused, never silently added", () => {
  const r = rollUp([
    o({ forecastCategory: "commit", amount: money(100, "CNY") }),
    o({ forecastCategory: "commit", amount: money(100, "USD") }),
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "currency_mismatch");
});

test("an unknown category is refused rather than dropped from the total", () => {
  const r = rollUp([o({ forecastCategory: "maybe" as never })]);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "unknown_forecast_category");
});

test("openPipelineTotal names what it includes so nobody has to guess", () => {
  const t = unwrap(
    rollUp([
      o({ forecastCategory: "commit", amount: money(100) }),
      o({ forecastCategory: "best_case", amount: money(50) }),
      o({ forecastCategory: "pipeline", amount: money(25) }),
      o({ forecastCategory: "closed", amount: money(999), stage: "won" }),
    ]),
  );
  assert.equal(unwrap(openPipelineTotal(t)).amount, 175, "closed is not open pipeline");
});

// --- Scope ------------------------------------------------------------------

test("a scope carries exactly the key its type needs", () => {
  assert.ok(validateScope({ scopeType: "workspace", territoryId: null, ownerSub: null }).ok);
  assert.ok(validateScope({ scopeType: "territory", territoryId: "t1", ownerSub: null }).ok);
  assert.ok(validateScope({ scopeType: "owner", territoryId: null, ownerSub: "usr_1" }).ok);

  const missing = validateScope({ scopeType: "territory", territoryId: null, ownerSub: null });
  assert.equal(missing.ok === false && missing.violations[0].code, "scope_incomplete");

  const extra = validateScope({ scopeType: "workspace", territoryId: "t1", ownerSub: null });
  assert.equal(extra.ok === false && extra.violations[0].code, "scope_overspecified");

  const owned = validateScope({ scopeType: "owner", territoryId: "t1", ownerSub: "usr_1" });
  assert.equal(owned.ok === false && owned.violations[0].code, "scope_overspecified");
});

test("inScope filters by the scope's own key", () => {
  const rows = [
    o({ id: "a", territoryId: "t1", ownerSub: "usr_1" }),
    o({ id: "b", territoryId: "t2", ownerSub: "usr_2" }),
  ];
  assert.equal(inScope(rows, { scopeType: "workspace", territoryId: null, ownerSub: null }).length, 2);
  assert.deepEqual(
    inScope(rows, { scopeType: "territory", territoryId: "t1", ownerSub: null }).map((r) => r.id),
    ["a"],
  );
  assert.deepEqual(
    inScope(rows, { scopeType: "owner", territoryId: null, ownerSub: "usr_2" }).map((r) => r.id),
    ["b"],
  );
});

// --- Snapshot ---------------------------------------------------------------

test("a snapshot carries its scope, period and instant", () => {
  const row = unwrap(
    planSnapshot({
      period: "2026Q3",
      scope: { scopeType: "owner", territoryId: null, ownerSub: "usr_1" },
      opportunities: [o({ ownerSub: "usr_1", forecastCategory: "commit", amount: money(500) })],
      snapshotAt: AT,
    }),
  );
  assert.equal(row.period, "2026Q3");
  assert.equal(row.scopeType, "owner");
  assert.equal(row.ownerSub, "usr_1");
  assert.equal(row.territoryId, null);
  assert.equal(row.snapshotAt, AT);
  assert.equal(row.commitAmount.amount, 500);
});

test("a snapshot only rolls up what its scope covers", () => {
  const row = unwrap(
    planSnapshot({
      period: "2026Q3",
      scope: { scopeType: "owner", territoryId: null, ownerSub: "usr_1" },
      opportunities: [
        o({ ownerSub: "usr_1", forecastCategory: "commit", amount: money(100) }),
        o({ ownerSub: "usr_2", forecastCategory: "commit", amount: money(900) }),
      ],
      snapshotAt: AT,
    }),
  );
  assert.equal(row.commitAmount.amount, 100);
});

test("a snapshot needs a period", () => {
  const r = planSnapshot({
    period: "  ",
    scope: { scopeType: "workspace", territoryId: null, ownerSub: null },
    opportunities: [],
  });
  assert.equal(r.ok === false && r.violations[0].code, "period_required");
});

test("an empty scope still produces a snapshot, of zeroes", () => {
  // A period where nothing was forecast is a fact worth recording; skipping the
  // row would leave a gap indistinguishable from "nobody submitted".
  const row = unwrap(
    planSnapshot({
      period: "2026Q4",
      scope: { scopeType: "workspace", territoryId: null, ownerSub: null },
      opportunities: [],
      snapshotAt: AT,
    }),
  );
  assert.ok(isZero(row.commitAmount));
  assert.ok(isZero(row.closedAmount));
});

// --- Category changes -------------------------------------------------------

test("the three open categories move freely - that judgement is the rep's", () => {
  for (const to of ["pipeline", "best_case", "commit"] as const) {
    const r = planCategoryChange({ stage: "negotiate", forecastCategory: "pipeline" }, to);
    assert.ok(r.ok, `negotiate -> ${to}`);
  }
});

test("category is decoupled from stage - negotiate may still be best_case", () => {
  // Deriving the category from the stage would delete the disagreement that a
  // forecast review exists to surface.
  assert.ok(planCategoryChange({ stage: "negotiate", forecastCategory: "commit" }, "best_case").ok);
  assert.ok(planCategoryChange({ stage: "qualify", forecastCategory: "pipeline" }, "commit").ok);
});

test("closed and terminal stage must agree, in both directions", () => {
  const early = planCategoryChange({ stage: "propose", forecastCategory: "commit" }, "closed");
  assert.equal(early.ok === false && early.violations[0].code, "closed_requires_terminal_stage");

  const late = planCategoryChange({ stage: "won", forecastCategory: "closed" }, "commit");
  assert.equal(late.ok === false && late.violations[0].code, "terminal_requires_closed");

  assert.ok(planCategoryChange({ stage: "won", forecastCategory: "commit" }, "closed").ok);
});

// --- Derived measures -------------------------------------------------------

test("attainment is closed against target", () => {
  assert.equal(unwrap(attainment(money(750), money(1000))), 0.75);
});

test("no target is null, not zero - an unset quota is not a missed one", () => {
  assert.equal(unwrap(attainment(money(750), money(0))), null);
});

test("attainment refuses to compare across currencies", () => {
  const r = attainment(money(750, "CNY"), money(1000, "USD"));
  assert.equal(r.ok === false && r.violations[0].code, "currency_mismatch");
});

test("accuracy compares what actually closed against what was committed", () => {
  // Computable at all only because snapshots are never overwritten.
  assert.equal(unwrap(accuracy({ commitAmount: money(1000) }, money(900))), 0.9);
  assert.equal(unwrap(accuracy({ commitAmount: money(0) }, money(900))), null);
});
