import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildNationalCohort } from "./demo-national";
import { ALL_PROVINCES } from "./provinces";

// 全国样本的不变量 - the cohort's own invariants.
//
// The cohort is generated, which is exactly why it needs these: a curated row
// is wrong in a way somebody can see reading the file, and a generated one is
// wrong only for the draws that happen to produce it. Every assertion below
// stands for a defect that reached a screen.

const OWNERS = ["usr_rep_1", "usr_rep_2", "usr_pm"];
/** Whole days since the quarter began, the way demo-seed computes it. */
const daysIntoQuarter = (now: Date) =>
  Math.max(1, Math.round(
    (now.getTime() - new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).getTime())
    / 86_400_000,
  ));

test("no generated deal closes before the quarter it is supposed to close in", () => {
  /* THE ONE THAT ACTUALLY BIT. maxClosedDaysBack is whole days since the
     quarter began, but the clock carries a time of day, so closing exactly
     that many days back lands a few hours INSIDE the previous quarter. Two
     deals went there and moved the settled quarter's actual from 3.2M to
     5.29M - the pair of figures the forecast scorecard exists to contrast.
     Nothing failed at the time; the RNG simply had not produced that draw yet.

     Checked across a year of start dates, because whether the boundary is
     reachable at all depends on how far into the quarter "today" is. */
  for (let d = 0; d < 365; d += 7) {
    const now = new Date(2026, 0, 1 + d, 11, 30);
    const q0 = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const cohort = buildNationalCohort(OWNERS, daysIntoQuarter(now));
    for (const o of cohort.opportunities) {
      if (o.status === "open") continue;
      const closedAt = new Date(now.getTime() + o.closeInDays * 86_400_000);
      assert.ok(
        closedAt >= q0,
        `${o.id} closed ${closedAt.toISOString()} - before the quarter began ${q0.toISOString()}`,
      );
    }
  }
});

test("a converted lead converted into something that exists", () => {
  // A lead marked converted whose signal and opportunity are both null is not
  // a sparse row, it is an incoherent one - and the attribution keys are
  // frozen after creation (ADR-003), so it cannot be repaired afterwards.
  const c = buildNationalCohort(OWNERS, 60);
  const oppIds = new Set(c.opportunities.map((o) => o.id));
  const signalIds = new Set(c.signals.map((s) => s.id));
  const converted = c.leads.filter((l) => l.status === "converted");
  assert.ok(converted.length > 0, "the cohort must contain conversions, or 转商机率 is always 0");
  for (const l of converted) {
    assert.ok(l.signalId && signalIds.has(l.signalId), `${l.id} points at no real signal`);
    assert.ok(
      l.convertedOpportunityId && oppIds.has(l.convertedOpportunityId),
      `${l.id} converted into no real opportunity`,
    );
  }
  // and the reverse: an unconverted lead must not carry the keys of one
  for (const l of c.leads.filter((x) => x.status !== "converted")) {
    assert.equal(l.convertedOpportunityId, null, `${l.id} is not converted but names an opportunity`);
  }
});

test("no generated proposal is old enough for the expiry sweep", () => {
  // The demo owns exactly ONE proposal past the 7-day TTL (act_demo_6), which
  // is how the expiry rule is shown working. Cohort rows crossing it would
  // bury that demonstration in a crowd.
  const c = buildNationalCohort(OWNERS, 60);
  assert.ok(c.proposals.length > 0);
  for (const p of c.proposals) {
    assert.ok(p.agedDays < 7, `${p.id} is ${p.agedDays} days old and would be swept`);
  }
});

test("every instalment stands on a milestone of its own project", () => {
  // incr/0032 made milestone_id NOT NULL: there is no such thing here as money
  // with no gate, and a dangling reference is a seed that will not load.
  const c = buildNationalCohort(OWNERS, 60);
  const byProject = new Map(c.milestones.map((m) => [m.id, m.projectId]));
  assert.ok(c.instalments.length > 0, "回款兑现 reads instalments - without them the panel is 0");
  for (const i of c.instalments) {
    assert.equal(byProject.get(i.milestoneId), i.projectId, `${i.id} points outside its project`);
  }
});

test("a finished project has been paid for", () => {
  // The one reading 回款兑现 must never produce: a receivable standing against
  // work that is over.
  const c = buildNationalCohort(OWNERS, 60);
  const done = new Set(
    c.projects.filter((p) => p.status !== "delivering").map((p) => p.id),
  );
  for (const i of c.instalments) {
    if (!done.has(i.projectId)) continue;
    assert.equal(i.status, "settled", `${i.id} is still owed on a finished project`);
  }
});

test("every generated row lands on a province the map can draw", () => {
  const c = buildNationalCohort(OWNERS, 60);
  const known = new Set(ALL_PROVINCES);
  for (const a of c.accounts) {
    assert.ok(known.has(a.province), `${a.id} sits in ${a.province}, which the map has no shape for`);
  }
  assert.equal(
    new Set(c.accounts.map((a) => a.province)).size,
    ALL_PROVINCES.length,
    "every province needs at least one account - a blank province reads as 'no business'",
  );
});

test("a project's instalments add up to its contract, exactly", () => {
  // Rounding both halves left a few yuan unbilled per project. Small, and
  // still a schedule that does not add up to the thing it is billing - which
  // is the one property a receivable has to have.
  const c = buildNationalCohort(OWNERS, 60);
  const planned = new Map<string, number>();
  for (const i of c.instalments) {
    planned.set(i.projectId, (planned.get(i.projectId) ?? 0) + i.planned);
  }
  for (const p of c.projects) {
    assert.equal(planned.get(p.id), p.contract, `${p.id} bills ${planned.get(p.id)} of ${p.contract}`);
  }
});
