import { test } from "node:test";
import assert from "node:assert/strict";
import { analysePlans, periodWindow, type PlanAdviceRow } from "./plan-advice";

const plan = (over: Partial<PlanAdviceRow> = {}): PlanAdviceRow => ({
  id: "pl_1",
  planNo: "PLAN-001",
  name: "2026 upper half",
  period: "2026H1",
  objective: "double the mid-market",
  status: "active",
  ...over,
});

const counts = (n: number) => new Map([["pl_1", n]]);

// The default is ONE campaign and ONE segment - a plan with work under it -
// so a test that wants a calendar finding alone asks for `campaigns: 0`. The
// first draft of this file left the default at one and read the extra
// `work_under_inactive_plan` as a bug in the rule; it was the rule working.

const run = (
  rows: readonly PlanAdviceRow[],
  opts: { campaigns?: number; segments?: number; now?: string } = {},
) =>
  analysePlans({
    plans: rows,
    campaignCounts: counts(opts.campaigns ?? 1),
    segmentCounts: counts(opts.segments ?? 1),
    now: new Date(opts.now ?? "2026-03-01T00:00:00Z"),
  });

const kinds = (rows: readonly { kind: string }[]) => rows.map((r) => r.kind);

// --- periodWindow ------------------------------------------------------------

test("a half and a quarter are arithmetic, and the window is closed at both ends", () => {
  const h1 = periodWindow("2026H1")!;
  assert.equal(h1.start.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(h1.end.toISOString(), "2026-06-30T23:59:59.999Z");
  const q3 = periodWindow("2026Q3")!;
  assert.equal(q3.start.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(q3.end.toISOString(), "2026-09-30T23:59:59.999Z");
});

test("February's length is asked, not assumed", () => {
  assert.equal(periodWindow("2024Q1")!.end.toISOString(), "2024-03-31T23:59:59.999Z");
  // Q1 ends in March either way; the leap year shows up in the month lengths
  // the helper computes, so pin the one quarter that ends in February.
  assert.equal(periodWindow("2024H1")!.end.toISOString(), "2024-06-30T23:59:59.999Z");
});

test("the separator the workspace already writes is tolerated", () => {
  assert.deepEqual(periodWindow("2026-Q3"), periodWindow("2026Q3"));
  assert.deepEqual(periodWindow("2026 q3"), periodWindow("2026Q3"));
});

// The honest silence. A fiscal year ends where the tenant's finance calendar
// says and this product holds no such setting.
test("a fiscal year has no window rather than a guessed one", () => {
  assert.equal(periodWindow("FY26"), null);
  assert.equal(periodWindow("2026H3"), null);
  assert.equal(periodWindow("next year"), null);
});

test("a plan whose period cannot be placed gets no calendar finding at all", () => {
  const out = run([plan({ status: "draft", period: "FY26" })], { campaigns: 0 });
  assert.deepEqual(kinds(out), [], "an unplaceable period must not fire the calendar rules");
});

// --- the calendar findings ---------------------------------------------------

test("a draft whose period has already started is the first thing said", () => {
  const out = run([plan({ status: "draft" })], { campaigns: 0, now: "2026-01-01T09:00:00Z" });
  assert.deepEqual(kinds(out), ["draft_period_started"]);
});

test("day one counts as started, and the last day does not count as over", () => {
  assert.deepEqual(
    kinds(run([plan({ status: "draft" })], { campaigns: 0, now: "2026-01-01T00:00:00Z" })),
    ["draft_period_started"],
    "a period starts at the first instant of its first day",
  );
  assert.deepEqual(
    kinds(run([plan({ status: "active" })], { now: "2026-06-30T23:00:00Z" })),
    [],
    "a plan is not late on the last day of its own period",
  );
});

test("approved but never switched on, once the period is running", () => {
  assert.deepEqual(
    kinds(run([plan({ status: "approved" })], { campaigns: 0 })),
    ["approved_not_active"],
  );
  // Approved for a period that has not begun is simply being ready.
  assert.deepEqual(
    kinds(run([plan({ status: "approved", period: "2026Q4" })], { campaigns: 0 })),
    [],
    "approving next quarter's plan early is not a defect",
  );
});

test("a plan still running after its period ended", () => {
  const out = run([plan({ status: "active" })], { now: "2026-07-01T00:00:00Z" });
  assert.deepEqual(kinds(out), ["period_over_not_closed"]);
});

// --- the work findings -------------------------------------------------------

test("a running plan with nothing under it is a plan nobody acted on", () => {
  assert.deepEqual(kinds(run([plan()], { campaigns: 0 })), ["active_no_campaign"]);
  assert.deepEqual(kinds(run([plan()], { segments: 0 })), ["active_no_segment"]);
});

test("campaigns hanging off a plan that is not live yet", () => {
  const out = run([plan({ status: "draft", period: "2026Q4" })], { campaigns: 3 });
  assert.deepEqual(kinds(out), ["work_under_inactive_plan"]);
  assert.equal(out[0]!.count, 3, "the finding states how much work is already there");
});

// The distinction that keeps that finding meaningful.
test("a closed plan's campaigns are history, not premature work", () => {
  const out = run([plan({ status: "closed", period: "2025H1" })], { campaigns: 4 });
  assert.deepEqual(kinds(out), [], "closing a plan does not retroactively fault its campaigns");
});

test("an archived plan is finished, not wrong - it says nothing at all", () => {
  const out = run([plan({ status: "archived", objective: null, period: "2020H1" })], {
    campaigns: 0,
    segments: 0,
  });
  assert.deepEqual(kinds(out), []);
});

// --- the objective -----------------------------------------------------------

test("a plan that states no aim is worth saying, whitespace included", () => {
  assert.deepEqual(kinds(run([plan({ objective: null })])), ["no_objective"]);
  assert.deepEqual(kinds(run([plan({ objective: "   " })])), ["no_objective"]);
});

test("a closed plan is not asked to write down an aim it no longer has", () => {
  assert.deepEqual(kinds(run([plan({ status: "closed", objective: null })])), []);
});

// --- ordering ----------------------------------------------------------------

test("the worst finding is the one the dock shows first", () => {
  const out = run([plan({ status: "active", objective: null })], {
    now: "2026-08-01T00:00:00Z",
    campaigns: 0,
    segments: 0,
  });
  assert.deepEqual(kinds(out), [
    "period_over_not_closed",
    "active_no_campaign",
    "active_no_segment",
    "no_objective",
  ]);
});

test("each finding carries the plan it is about, and its id is stable", () => {
  const out = run([plan({ status: "draft" })], { campaigns: 0, now: "2026-02-01T00:00:00Z" });
  assert.equal(out[0]!.planNo, "PLAN-001");
  assert.equal(out[0]!.planName, "2026 upper half");
  assert.equal(out[0]!.id, "draft_period_started:pl_1");
});
