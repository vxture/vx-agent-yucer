import { test } from "node:test";
import assert from "node:assert/strict";
import { coveringTerritories, unsetWorkspaceMetrics, untargetedTerritories } from "./suggest";

// The planning assistant's data half. Same discipline as every suggestion
// engine here: the refusals get the tests, because confident output with
// nothing behind it is the failure mode.

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

// --- coveringTerritories ----------------------------------------------------

test("the covering territory is the one lead routing would pick", () => {
  const ts = [
    { id: "east", name: "East", regions: ["华东", "华中"], status: "active" },
    { id: "old", name: "Old", regions: ["华东"], status: "retired" },
  ];
  assert.deepEqual(coveringTerritories("华东", ts).map((t) => t.id), ["east"]);
});

test("no region or no coverage means silence", () => {
  const ts = [{ id: "east", name: "East", regions: ["华东"], status: "active" }];
  assert.deepEqual(coveringTerritories(null, ts), []);
  assert.deepEqual(coveringTerritories("  ", ts), []);
  assert.deepEqual(coveringTerritories("东北", ts), []);
});
