import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSystemStatus,
  planProductStatusChange,
  planStatus,
  planStatusRemoval,
  SYSTEM_STATUS_DEFAULTS,
} from "./status-vocab";

test("the canonical defaults carry real names and descriptions", () => {
  // DATA, not UI copy: the DDL backfill and the service's lazy seeding both
  // write these values, and a row that cannot say its own name would couple
  // the database to a frontend dictionary.
  assert.deepEqual(
    SYSTEM_STATUS_DEFAULTS.map((d) => d.statusCode),
    ["in_development", "active", "retired"],
  );
  for (const d of SYSTEM_STATUS_DEFAULTS) {
    assert.ok(d.name.length > 0);
    assert.ok(d.description.length > 0);
  }
});

test("isSystemStatus is exactly the three canonical codes", () => {
  assert.equal(isSystemStatus("active"), true);
  assert.equal(isSystemStatus("presale"), false);
});

test("a status needs a code and a name; the description is optional", () => {
  const r = planStatus({ statusCode: " presale ", name: " 预售 ", description: "  " });
  assert.equal(r.ok && r.value.statusCode, "presale");
  assert.equal(r.ok && r.value.description, null);
  assert.equal(planStatus({ statusCode: " ", name: "x", description: null }).ok, false);
  assert.equal(planStatus({ statusCode: "x", name: " ", description: null }).ok, false);
});

test("canonical statuses never delete; added ones only when empty", () => {
  const sys = planStatusRemoval("active", 0);
  assert.equal(!sys.ok && sys.violations[0]!.code, "system_status");
  const carried = planStatusRemoval("presale", 2);
  assert.equal(!carried.ok && carried.violations[0]!.code, "status_in_use");
  assert.equal(planStatusRemoval("presale", 0).ok, true);
});

test("a product moves freely between statuses, except back into 在研", () => {
  assert.equal(planProductStatusChange("in_development", "active").ok, true);
  assert.equal(planProductStatusChange("active", "retired").ok, true);
  assert.equal(planProductStatusChange("retired", "active").ok, true);
  assert.equal(planProductStatusChange("active", "presale").ok, true);

  const same = planProductStatusChange("active", "active");
  assert.equal(!same.ok && same.violations[0]!.code, "status_unchanged");
  for (const from of ["active", "retired", "presale"]) {
    const r = planProductStatusChange(from, "in_development");
    assert.equal(!r.ok && r.violations[0]!.code, "development_is_birth_state");
  }
});
