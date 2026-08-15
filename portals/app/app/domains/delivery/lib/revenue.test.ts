import { test } from "node:test";
import assert from "node:assert/strict";
import { money } from "../../shared/money";
import { unwrap } from "../../shared/result";
import {
  REVENUE_STATUSES,
  assertSequenceUnchanged,
  deriveProjectHealth,
  isOverdue,
  milestoneProgress,
  planRevenueTransition,
  summarizeCollections,
  type RevenueInstalment,
  type RevenueStatus,
} from "./revenue";

const NOW = new Date("2026-08-15T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function inst(over: Partial<RevenueInstalment> = {}): RevenueInstalment {
  return {
    sequence: 1,
    status: "planned",
    plannedAmount: money(1000),
    actualAmount: null,
    dueAt: daysAhead(30),
    settledAt: null,
    ...over,
  };
}

// --- The instalment machine -------------------------------------------------

test("the happy path is planned -> invoiced -> settled", () => {
  assert.equal(unwrap(planRevenueTransition(inst(), "invoiced")).status, "invoiced");
  const settled = unwrap(
    planRevenueTransition(inst({ status: "invoiced" }), "settled", { actualAmount: money(1000), at: NOW }),
  );
  assert.equal(settled.status, "settled");
  assert.equal(settled.settledAt, NOW);
});

test("settling requires the amount that actually arrived", () => {
  // Without it, planned-versus-actual is uncomputable - the one number this
  // table exists to produce.
  const r = planRevenueTransition(inst({ status: "invoiced" }), "settled");
  assert.equal(r.ok === false && r.violations[0].code, "actual_amount_required");
});

test("a settled amount may differ from the planned one - that gap is the point", () => {
  const short = unwrap(
    planRevenueTransition(inst({ status: "invoiced" }), "settled", { actualAmount: money(850), at: NOW }),
  );
  assert.equal(short.actualAmount?.amount, 850);
});

test("settling in another currency is refused", () => {
  const r = planRevenueTransition(inst({ status: "invoiced" }), "settled", { actualAmount: money(1000, "USD") });
  assert.equal(r.ok === false && r.violations[0].code, "currency_mismatch");
});

test("a negative settlement is refused", () => {
  const r = planRevenueTransition(inst({ status: "invoiced" }), "settled", { actualAmount: money(-5) });
  assert.equal(r.ok === false && r.violations[0].code, "amount_negative");
});

test("overdue is recoverable in both directions", () => {
  assert.ok(planRevenueTransition(inst({ status: "overdue" }), "invoiced").ok);
  assert.ok(
    planRevenueTransition(inst({ status: "overdue" }), "settled", { actualAmount: money(1000) }).ok,
  );
});

test("settled and written_off are terminal", () => {
  for (const from of ["settled", "written_off"] as RevenueStatus[]) {
    for (const to of REVENUE_STATUSES) {
      const r = planRevenueTransition(inst({ status: from, actualAmount: money(1000) }), to);
      assert.equal(r.ok, false, `${from} -> ${to}`);
    }
  }
});

test("anything unpaid can be written off", () => {
  for (const from of ["planned", "invoiced", "overdue"] as RevenueStatus[]) {
    assert.ok(planRevenueTransition(inst({ status: from }), "written_off").ok, from);
  }
});

test("an unknown status is refused", () => {
  const r = planRevenueTransition(inst(), "forgiven" as RevenueStatus);
  assert.equal(r.ok === false && r.violations[0].code, "unknown_status");
});

// --- Overdue detection ------------------------------------------------------

test("overdue is derived from the due date, not only from the stored status", () => {
  assert.equal(isOverdue(inst({ dueAt: daysAgo(1) }), NOW), true);
  assert.equal(isOverdue(inst({ dueAt: daysAhead(1) }), NOW), false);
  assert.equal(isOverdue(inst({ dueAt: null }), NOW), false);
});

test("settled and written-off instalments are never overdue", () => {
  assert.equal(isOverdue(inst({ status: "settled", dueAt: daysAgo(30) }), NOW), false);
  assert.equal(isOverdue(inst({ status: "written_off", dueAt: daysAgo(30) }), NOW), false);
});

// --- Collections ------------------------------------------------------------

