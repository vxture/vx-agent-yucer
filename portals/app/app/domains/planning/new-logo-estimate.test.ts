import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyContent, validateContent } from "./plan-model";
import { defaultNewLogoEstimate, estimateNewLogos, validNewLogoEstimate } from "./new-logo-estimate";
import { addPlanningMetric, initializeNewLogoEstimates, updateNewLogoEstimate, updatePlanningAmount } from "../../(app)/lib/planning-autofill";
import { applyPlanningDraft } from "../../(app)/lib/planning-assist";
import { readPlanningDraft } from "./plan-assist-draft";
const annual = (c: ReturnType<typeof emptyContent>) => c.targets.find(t => t.metric === "new_logo" && t.period === "Y2028")!;
function fixture(currency = "CNY") {
  let c = emptyContent(2028, [], currency); c.releaseScope = "company";
  c = updatePlanningAmount(c, c.targets[0]!.key, "target", "1000000");
  return addPlanningMetric(c, "workspace", "new_logo");
}
test("editable CNY acquisition assumptions fill annual tiers and integer quarter totals", () => {
  const c = fixture(), line = annual(c);
  assert.deepEqual([line.floor, line.target, line.stretch], ["3", "5", "6"]);
  assert.deepEqual(c.targets.filter(t => t.metric === "new_logo" && t.period !== "Y2028").map(t => t.target), ["0", "1", "1", "3"]);
  assert.ok(c.targets.filter(t => t.period !== "Y2028").every(t => !t.newLogoEstimate));
  validateContent(c, true);
  assert.equal(estimateNewLogos("1000000.01", line.newLogoEstimate!), "6");
  assert.equal(estimateNewLogos(null, line.newLogoEstimate!), null);
  assert.equal(estimateNewLogos("0", line.newLogoEstimate!), "0");
});
test("automatic estimates follow revenue, manual counts remain unchanged, applying assumptions restores automatic mode", () => {
  let c = fixture(); const key = annual(c).key;
  c = updatePlanningAmount(c, c.targets[0]!.key, "target", "2000000");
  assert.equal(annual(c).target, "10");
  c = updatePlanningAmount(c, key, "target", "30");
  c = updatePlanningAmount(c, c.targets[0]!.key, "target", "3000000");
  assert.equal(annual(c).target, "30"); assert.equal(annual(c).newLogoEstimate!.automatic, false);
  c = updateNewLogoEstimate(c, key, { ...defaultNewLogoEstimate("CNY", "projects")!, revenueShare: "75" });
  assert.equal(annual(c).target, "5"); assert.equal(annual(c).newLogoEstimate!.automatic, true);
  validateContent(c, true);
});
test("zero revenue retains assumptions and currencies without references are never silently converted", () => {
  let c = fixture(); c = updatePlanningAmount(c, c.targets[0]!.key, "target", "0"); assert.equal(annual(c).target, "0");
  c = updatePlanningAmount(c, c.targets[0]!.key, "target", "1000000"); assert.equal(annual(c).target, "5");
  let usd = fixture("USD"); assert.equal(annual(usd).target, null); assert.equal(annual(usd).newLogoEstimate, undefined);
  usd = updateNewLogoEstimate(usd, annual(usd).key, { preset: "custom", currency: "USD", revenueShare: "50", firstOrderAmount: "10000", automatic: true });
  assert.equal(annual(usd).target, "50"); validateContent(usd, true);
});
test("legacy explicit totals stay intact; empty editable company rows seed once and manual clears remain empty", () => {
  let c = fixture(); delete annual(c).newLogoEstimate; annual(c).target = "9";
  assert.equal(initializeNewLogoEstimates(c), c);
  for (const tier of ["floor", "target", "stretch"] as const) annual(c)[tier] = null;
  c = initializeNewLogoEstimates(c); assert.equal(annual(c).target, "5");
  c = updatePlanningAmount(c, annual(c).key, "target", "");
  assert.equal(initializeNewLogoEstimates(c), c); assert.equal(annual(c).target, null);
});
test("locked customer quarters and invalid assumption boundaries are preserved or rejected", () => {
  let c = fixture(); const q1 = c.targets.find(t => t.metric === "new_logo" && t.period === "2028Q1")!;
  q1.target = "2";
  c = updateNewLogoEstimate(c, annual(c).key, defaultNewLogoEstimate("CNY")!, ["2028Q1"]);
  assert.equal(c.targets.find(t => t.key === q1.key)!.target, "2");
  assert.equal(c.targets.filter(t => t.metric === "new_logo" && t.period !== "Y2028").reduce((n,t) => n + Number(t.target), 0), 5);
  const basis = defaultNewLogoEstimate("CNY")!;
  for (const patch of [{ revenueShare: "101" }, { revenueShare: "-1" }, { firstOrderAmount: "0" }, { firstOrderAmount: "1.001" }, { preset: "unrecognized" }, { automatic: "yes" }, { currency: "cny" }]) assert.equal(validNewLogoEstimate({ ...basis, ...patch }), false);
  assert.equal(validNewLogoEstimate(null), false); assert.equal(validNewLogoEstimate([]), false);
  const forged = fixture(); annual(forged).target = "6";
  assert.throws(() => validateContent(forged, false), /new_logo_basis_mismatch/);
  annual(forged).newLogoEstimate!.currency = "USD";
  assert.throws(() => validateContent(forged, false), /new_logo_basis_mismatch/);
});
test("assistant assumptions share the same calculation; explicit user counts take precedence", () => {
  const basis = defaultNewLogoEstimate("CNY", "software")!;
  const parsed = readPlanningDraft(JSON.stringify({ fields: { newCustomerEstimate: basis } })); assert.ok(parsed);
  const c = applyPlanningDraft(fixture(), parsed.patch); assert.equal(annual(c).target, "5");
  const manual = applyPlanningDraft(c, { targets: [{ metric: "new_logo", value: "12" }], newCustomerEstimate: basis });
  assert.equal(annual(manual).target, "12"); assert.equal(annual(manual).newLogoEstimate!.automatic, false);
  assert.equal(readPlanningDraft(JSON.stringify({ fields: { newCustomerEstimate: { ...basis, firstOrderAmount: "0" } } })), null);
  assert.throws(() => estimateNewLogos("100", { ...basis, revenueShare: "101" }), /invalid_new_logo_estimate/);
});
