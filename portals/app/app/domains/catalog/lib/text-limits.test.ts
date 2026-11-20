import test from "node:test";
import assert from "node:assert/strict";
import { planProduct, planSolution } from "./pricing";
import { CATALOG_TEXT_LIMITS as L, catalogTextTooLong } from "./text-limits";
const product = { productCode: "P", name: "Product", typeId: null, unitId: "seat", statusId: "active" };
const solution = { solutionCode: "S", name: "Solution", summary: null, scenario: null, status: "active" as const };
const items = [{ productId: "p", quantity: 0.5, optional: false, note: null }];
test("names and descriptions accept the limit and refuse over-limit new text", () => {
  assert.equal(planProduct({ ...product, name: "a".repeat(L.name) }).ok, true);
  assert.equal(planProduct({ ...product, name: "a".repeat(L.name + 1) }).ok, false);
  for (const field of ["name", "summary", "scenario"] as const) {
    assert.equal(planSolution({ ...solution, [field]: "a".repeat(L[field]) }, items).ok, true);
    const r = planSolution({ ...solution, [field]: "a".repeat(L[field] + 1) }, items);
    assert.equal(!r.ok && r.violations[0].code, "catalog_text_too_long");
  }
  assert.equal(planSolution(solution, [{ ...items[0], note: "a".repeat(L.note + 1) }]).ok, false);
});
test("unrelated edits preserve legacy text but cannot replace or move it to another field/item", () => {
  const legacy = "a".repeat(400);
  assert.equal(planProduct({ ...product, name: legacy }, { name: legacy }).ok, true);
  assert.equal(planProduct({ ...product, name: legacy + "b" }, { name: legacy }).ok, false);
  const prior = { solution: { ...solution, summary: legacy }, items: [{ ...items[0], note: legacy }] };
  assert.equal(planSolution(prior.solution, prior.items, prior).ok, true);
  assert.equal(planSolution(prior.solution, [{ ...prior.items[0], productId: "other" }], prior).ok, false);
  assert.equal(planSolution({ ...prior.solution, scenario: legacy }, prior.items, prior).ok, false);
  assert.equal(catalogTextTooLong("summary", ` ${legacy} `, legacy), false);
  assert.equal(catalogTextTooLong("summary", null), false);
});
test("quantities are positive finite values, including fractional sale units", () => {
  assert.equal(planSolution(solution, items).ok, true);
  for (const quantity of [0, -1, NaN, Infinity, -Infinity]) {
    const r = planSolution(solution, [{ ...items[0], quantity }]);
    assert.equal(!r.ok && r.violations[0].code, "quantity_positive");
  }
});
