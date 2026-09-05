import { test } from "node:test";
import assert from "node:assert/strict";
import { planProductType, planTypeRemoval } from "./type-vocab";

test("trims and accepts a code and a name", () => {
  const r = planProductType({ typeCode: " 平台 ", name: " 平台 ", status: "active" });
  assert.equal(r.ok && r.value.typeCode, "平台");
});

test("refuses a blank code or name", () => {
  assert.equal(planProductType({ typeCode: " ", name: "x", status: "active" }).ok, false);
  assert.equal(planProductType({ typeCode: "x", name: " ", status: "active" }).ok, false);
});

test("a type deletes only when nothing carries it", () => {
  const carried = planTypeRemoval(3);
  assert.equal(!carried.ok && carried.violations[0]!.code, "type_in_use");
  assert.equal(planTypeRemoval(0).ok, true);
});
