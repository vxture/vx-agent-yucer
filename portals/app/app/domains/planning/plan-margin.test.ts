import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyContent, type PlanContent, type PlanTarget } from "./plan-model";
import { marginAmount, planningMarginRate, validateMarginRates } from "./plan-margin";
import { readPlanningDraft } from "./plan-assist-draft";

function fixture() {
  const content = emptyContent(2028, [], "CNY");
  Object.assign(content.targets[0]!, { floor: "600", target: "1000", stretch: "1200" });
  const margin: PlanTarget = { ...content.targets[0]!, key: "margin", metric: "margin", floor: "300", target: "400", stretch: "500" };
  content.targets.push(margin);
  return { content, margin };
}

test("legacy margin amounts derive rates from the formal revenue baseline with cent precision", () => {
  const { content, margin } = fixture();
  assert.deepEqual((["floor", "target", "stretch"] as const).map(tier => planningMarginRate(content, margin, tier)), ["30.00", "40.00", "50.00"]);
  margin.target = "333.35";
  assert.equal(planningMarginRate(content, margin, "target"), "33.34");
  assert.equal(marginAmount("123.45", "42.5"), "52.46");
  assert.equal(marginAmount(null, "40"), null);
  assert.equal(marginAmount("100", null), null);
  assert.throws(() => marginAmount("100", "100.01"), /invalid_margin_rate/);
});

test("unavailable and malformed revenue never invent a legacy margin rate", () => {
  const { content, margin } = fixture();
  content.targets[0]!.target = "0";
  assert.equal(planningMarginRate(content, margin, "target"), null);
  content.targets[0]!.target = "invalid";
  assert.equal(planningMarginRate(content, margin, "target"), null);
  content.targets.shift();
  assert.equal(planningMarginRate(content, margin, "target"), null);
  margin.marginRates = { floor: "30", target: "42.5", stretch: "50" };
  assert.equal(planningMarginRate(content, margin, "target"), "42.5");
});

test("zero-revenue quarters retain explicit annual rates but unknown quarters remain unknown", () => {
  const { content, margin } = fixture();
  const quarter: PlanTarget = { ...margin, key: "q1", period: "2028Q1", target: "0" };
  content.targets.push(quarter);
  assert.equal(planningMarginRate(content, quarter, "target"), null);
  margin.marginRates = { floor: "30", target: "42.5", stretch: "50" };
  assert.equal(planningMarginRate(content, quarter, "target"), "42.5");
  quarter.target = null;
  assert.equal(planningMarginRate(content, quarter, "target"), null);
});

test("rate configuration rejects misplaced, incomplete, nonnumeric and descending settings", () => {
  const { content, margin } = fixture();
  margin.marginRates = { floor: "30", target: "40", stretch: "50" };
  validateMarginRates(content);
  const rejects = (mutate: (c: PlanContent) => void, code = /invalid_margin_rate/) => {
    const c = structuredClone(content); mutate(c); assert.throws(() => validateMarginRates(c), code);
  };
  rejects(c => { c.targets[0]!.marginRates = margin.marginRates; });
  rejects(c => { c.targets[1]!.period = "2028Q1"; });
  rejects(c => { c.targets[1]!.marginRates = null as never; });
  rejects(c => { c.targets[1]!.marginRates = { target: "40" } as never; });
  rejects(c => { c.targets[1]!.marginRates!.target = "40.001"; });
  rejects(c => { c.targets[1]!.marginRates!.target = 40 as never; });
  rejects(c => { c.targets[1]!.marginRates!.target = "20"; }, /target_ladder/);
  rejects(c => { c.targets[1]!.marginRates!.target = null; }, /margin_rate_mismatch/);
  margin.marginRates.target = null; margin.target = null;
  validateMarginRates(content);
  content.targets.shift();
  margin.marginRates = { floor: null, target: null, stretch: null };
  margin.floor = null; margin.stretch = null;
  validateMarginRates(content);
});

test("assistant margin input is a percentage and rejects monetary values above 100", () => {
  const read = (value: string) => readPlanningDraft(JSON.stringify({ fields: { targets: [{ metric: "margin", value }] } }));
  assert.equal(read("100")?.patch.targets[0]!.value, "100");
  assert.equal(read("42.5")?.patch.targets[0]!.value, "42.5");
  assert.equal(read("101"), null);
  assert.equal(read("400000"), null);
});
