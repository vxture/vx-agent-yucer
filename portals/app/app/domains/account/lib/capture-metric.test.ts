import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAPTURE_CRITERION,
  assessCapture,
  captureByWeek,
  weekStartOf,
} from "./capture-metric";

// 2026-08-19 is a Wednesday, so the containing week starts Monday 2026-08-17.
const NOW = new Date("2026-08-19T10:00:00Z");
const WEEK = 7 * 86_400_000;
const DAY = 86_400_000;

const opp = (id: string, createdDaysAgo: number, closedDaysAgo: number | null = null) => ({
  id,
  createdAt: new Date(NOW.getTime() - createdDaysAgo * DAY),
  closedAt: closedDaysAgo === null ? null : new Date(NOW.getTime() - closedDaysAgo * DAY),
});

const note = (opportunityId: string | null, daysAgo: number) => ({
  opportunityId,
  occurredAt: new Date(NOW.getTime() - daysAgo * DAY),
});

test("weekStartOf lands on Monday 00:00 UTC for every day of the week", () => {
  const monday = new Date("2026-08-17T00:00:00Z");
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday.getTime() + i * DAY + 13 * 3_600_000);
    assert.equal(weekStartOf(d).toISOString(), monday.toISOString(), `offset ${i}`);
  }
  // Sunday belongs to the week that started six days earlier, not to the next
  // one - the classic off-by-one when 0 = Sunday is used directly.
  assert.equal(
    weekStartOf(new Date("2026-08-16T23:59:59Z")).toISOString(),
    new Date("2026-08-10T00:00:00Z").toISOString(),
  );
});

test("coverage counts deals touched, not notes written", () => {
  // One deal gets twenty notes; three others get nothing. Rate looks healthy,
  // coverage tells the truth. This is the whole reason coverage is primary.
  const opps = [opp("o1", 60), opp("o2", 60), opp("o3", 60), opp("o4", 60)];
  const notes = Array.from({ length: 20 }, () => note("o1", 1));

  const weeks = captureByWeek(notes, opps, { now: NOW, weeks: 1 });
  // The notes are 1 day old, so they land in the CURRENT week - the last entry,
  // which captureByWeek now appends in-progress and flags as such.
  const current = weeks[weeks.length - 1];
  assert.equal(current.complete, false, "the current week is never scored");
  assert.equal(current.opportunities, 4);
  assert.equal(current.interactions, 20);
  assert.equal(current.covered, 1);
  assert.equal(current.coverage, 0.25);
  assert.equal(current.rate, 5);
});

test("account-level notes do not count - the criterion is per opportunity", () => {
  const opps = [opp("o1", 60), opp("o2", 60)];
  const weeks = captureByWeek([note(null, 1), note(null, 2)], opps, { now: NOW, weeks: 1 });
  assert.equal(weeks[0].interactions, 0);
  assert.equal(weeks[0].coverage, 0);
});

test("the denominator is historical, so past weeks do not improve when a deal closes", () => {
  // o1 closed 10 days ago. It was open during the week before that and must
  // still count for it - otherwise last month's coverage rises on its own.
  const opps = [opp("o1", 60, 10), opp("o2", 60)];
  const weeks = captureByWeek([], opps, { now: NOW, weeks: 3 });

  const twoWeeksAgo = weeks[0];
  assert.equal(twoWeeksAgo.opportunities, 2, "both were open two weeks ago");
  assert.equal(weeks[2].opportunities, 1, "only o2 is open this week");
});

test("a deal created after a week ended does not count for that week", () => {
  const opps = [opp("new", 2)];
  const weeks = captureByWeek([], opps, { now: NOW, weeks: 3 });
  assert.equal(weeks[0].opportunities, 0, "oldest week predates the deal");
  assert.equal(weeks[weeks.length - 1].opportunities, 1, "this week has it");
});

test("a week with no open deals is null coverage, not zero", () => {
  // Zero would read as "the team recorded nothing", which is a different claim
  // from "there was nothing to record" and would drag the average down.
  const weeks = captureByWeek([], [], { now: NOW, weeks: 2 });
  assert.equal(weeks[0].coverage, null);
  assert.equal(weeks[0].rate, null);
  assert.ok(weeks.every((w, i) => w.complete === (i < weeks.length - 1)),
    "every week but the last is complete");
});

test("an interaction outside its deal's week is not counted in it", () => {
  const opps = [opp("o1", 60)];
  // 9 days ago falls in an earlier week than 1 day ago.
  const weeks = captureByWeek([note("o1", 9)], opps, { now: NOW, weeks: 2 });
  const current = weeks[weeks.length - 1];
  const lastWeek = weeks[weeks.length - 2];
  assert.equal(current.interactions, 0, "this week saw nothing");
  assert.equal(lastWeek.interactions, 1, "last week saw it");
});

test("an interaction on an unknown opportunity id is ignored, not counted", () => {
  const weeks = captureByWeek([note("ghost", 1)], [opp("o1", 60)], { now: NOW, weeks: 1 });
  assert.equal(weeks[0].interactions, 0);
});

// --- the criterion ---------------------------------------------------------

