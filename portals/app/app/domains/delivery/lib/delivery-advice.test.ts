import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseDelivery, type DeliveryAdviceRow } from "./delivery-advice";
import { deliveryStats, worseThan, type DeliveryStatsRow } from "./delivery-stats";

const row = (over: Partial<DeliveryAdviceRow> = {}): DeliveryAdviceRow => ({
  id: "prj_1",
  name: "retail platform",
  status: "active",
  reported: "green",
  derived: "green",
  managerSub: "usr_pm",
  contractAmount: 800_000,
  lateMilestones: 0,
  milestoneCount: 4,
  ...over,
});

const kinds = (rows: readonly { kind: string }[]) => rows.map((r) => r.kind);

// --- the finding this domain exists for --------------------------------------

test("a report rosier than the facts is the loudest thing on the page", () => {
  const out = analyseDelivery([row({ reported: "green", derived: "red" })]);
  assert.deepEqual(kinds(out), ["health_downgraded"]);
});

test("a report HARSHER than the facts is not a finding", () => {
  assert.deepEqual(
    kinds(analyseDelivery([row({ reported: "red", derived: "green" })])),
    [],
    "a team calling itself at risk is exercising judgement, not misreporting",
  );
});

test("agreement says nothing", () => {
  assert.deepEqual(kinds(analyseDelivery([row({ reported: "amber", derived: "amber" })])), []);
});

test("worseThan ranks the three readings", () => {
  assert.equal(worseThan("red", "amber"), true);
  assert.equal(worseThan("amber", "green"), true);
  assert.equal(worseThan("green", "red"), false);
  assert.equal(worseThan("amber", "amber"), false);
});

// --- the plan ----------------------------------------------------------------

test("late milestones are counted, not just flagged", () => {
  const out = analyseDelivery([row({ lateMilestones: 3 })]);
  assert.deepEqual(kinds(out), ["milestone_late"]);
  assert.equal(out[0]!.count, 3);
});

test("a project with no plan cannot be late against one", () => {
  const out = analyseDelivery([row({ milestoneCount: 0 })]);
  assert.deepEqual(kinds(out), ["no_milestones"]);
});

// One problem, not two - and the plan is the one to fix first.
test("a missing contract figure is not piled on top of a missing plan", () => {
  const out = analyseDelivery([row({ milestoneCount: 0, contractAmount: null })]);
  assert.deepEqual(kinds(out), ["no_milestones"]);
});

test("a missing contract figure is said when there IS a plan", () => {
  assert.deepEqual(kinds(analyseDelivery([row({ contractAmount: null })])), ["no_contract_amount"]);
});

test("an unowned project is raised", () => {
  assert.deepEqual(kinds(analyseDelivery([row({ managerSub: null })])), ["no_manager"]);
});

// --- what is finished stays quiet --------------------------------------------

test("delivered, closed and cancelled projects say nothing at all", () => {
  for (const status of ["delivered", "closed", "cancelled"]) {
    assert.deepEqual(
      kinds(
        analyseDelivery([
          row({ status, reported: "green", derived: "red", managerSub: null, milestoneCount: 0 }),
        ]),
      ),
      [],
      status,
    );
  }
});

test("the worst finding sorts first", () => {
  const out = analyseDelivery([
    row({ id: "a", managerSub: null }),
    row({ id: "b", reported: "green", derived: "amber" }),
  ]);
  assert.deepEqual(kinds(out), ["health_downgraded", "no_manager"]);
});

// --- stats -------------------------------------------------------------------

const srow = (over: Partial<DeliveryStatsRow> = {}): DeliveryStatsRow => ({
  id: "prj_1",
  name: "retail platform",
  status: "active",
  contractAmount: 800_000,
  reported: "green",
  derived: "green",
  managerSub: "usr_pm",
  ...over,
});

test("the primary cut is the lifecycle, in the order work moves through it", () => {
  const s = deliveryStats([
    srow({ id: "a", status: "active" }),
    srow({ id: "b", status: "planning", contractAmount: 200_000 }),
    srow({ id: "c", status: "active", contractAmount: 100_000 }),
  ]);
  assert.deepEqual(
    s.byStage.map((b) => [b.key, b.amount, b.count]),
    [
      ["planning", 200_000, 1],
      ["active", 900_000, 2],
    ],
    "planning comes before active, and empty stages are dropped",
  );
});

test("the health chart reads live work only", () => {
  const s = deliveryStats([
    srow({ id: "a", status: "delivered", derived: "red" }),
    srow({ id: "b", status: "active", derived: "amber" }),
  ]);
  assert.deepEqual(
    s.byHealth.map((b) => b.key),
    ["amber"],
    "a delivered project's health is history, not a reading of what is running",
  );
});

test("the downgrade count is the domain's point, and counts live work", () => {
  const s = deliveryStats([
    srow({ id: "a", reported: "green", derived: "red" }),
    srow({ id: "b", status: "closed", reported: "green", derived: "red" }),
    srow({ id: "c", reported: "red", derived: "green" }),
  ]);
  assert.equal(s.downgraded, 1);
});

test("the contract total covers every project, finished or not", () => {
  const s = deliveryStats([
    srow({ id: "a", contractAmount: 100 }),
    srow({ id: "b", status: "closed", contractAmount: 900 }),
  ]);
  assert.equal(s.contractTotal, 1000, "it is what the book is worth, not what is in flight");
});

test("nothing at all is not a crash", () => {
  const s = deliveryStats([]);
  assert.deepEqual(s.byStage, []);
  assert.deepEqual(s.byHealth, []);
  assert.equal(s.contractTotal, 0);
});
