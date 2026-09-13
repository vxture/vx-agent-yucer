import { test } from "node:test";
import assert from "node:assert/strict";
import { orgUnitIcon } from "./org-unit-icon";

test("L0 and L1 stay depth-only, empty or not", () => {
  assert.equal(orgUnitIcon({ depth: 0, children: 0 }), "buildings");
  assert.equal(orgUnitIcon({ depth: 0, children: 5 }), "buildings");
  assert.equal(orgUnitIcon({ depth: 1, children: 0 }), "building");
  assert.equal(orgUnitIcon({ depth: 1, children: 3 }), "building");
});

test("L2 and deeper reads children, not depth", () => {
  // A team - nothing under it - keeps the people icon at any depth from L2 down.
  assert.equal(orgUnitIcon({ depth: 2, children: 0 }), "users");
  assert.equal(orgUnitIcon({ depth: 5, children: 0 }), "users");
  // A department that still has departments of its own reads as still
  // branching, at any depth from L2 down - not a fifth icon per depth.
  assert.equal(orgUnitIcon({ depth: 2, children: 2 }), "tree-structure");
  assert.equal(orgUnitIcon({ depth: 6, children: 1 }), "tree-structure");
});
