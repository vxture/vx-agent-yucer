import test from "node:test";
import assert from "node:assert/strict";
import { changedPlanFields, preservePlanManualFields } from "./plan-manual-fields";
import { emptyStrategyResult } from "./strategy-result";
const base = { name: "Strategy", period: "2099", ownerSub: null, objective: null, result: emptyStrategyResult() };
test("detects scalar, explicit blank, composition and nested manual corrections", () => {
  const current = { ...base, name: "", productIds: ["p1"], result: { ...base.result, resources: { ...base.result.resources, fundsNote: "Human correction" } } };
  assert.deepEqual(changedPlanFields(current, base), ["name", "productIds", "result.resources.fundsNote"]);
});
test("protected nested values survive while unrelated model additions remain possible", () => {
  const current = { ...base, name: "", result: { ...base.result, resources: { ...base.result.resources, fundsNote: "Human budget" } } };
  const proposed = { name: "Model name", result: { ...base.result, resources: { ...base.result.resources, fundsNote: "Model budget", people: "3" } } };
  const result = preservePlanManualFields(proposed, current, ["name", "result.resources.fundsNote"]);
  assert.equal(result.name, "");
  const resources = (result.result as typeof base.result).resources;
  assert.equal(resources.fundsNote, "Human budget");assert.equal(resources.people, "3");
  assert.equal(proposed.name, "Model name", "does not mutate the proposal input");
});
test("omitted model sections are not fabricated and unknown paths do not write properties", () => {
  assert.deepEqual(preservePlanManualFields({ name: "Model" }, base, ["result.goals", "__proto__.polluted" as never]), { name: "Model" });
});
