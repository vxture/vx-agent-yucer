import { test } from "node:test";
import assert from "node:assert/strict";
import { preferredPlanningYear } from "./plan-years";
const years = (...values: number[]) => values.map(year => ({ year, published: true, draft: false }));
test("default year keeps the current working year and otherwise finds real future or historic planning", () => {
  assert.equal(preferredPlanningYear(years(2027), 2026), 2027);
  assert.equal(preferredPlanningYear(years(2025,2027,2026), 2026), 2026);
  assert.equal(preferredPlanningYear(years(2029,2027), 2026), 2027);
  assert.equal(preferredPlanningYear(years(2024,2025), 2026), 2025);
  assert.equal(preferredPlanningYear([], 2026), 2026);
});
