import { test } from "node:test";
import assert from "node:assert/strict";
import { uncoveredRegions, unsetWorkspaceMetrics, untargetedTerritories } from "./suggest";

// The planning assistant's data half. Same discipline as every suggestion
// engine here: the refusals get the tests, because confident output with
// nothing behind it is the failure mode.

// --- uncoveredRegions -------------------------------------------------------

test("a region with customers and no active coverage is a gap, counted", () => {
  const out = uncoveredRegions(
    ["华东", "华东", "西北", null, "  ", "华南"],
    [{ regions: ["华南"], status: "active" }],
  );
  assert.deepEqual(out, [
    { region: "华东", accounts: 2 },
    { region: "西北", accounts: 1 },
  ]);
});

test("a RETIRED territory's regions do not count as coverage", () => {
  // A hole behind a tombstone is still a hole: routing only matches active
  // territories, so history must not hide the gap.
  const out = uncoveredRegions(["华东"], [{ regions: ["华东"], status: "retired" }]);
  assert.deepEqual(out, [{ region: "华东", accounts: 1 }]);
});

test("full coverage means silence, not an empty-but-rendered list", () => {
  assert.deepEqual(uncoveredRegions(["华东"], [{ regions: ["华东"], status: "active" }]), []);
  assert.deepEqual(uncoveredRegions([], []), []);
});

// --- untargetedTerritories --------------------------------------------------

const T = (id: string, status = "active") => ({ id, name: id, status });

test("a territory with any target this period is not owed one", () => {
  const out = untargetedTerritories(
    "2026H2",
    [T("east"), T("south")],
    [{ period: "2026H2", scopeType: "territory", territoryId: "east" }],
  );
  assert.deepEqual(out.map((t) => t.id), ["south"]);
});

test("a target from ANOTHER period does not cover this one", () => {
  const out = untargetedTerritories(
    "2026H2",
    [T("east")],
    [{ period: "2026H1", scopeType: "territory", territoryId: "east" }],
  );
  assert.deepEqual(out.map((t) => t.id), ["east"]);
});

test("a retired territory is not owed a target", () => {
  assert.deepEqual(untargetedTerritories("2026H2", [T("old", "retired")], []), []);
});

// --- unsetWorkspaceMetrics --------------------------------------------------

test("only workspace-scoped targets count - a territory target is not a workspace answer", () => {
  const out = unsetWorkspaceMetrics("2026H2", [
    { period: "2026H2", scopeType: "workspace", metric: "revenue" },
    { period: "2026H2", scopeType: "territory", metric: "pipeline" },
  ]);
  assert.deepEqual(out, ["new_logo", "pipeline", "margin"]);
});

test("all set means an empty list", () => {
  const out = unsetWorkspaceMetrics("2026H2", [
    { period: "2026H2", scopeType: "workspace", metric: "revenue" },
    { period: "2026H2", scopeType: "workspace", metric: "new_logo" },
    { period: "2026H2", scopeType: "workspace", metric: "pipeline" },
    { period: "2026H2", scopeType: "workspace", metric: "margin" },
  ]);
  assert.deepEqual(out, []);
});
