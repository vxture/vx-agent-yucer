import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseCollections, type CollectionAdviceRow } from "./collection-advice";

const NOW = new Date("2026-09-06T00:00:00Z");

const row = (over: Partial<CollectionAdviceRow> = {}): CollectionAdviceRow => ({
  id: "ins_1",
  projectId: "prj_1",
  projectName: "retail platform",
  status: "invoiced",
  plannedAmount: 300_000,
  actualAmount: null,
  dueAt: "2026-12-01",
  ...over,
});

const kinds = (rows: readonly { kind: string }[]) => rows.map((r) => r.kind);
// Most tests want one instalment's findings, not the per-project one that
// fires whenever a project has collected nothing.
const only = (rows: readonly CollectionAdviceRow[]) =>
  kinds(analyseCollections(rows, NOW).filter((a) => a.kind !== "nothing_collected"));

test("an instalment nobody has been paid for, still in date, says nothing", () => {
  assert.deepEqual(only([row()]), []);
});

test("a status of overdue is taken at its word", () => {
  assert.deepEqual(only([row({ status: "overdue", dueAt: "2026-08-01" })]), ["overdue"]);
});

// The finding this page exists for: a fact nobody had to set, disagreeing
// with a status somebody did.
test("a due date that has passed while the row still reads invoiced", () => {
  const out = analyseCollections([row({ dueAt: "2026-08-27" })], NOW);
  assert.deepEqual(kinds(out.filter((a) => a.kind !== "nothing_collected")), ["due_not_flagged"]);
  assert.equal(out[0]!.daysLate, 10, "the panel says how late, so the finding carries it");
});

test("short payment is said about money that did arrive", () => {
  const out = analyseCollections(
    [row({ status: "settled", actualAmount: 250_000 })],
    NOW,
  );
  assert.deepEqual(kinds(out), ["short_paid"]);
  assert.equal(out[0]!.shortfall, 50_000);
});

test("payment in full says nothing at all", () => {
  assert.deepEqual(only([row({ status: "settled", actualAmount: 300_000 })]), []);
});

// Overpayment is not a collections problem.
test("more than planned is not reported as short", () => {
  assert.deepEqual(only([row({ status: "settled", actualAmount: 320_000 })]), []);
});

test("an instalment with no due date can never be late, which is the point", () => {
  assert.deepEqual(only([row({ dueAt: null })]), ["no_due_date"]);
});

test("a written-off instalment is a decision, not a defect", () => {
  const out = analyseCollections(
    [row({ status: "written_off", dueAt: "2026-01-01" })],
    NOW,
  );
  assert.deepEqual(kinds(out), [], "it is excluded from the project roll-up too");
});

test("a project with nothing collected is raised once, not once per instalment", () => {
  const out = analyseCollections(
    [row({ id: "a" }), row({ id: "b" }), row({ id: "c" })],
    NOW,
  );
  assert.deepEqual(kinds(out), ["nothing_collected"]);
  assert.equal(out[0]!.projectId, "prj_1");
});

test("one settled instalment clears the project-level finding", () => {
  const out = analyseCollections(
    [row({ id: "a", status: "settled", actualAmount: 300_000 }), row({ id: "b" })],
    NOW,
  );
  assert.deepEqual(kinds(out), []);
});

test("the worst finding sorts first", () => {
  const out = analyseCollections(
    [
      row({ id: "a", projectId: "p1", status: "settled", actualAmount: 1 }),
      row({ id: "b", projectId: "p2", status: "overdue", dueAt: "2026-08-01" }),
      row({ id: "c", projectId: "p3", dueAt: null }),
    ],
    NOW,
  );
  assert.deepEqual(kinds(out).slice(0, 2), ["overdue", "short_paid"]);
});

test("nothing to collect produces nothing to say", () => {
  assert.deepEqual(analyseCollections([], NOW), []);
});
