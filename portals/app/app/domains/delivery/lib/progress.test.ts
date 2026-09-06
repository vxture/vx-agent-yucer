import { test } from "node:test";
import assert from "node:assert/strict";
import { projectProgress, type ProgressNode } from "./progress";

const plan = (...statuses: string[]): ProgressNode[] =>
  statuses.map((status, i) => ({ sequence: i + 1, name: `M${i + 1}`, status }));

test("progress is the share of the plan that has been passed", () => {
  const p = projectProgress(plan("done", "done", "pending", "pending"), "active");
  assert.equal(p.percent, 50);
});

// Stated convention, not a measurement.
test("a milestone in flight counts half", () => {
  assert.equal(projectProgress(plan("done", "in_progress"), "active").percent, 75);
  assert.equal(projectProgress(plan("in_progress", "pending"), "active").percent, 25);
});

test("a missed gate earns nothing - progress must not rise on a failure", () => {
  const p = projectProgress(plan("done", "missed", "pending"), "active");
  assert.equal(p.percent, 33);
});

// --- which milestone the project is AT ---------------------------------------

test("the current one is the milestone in flight when there is one", () => {
  assert.equal(projectProgress(plan("done", "in_progress", "pending"), "active").currentName, "M2");
});

test("otherwise it is the earliest not finished", () => {
  assert.equal(projectProgress(plan("done", "pending", "pending"), "active").currentName, "M2");
});

test("a missed gate is where the project stands, not the one after it", () => {
  const p = projectProgress(plan("done", "missed", "pending"), "active");
  assert.equal(p.currentName, "M2", "naming M3 would say it moved on when it did not");
});

test("a finished plan has no current milestone", () => {
  const p = projectProgress(plan("done", "done"), "active");
  assert.equal(p.currentName, null);
  assert.equal(p.percent, 100);
});

test("order comes from the sequence, not from arrival", () => {
  const p = projectProgress(
    [
      { sequence: 3, name: "third", status: "pending" },
      { sequence: 1, name: "first", status: "done" },
      { sequence: 2, name: "second", status: "pending" },
    ],
    "active",
  );
  assert.equal(p.currentName, "second");
});

// --- the two absences --------------------------------------------------------

test("a delivered project is 100% whatever the plan says", () => {
  const p = projectProgress(plan("done", "pending", "pending"), "delivered");
  assert.equal(p.percent, 100, "a half-ticked plan after the contract closed is a record gap");
  assert.equal(p.currentName, null);
  assert.equal(projectProgress(plan("pending"), "closed").percent, 100);
});

test("no plan is an absence, not a zero claim", () => {
  const p = projectProgress([], "active");
  assert.equal(p.unplanned, true);
  assert.equal(p.percent, 0);
});

test("a delivered project with no plan is still delivered, and still unplanned", () => {
  const p = projectProgress([], "delivered");
  assert.equal(p.percent, 100);
  assert.equal(p.unplanned, true, "the surface can still say the plan was never written");
});

test("a cancelled project keeps what it got through and names nothing current", () => {
  const p = projectProgress(plan("done", "done", "in_progress", "pending"), "cancelled");
  assert.equal(p.percent, 63, "not 100 - it sits in the finished table but it was not delivered");
  assert.equal(p.currentName, null, "nothing is in flight on a project that was called off");
});

test("planComplete is not percent === 100 - a delivered project can have open gates", () => {
  const gap = projectProgress(plan("done", "pending"), "delivered");
  assert.equal(gap.percent, 100);
  assert.equal(gap.planComplete, false, "the surface must not claim the plan was walked through");

  const clean = projectProgress(plan("done", "done"), "delivered");
  assert.equal(clean.planComplete, true);
  assert.equal(projectProgress([], "delivered").planComplete, false, "no plan is not a walked plan");
});
