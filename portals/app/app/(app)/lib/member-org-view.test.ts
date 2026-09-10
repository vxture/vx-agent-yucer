import assert from "node:assert/strict";
import { test } from "node:test";
import { UNPLACED_ROW_ID, branchIds, buildOrgView, flattenOrgView } from "./member-org-view";

const UNITS = [
  { id: "hq", name: "总部", parentId: null },
  { id: "east", name: "华东", parentId: "hq" },
  { id: "east_t1", name: "华东一组", parentId: "east" },
  { id: "south", name: "华南", parentId: "hq" },
];

test("people sit under the unit they are placed in; one person in two units appears under both", () => {
  const view = buildOrgView(UNITS, [
    { sub: "a", name: "甲", status: "active", unitIds: ["east_t1"] },
    { sub: "b", name: "乙", status: "active", unitIds: ["east", "south"] },
    { sub: "c", name: "丙", status: "inactive", unitIds: [] },
  ]);
  assert.deepEqual(view.roots.map((r) => r.name), ["总部"]);
  const hq = view.roots[0]!;
  assert.deepEqual(hq.people, []);
  assert.deepEqual(hq.children.map((c) => c.name), ["华东", "华南"]);
  const [east, south] = hq.children;
  assert.deepEqual(east!.people.map((p) => p.name), ["乙"]);
  assert.deepEqual(east!.children[0]!.people.map((p) => p.name), ["甲"]);
  assert.deepEqual(south!.people.map((p) => p.name), ["乙"]);
  assert.deepEqual(view.unplaced.map((p) => p.name), ["丙"]);
});

test("a placement in a unit the tree no longer has counts as unplaced; an orphan unit is shown as a root", () => {
  const view = buildOrgView(
    [...UNITS, { id: "lost", name: "孤儿", parentId: "gone" }],
    [{ sub: "a", name: "甲", status: "active", unitIds: ["nope"] }],
  );
  assert.deepEqual(view.unplaced.map((p) => p.name), ["甲"]);
  assert.deepEqual(view.roots.map((r) => r.name), ["总部", "孤儿"]);
});

test("flattened in tree order with depth; a folded branch hides its subtree; 未归属 last, only when somebody is there", () => {
  const view = buildOrgView(UNITS, [
    { sub: "a", name: "甲", status: "active", unitIds: ["east_t1"] },
    { sub: "c", name: "丙", status: "inactive", unitIds: [] },
  ]);
  const open = flattenOrgView(view, new Set());
  assert.deepEqual(open.map((r) => [r.name, r.depth, r.children, r.people.length]), [
    ["总部", 0, 2, 0], ["华东", 1, 1, 0], ["华东一组", 2, 0, 1], ["华南", 1, 0, 0], ["", 0, 0, 1],
  ]);
  assert.equal(open[4]!.id, UNPLACED_ROW_ID);
  assert.equal(open[4]!.unplaced, true);
  const folded = flattenOrgView(view, new Set(["east"]));
  assert.deepEqual(folded.map((r) => r.name), ["总部", "华东", "华南", ""]);
  assert.deepEqual(branchIds(view), ["hq", "east"]);
  const nobodyUnplaced = flattenOrgView(buildOrgView(UNITS, []), new Set());
  assert.equal(nobodyUnplaced.some((r) => r.unplaced), false);
});