test("collections summarize planned against collected", () => {
  const s = unwrap(
    summarizeCollections(
      [
        inst({ sequence: 1, status: "settled", plannedAmount: money(1000), actualAmount: money(1000) }),
        inst({ sequence: 2, status: "invoiced", plannedAmount: money(500) }),
        inst({ sequence: 3, status: "overdue", plannedAmount: money(500), dueAt: daysAgo(10) }),
      ],
      "CNY",
      NOW,
    ),
  );
  assert.equal(s.planned.amount, 2000);
  assert.equal(s.collected.amount, 1000);
  assert.equal(s.overdueCount, 1);
  assert.equal(s.collectionRate, 0.5);
});

test("an instalment past due counts as overdue even if nobody flipped its status", () => {
  const s = unwrap(summarizeCollections([inst({ status: "invoiced", dueAt: daysAgo(3) })], "CNY", NOW));
  assert.equal(s.overdueCount, 1);
});

test("nothing planned yields a null rate rather than a divide by zero", () => {
  const s = unwrap(summarizeCollections([], "CNY", NOW));
  assert.equal(s.collectionRate, null);
});

test("a mixed-currency schedule is refused", () => {
  const r = summarizeCollections([inst({ plannedAmount: money(100, "USD") })], "CNY", NOW);
  assert.equal(r.ok === false && r.violations[0].code, "currency_mismatch");
});

// --- Project health ---------------------------------------------------------

test("an overdue instalment forbids green", () => {
  // "We are fine" alongside "they have not paid" is how a failing engagement
  // stays green until it is a crisis.
  const r = unwrap(
    deriveProjectHealth({
      reported: "green",
      instalments: [inst({ status: "overdue", dueAt: daysAgo(10) })],
      milestones: [],
      now: NOW,
    }),
  );
  assert.equal(r.health, "amber");
  assert.match(String(r.overriddenBecause), /cannot be green/);
});

test("the derived health only ever downgrades, never upgrades", () => {
  // The delivery team knows things this function does not.
  const r = unwrap(
    deriveProjectHealth({ reported: "red", instalments: [], milestones: [], now: NOW }),
  );
  assert.equal(r.health, "red");
  assert.equal(r.overriddenBecause, null);

  const amber = unwrap(
    deriveProjectHealth({
      reported: "amber",
      instalments: [inst({ status: "settled", actualAmount: money(1000) })],
      milestones: [],
      now: NOW,
    }),
  );
  assert.equal(amber.health, "amber", "a clean schedule must not promote a reported amber");
});

test("a missed milestone also forbids green", () => {
  const r = unwrap(
    deriveProjectHealth({
      reported: "green",
      instalments: [],
      milestones: [{ status: "missed", dueAt: daysAgo(5) }],
      now: NOW,
    }),
  );
  assert.equal(r.health, "amber");
  assert.match(String(r.overriddenBecause), /missed milestone/);
});

test("a genuinely clean project stays green", () => {
  const r = unwrap(
    deriveProjectHealth({
      reported: "green",
      instalments: [inst({ status: "settled", actualAmount: money(1000) })],
      milestones: [{ status: "done", dueAt: daysAgo(5) }],
      now: NOW,
    }),
  );
  assert.equal(r.health, "green");
  assert.equal(r.overriddenBecause, null);
});

test("an overdue instalment does not further downgrade an already-red project", () => {
  const r = unwrap(
    deriveProjectHealth({
      reported: "red",
      instalments: [inst({ status: "overdue", dueAt: daysAgo(1) })],
      milestones: [],
      now: NOW,
    }),
  );
  assert.equal(r.health, "red");
});

// --- Milestones and identity ------------------------------------------------

test("milestone progress counts done and missed separately", () => {
  const p = milestoneProgress([{ status: "done" }, { status: "done" }, { status: "missed" }, { status: "pending" }]);
  assert.equal(p.total, 4);
  assert.equal(p.done, 2);
  assert.equal(p.missed, 1);
  assert.equal(p.ratio, 0.5);
  assert.equal(milestoneProgress([]).ratio, null);
});

test("the instalment sequence is part of the row identity and cannot be patched", () => {
  const r = assertSequenceUnchanged({ sequence: 3 });
  assert.equal(r.ok === false && r.violations[0].code, "sequence_immutable");
  assert.ok(assertSequenceUnchanged({ plannedAmount: 100, status: "invoiced" }).ok);
});
