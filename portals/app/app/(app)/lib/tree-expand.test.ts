import { test } from "node:test";
import assert from "node:assert/strict";
import { collapseFromDepth, depthLevels } from "./tree-expand";

test("depthLevels lists every depth past the root, ascending, deduplicated", () => {
  const rows = [{ depth: 0 }, { depth: 2 }, { depth: 1 }, { depth: 2 }, { depth: 0 }];
  assert.deepEqual(depthLevels(rows), [1, 2]);
});

test("depthLevels is empty when nothing sits past the root", () => {
  assert.deepEqual(depthLevels([{ depth: 0 }, { depth: 0 }]), []);
});

test("depthLevels includes a leaf-only tier - a depth with no branches still gets its own button", () => {
  // depth 2 here is a team with no units of its own: nothing to fold, but
  // the reader must still be able to expand down to it.
  const rows = [{ depth: 0 }, { depth: 1 }, { depth: 2 }];
  assert.deepEqual(depthLevels(rows), [1, 2]);
});

test("collapseFromDepth folds a branch at or past the target, leaves shallower ones open", () => {
  const branches = [
    { id: "root", depth: 0 },
    { id: "region", depth: 1 },
    { id: "team", depth: 2 },
  ];
  assert.deepEqual(collapseFromDepth(branches, 1), new Set(["region", "team"]));
  assert.deepEqual(collapseFromDepth(branches, 2), new Set(["team"]));
});

test("collapseFromDepth targeting a leaf-only depth folds nothing - the same as fully expanded", () => {
  // Only units at depth 0/1 branch; depth 2 is leaves with no unit of their
  // own. "展开到" that depth must still reveal everything, not error or
  // leave something folded.
  const branches = [{ id: "root", depth: 0 }, { id: "region", depth: 1 }];
  assert.deepEqual(collapseFromDepth(branches, 2), new Set());
});
