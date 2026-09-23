import { test } from "node:test";
import assert from "node:assert/strict";
import { renewalRisk, type RenewalRiskInput } from "./renewal-risk";

const calm: RenewalRiskInput = {
  noticeInDays: 200,
  windowDays: 90,
  renewalDealOpen: false,
  projects: [{ name: "一期", health: "green" }],
  overdueInstalments: 0,
  quietDays: 5,
  priorDowngrade: false,
};

test("a contract far from its deadline with nothing wrong is low, with no basis", () => {
  assert.deepEqual(renewalRisk(calm), { level: "low", points: 0, basis: [] });
});

test("before the window opens, trouble underneath already raises it - the point of scoring early", () => {
  const r = renewalRisk({ ...calm, projects: [{ name: "一期", health: "red" }], overdueInstalments: 1 });
  assert.equal(r.level, "high");
  assert.deepEqual(r.basis.map((b) => b.code), ["delivery_red", "revenue_overdue"]);
});

test("a passed notice deadline with no renewal deal is high on its own; an open deal takes it off and says so", () => {
  const passed = renewalRisk({ ...calm, noticeInDays: -12 });
  assert.equal(passed.level, "high");
  assert.deepEqual(passed.basis[0], { code: "notice_passed", days: 12 });
  const covered = renewalRisk({ ...calm, noticeInDays: -12, renewalDealOpen: true });
  assert.equal(covered.level, "low");
  assert.deepEqual(covered.basis, [{ code: "renewal_deal_open" }]);
});

test("in the window with nobody on it is medium; silence and a past downgrade add to it", () => {
  assert.equal(renewalRisk({ ...calm, noticeInDays: 40 }).level, "medium");
  const r = renewalRisk({ ...calm, noticeInDays: 40, quietDays: null, priorDowngrade: true });
  assert.equal(r.level, "high");
  assert.deepEqual(r.basis.map((b) => b.code), ["in_window", "quiet", "prior_downgrade"]);
});
