import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyContent } from "../../domains/planning/plan-model";
import { applyPlanningDraft } from "./planning-assist";
import { minor } from "../../domains/planning/plan-values";
test("assistant targets fill real annual and quarter fields with integer counts and exact remainder", () => {
  const c = emptyContent(2026, [], "CNY"); c.releaseScope = "company";
  const next = applyPlanningDraft(c, { targets: [{ metric: "revenue", value: "100.01" }, { metric: "new_logo", value: "7" }, { metric: "margin", value: "40" }], assumptions: "Fixture assumption" });
  const annual = next.targets.find(t => t.metric === "revenue" && t.period === "Y2026")!;
  assert.equal(annual.floor, "60.00"); assert.equal(annual.stretch, "120.01");
  for (const metric of ["revenue", "new_logo", "margin"]) {
    const quarters = next.targets.filter(t => t.metric === metric && t.period !== "Y2026");
    assert.equal(quarters.length, 4); assert.ok(quarters.every(t => t.floor === null && t.stretch === null));
    assert.equal(quarters.reduce((sum, t) => sum + minor(t.target!), 0n), minor(next.targets.find(t => t.metric === metric && t.period === "Y2026")!.target!));
  }
  assert.equal(next.targets.find(t => t.metric === "margin" && t.period === "Y2026")!.marginRates!.target, "40");
  assert.equal(next.targets.find(t => t.metric === "margin" && t.period === "Y2026")!.target, "40.00");
  assert.equal(next.assumptions, "Fixture assumption"); assert.equal(c.targets[0].target, null);
});
test("region assistant preserves company targets, other regions and closed quarter amounts", () => {
  const regions = ["east", "west"].map(id => ({ id, divisionId: id, name: id, code: id, provinces: [], included: true, reason: "", ownerSub: null }));
  const c = emptyContent(2026, regions, "CNY"); c.releaseScope = "regions";
  let next = applyPlanningDraft(c, { targets: [{ metric: "revenue", value: "100" }] }, "east");
  const first = next.targets.find(t => t.scope === "territory:east" && t.period === "2026Q1")!;
  next = applyPlanningDraft(next, { targets: [{ metric: "revenue", value: "200" }] }, "east", ["2026Q1"]);
  assert.equal(next.targets.find(t => t.key === first.key)!.target, "10.00");
  assert.equal(next.targets.find(t => t.scope === "workspace")!.target, null);
  assert.equal(next.targets.find(t => t.scope === "territory:west")!.target, null);
  assert.deepEqual(applyPlanningDraft(c, { targets: [{ metric: "revenue", value: "1" }] }), c);
});
