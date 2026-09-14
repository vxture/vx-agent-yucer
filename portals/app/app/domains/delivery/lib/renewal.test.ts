import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessRenewal,
  daysUntilEnd,
  planRenewal,
  planRenewalPolicy,
  DEFAULT_RENEWAL_POLICY,
  type RenewableProject,
} from "./renewal";

const NOW = new Date("2026-08-30T00:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const P = (over: Partial<RenewableProject> = {}): RenewableProject => ({
  id: "prj_1",
  name: "POS rollout",
  accountId: "acc_1",
  engagementType: "subscription",
  status: "active",
  endsAt: inDays(30),
  contractAmount: 760_000,
  currency: "CNY",
  derivedHealth: "green",
  ...over,
});

test("only a subscription comes back round", () => {
  // The owner's ruling. A one-off implementation that ended is finished, and
  // proposing its renewal invents an obligation the customer never took on.
  assert.deepEqual(assessRenewal(P({ engagementType: "one_off" }), NOW), {
    kind: "not_due",
    reason: "not_subscription",
  });
  assert.equal(assessRenewal(P(), NOW).kind, "due");
});

test("a term already lapsed is the MOST due, not filtered out", () => {
  // Filtering the past would hide exactly the renewals somebody missed.
  const r = assessRenewal(P({ endsAt: inDays(-7) }), NOW);
  assert.equal(r.kind, "due");
  assert.equal(r.kind === "due" && r.daysToEnd, -7);
});

test("a term beyond the window is not yet work", () => {
  assert.deepEqual(assessRenewal(P({ endsAt: inDays(200) }), NOW), {
    kind: "not_due",
    reason: "too_far_out",
  });
});

test("a paused project still has a running term", () => {
  // on_hold is exactly when a lapse is easy to miss: the work stopped, the
  // clock did not.
  assert.equal(assessRenewal(P({ status: "on_hold" }), NOW).kind, "due");
  assert.equal(assessRenewal(P({ status: "planning" }), NOW).kind, "not_due");
  assert.equal(assessRenewal(P({ status: "cancelled" }), NOW).kind, "not_due");
});

test("delivery quality sets the risk, and it comes from the DERIVED health", () => {
  const good = assessRenewal(P(), NOW);
  assert.equal(good.kind === "due" && good.risk, "low");
  const shaky = assessRenewal(P({ derivedHealth: "amber" }), NOW);
  assert.equal(shaky.kind === "due" && shaky.risk, "watch");
});

test("a project already renewed is not proposed twice", () => {
  assert.deepEqual(assessRenewal(P(), NOW, { alreadyRenewed: true }), {
    kind: "not_due",
    reason: "already_renewed",
  });
});

test("no end date means nothing to renew from", () => {
  assert.deepEqual(assessRenewal(P({ endsAt: null }), NOW), {
    kind: "not_due",
    reason: "no_end_date",
  });
});

test("the draft carries LAST term's amount, never an invented uplift", () => {
  // What last term was worth is a fact; what next term is worth is a
  // negotiation, and seeding it with a guess puts a number nobody chose in
  // front of a customer.
  const v = assessRenewal(P(), NOW);
  const d = planRenewal(P(), v);
  assert.ok(d.ok);
  assert.equal(d.ok && d.value.amount, 760_000);
  assert.equal(d.ok && d.value.sourceProjectId, "prj_1");
});

test("a project that is not due cannot be planned into a deal", () => {
  const r = planRenewal(P(), { kind: "not_due", reason: "not_subscription" });
  assert.equal(r.ok, false);
  assert.equal(r.ok ? "" : r.violations[0].code, "renewal_not_due");
});

test("days-to-end is a fact about the project, not about the verdict", () => {
  // The defect this closes: the renewal page read the figure off the `due`
  // verdict, so an already-renewed project - which still has a term running
  // out - rendered as "no end date". One definition, callable against any row.
  const p = P({ endsAt: new Date("2026-09-05T00:00:00Z") });
  const now = new Date("2026-08-30T00:00:00Z");
  assert.equal(daysUntilEnd(p, now), 6);
  // And it stays 6 whatever the rule concludes about it.
  const verdict = assessRenewal(p, now, { alreadyRenewed: true });
  assert.equal(verdict.kind, "not_due");
  assert.equal(daysUntilEnd(p, now), 6);
});

test("a lapsed term reads negative, and no end date reads null", () => {
  const now = new Date("2026-08-30T00:00:00Z");
  assert.equal(daysUntilEnd(P({ endsAt: new Date("2026-08-18T00:00:00Z") }), now), -12);
  assert.equal(daysUntilEnd(P({ endsAt: null }), now), null);
});

// --- 续约提醒窗口 (incr/0066) - the workspace's own lead time -----------------

test("the shipped policy is itself valid", () => {
  assert.equal(planRenewalPolicy(DEFAULT_RENEWAL_POLICY).ok, true);
});

test("the window is a whole day count from 1 to 365", () => {
  for (const bad of [0, 366, 45.5]) {
    const r = planRenewalPolicy({ windowDays: bad });
    assert.equal(r.ok === false && r.violations[0].code, "window_out_of_range", String(bad));
  }
  assert.equal(planRenewalPolicy({ windowDays: 1 }).ok, true);
  assert.equal(planRenewalPolicy({ windowDays: 365 }).ok, true);
});

test("a workspace with a wider window sees the SAME project turn due, sooner", () => {
  // 200 days out is "too_far_out" under the shipped 90-day window (see the
  // test above this whole file already had for exactly that project).
  // A workspace on annual contracts that decided 270 days is its own lead
  // time sees the identical project as due today.
  const farOut = P({ endsAt: inDays(200) });
  assert.equal(assessRenewal(farOut, NOW).kind, "not_due");
  const wider = assessRenewal(farOut, NOW, { windowDays: 270 });
  assert.equal(wider.kind, "due");
  assert.equal(wider.kind === "due" && wider.daysToEnd, 200);
});