// Hand-built weeks, for the assessment rules ONLY.
//
// Every one of these is marked complete, because assessCapture must never see
// the in-progress week - and a helper that could produce one would let a test
// pass while the production path fails, which is precisely what happened to the
// first version of this file.
function weeksAt(coverages: readonly (number | null)[]) {
  return coverages.map((c, i) => ({
    weekStart: new Date(NOW.getTime() - (coverages.length - 1 - i) * WEEK),
    weekEnd: new Date(NOW.getTime() - (coverages.length - 2 - i) * WEEK),
    complete: true,
    opportunities: c === null ? 0 : 10,
    interactions: c === null ? 0 : Math.round(c * 10),
    covered: c === null ? 0 : Math.round(c * 10),
    coverage: c,
    rate: c,
  }));
}

/** Observed long enough to be judged - the common case for these tests. */
const OLD_ENOUGH = { firstRecordedAt: new Date(NOW.getTime() - 30 * WEEK), now: NOW };

test("the verdict is too_early until the workspace has been OBSERVED long enough", () => {
  // Terrible coverage, but the evidence plane has only been on for two weeks.
  // It must NOT read as failure - a criterion that can fail early is one that
  // gets quoted early, and stage 2 dies on two weeks of data.
  //
  // This is gated on elapsed observation, not on how many rows the caller
  // handed in. The first version tested the array length, which captureByWeek
  // makes a constant, so the guard never fired in production at all and a
  // workspace that switched the plane on over pre-existing deals read the KILL
  // verdict within days.
  const young = assessCapture(weeksAt([0, 0, 0, 0, 0, 0]), {
    firstRecordedAt: new Date(NOW.getTime() - 2 * WEEK),
    now: NOW,
  });
  assert.equal(young.verdict, "too_early");
  assert.equal(young.observedWeeks, 2);

  // Same rows, same zeros - but observed long enough. Now it is a verdict.
  const grown = assessCapture(weeksAt([0, 0, 0, 0, 0, 0]), OLD_ENOUGH);
  assert.equal(grown.verdict, "not_adopted");
});

test("nothing ever recorded is never a failing verdict", () => {
  // observedWeeks is null, not zero: there is no observation whose length could
  // be measured, and zero would read as "we watched and saw nothing".
  const a = assessCapture(weeksAt([0, 0, 0, 0, 0, 0]), { firstRecordedAt: null, now: NOW });
  assert.equal(a.verdict, "too_early");
  assert.equal(a.observedWeeks, null);
});

test("the in-progress week is excluded from the verdict, so it cannot flip at midnight", () => {
  // The defect this prevents, exactly: identical data read `adopted` on a
  // Sunday evening and `not_adopted` four hours later, because the new week had
  // begun and its almost-empty partial counted at full weight.
  const done = weeksAt([0.8, 0.8, 0.8, 0.8, 0.8, 0.8]);
  const withPartial = [
    ...done,
    { ...done[0], weekStart: NOW, weekEnd: new Date(NOW.getTime() + WEEK), complete: false, coverage: 0, covered: 0, interactions: 0 },
  ];
  assert.equal(assessCapture(done, OLD_ENOUGH).verdict, "adopted");
  assert.equal(assessCapture(withPartial, OLD_ENOUGH).verdict, "adopted", "the partial week changed nothing");
  assert.equal(assessCapture(withPartial, OLD_ENOUGH).judgedCoverage, 0.8);
});

test("adoption is judged on the last two weeks, not the six-week average", () => {
  // A strong start and a dead finish averages above the bar but means the habit
  // did not survive contact with a normal week.
  const a = assessCapture(weeksAt([1, 1, 1, 1, 0.1, 0.1]), OLD_ENOUGH);
  assert.equal(a.verdict, "not_adopted");
  assert.ok(a.judgedCoverage !== null && a.judgedCoverage < CAPTURE_CRITERION.minCoverage);

  // And the mirror: a slow start that ends strong is adoption.
  const b = assessCapture(weeksAt([0, 0, 0.1, 0.3, 0.6, 0.7]), OLD_ENOUGH);
  assert.equal(b.verdict, "adopted");
});

test("exactly at the threshold counts as adopted", () => {
  const a = assessCapture(weeksAt([0, 0, 0, 0, 0.5, 0.5]), OLD_ENOUGH);
  assert.equal(a.verdict, "adopted");
});

test("no open deals at all is no_data, which is not a failure", () => {
  const a = assessCapture(weeksAt([null, null, null, null, null, null]), OLD_ENOUGH);
  assert.equal(a.verdict, "no_data");
  assert.equal(a.judgedCoverage, null);
});

test("weeks with no deals are excluded from the judged average rather than scored zero", () => {
  // Final two weeks: one had no deals, one had full coverage. The average must
  // be 1, not 0.5 - the empty week is not evidence of anything.
  const a = assessCapture(weeksAt([0.6, 0.6, 0.6, 0.6, null, 1]), OLD_ENOUGH);
  assert.equal(a.judgedWeeks, 1);
  assert.equal(a.judgedCoverage, 1);
  // But one judged week is fewer than the criterion demands, so it withholds.
  assert.equal(a.verdict, "too_early");
});
