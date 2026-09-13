import assert from "node:assert/strict";
import { test } from "node:test";
import { UNPLACED_ROW_ID, branchIds, branchNodes, buildOrgView, flattenOrgView, personRowId, unitOptions } from "./member-org-view";

const UNITS = [
  { id: "hq", name: "总部", parentId: null, territories: [] },
  { id: "east", name: "华东", parentId: "hq", territories: ["华东区域"] },
  { id: "east_t1", name: "华东一组", parentId: "east", territories: [] },
  { id: "south", name: "华南", parentId: "hq", territories: [] },
];

test("people sit under the unit they are placed in; one person in two units appears under both", () => {
  const view = buildOrgView(UNITS, [
    { sub: "a", name: "甲", status: "active", unitIds: ["east_t1"], scope: "workspace", territories: [] },
    { sub: "b", name: "乙", status: "active", unitIds: ["east", "south"], scope: "workspace", territories: [] },
    { sub: "c", name: "丙", status: "inactive", unitIds: [], scope: "workspace", territories: [] },
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
    [...UNITS, { id: "lost", name: "孤儿", parentId: "gone", territories: [] }],
    [{ sub: "a", name: "甲", status: "active", unitIds: ["nope"], scope: "workspace", territories: [] }],
  );
  assert.deepEqual(view.unplaced.map((p) => p.name), ["甲"]);
  assert.deepEqual(view.roots.map((r) => r.name), ["总部", "孤儿"]);
});

test("flattened in tree order: under a unit its child units first, then its people as rows; a folded row hides its subtree; 未归属 last", () => {
  const view = buildOrgView(UNITS, [
    { sub: "a", name: "甲", status: "active", unitIds: ["east_t1"], scope: "workspace", territories: [] },
    { sub: "b", name: "乙", status: "active", unitIds: ["hq"], scope: "workspace", territories: [] },
    { sub: "c", name: "丙", status: "inactive", unitIds: [], scope: "workspace", territories: [] },
  ]);
  const open = flattenOrgView(view, new Set());
  assert.deepEqual(open.map((r) => [r.kind, r.name, r.depth]), [
    ["unit", "总部", 0],
    ["unit", "华东", 1],
    ["unit", "华东一组", 2],
    ["person", "甲", 3],
    ["unit", "华南", 1],
    ["person", "乙", 1],
    ["unit", "", 0],
    ["person", "丙", 1],
  ]);
  assert.equal(open[6]!.id, UNPLACED_ROW_ID);
  assert.equal(open[3]!.id, personRowId("east_t1", "a"));
  assert.equal((open[7] as { unitId: string | null }).unitId, null);
  const folded = flattenOrgView(view, new Set(["east", UNPLACED_ROW_ID]));
  assert.deepEqual(folded.map((r) => r.name), ["总部", "华东", "华南", "乙", ""]);
  assert.deepEqual(branchIds(view), ["hq", "east", "east_t1", UNPLACED_ROW_ID]);
  assert.deepEqual(branchNodes(view), [
    { id: "hq", depth: 0 },
    { id: "east", depth: 1 },
    { id: "east_t1", depth: 2 },
    { id: UNPLACED_ROW_ID, depth: 0 },
  ]);
  assert.deepEqual(unitOptions(view).map((u) => [u.name, u.depth]), [["总部", 0], ["华东", 1], ["华东一组", 2], ["华南", 1]]);
  const nobodyUnplaced = flattenOrgView(buildOrgView(UNITS, []), new Set());
  assert.equal(nobodyUnplaced.some((r) => r.id === UNPLACED_ROW_ID), false);
});

test("totalPeople rolls up the whole subtree; people stays direct-only (owner, 2026-09-13: same 递归 fix as org-panel.tsx's own totalMembers)", () => {
  const view = buildOrgView(UNITS, [
    { sub: "a", name: "甲", status: "active", unitIds: ["east_t1"], scope: "workspace", territories: [] },
    { sub: "b", name: "乙", status: "active", unitIds: ["east", "south"], scope: "workspace", territories: [] },
  ]);
  const hq = view.roots[0]!;
  const [east, south] = hq.children;
  const eastT1 = east!.children[0]!;
  // Direct is unchanged - each node sees only who is placed AT it.
  assert.deepEqual([eastT1.people.length, east!.people.length, hq.people.length, south!.people.length], [1, 1, 0, 1]);
  // Total climbs the chain: 华东一组's own 1, plus 华东's own 1 (乙, placed
  // directly there) makes 华东's total 2; 总部's total is the SUM of its
  // children's totals (华东's 2 plus 华南's 1) - 乙, placed in both 华东 and
  // 华南 (0053), is counted once in each subtree and so twice at 总部, same
  // as listOrgUnits' own totalMembers double-counts a multi-unit placement.
  assert.deepEqual(
    [eastT1.totalPeople, east!.totalPeople, hq.totalPeople, south!.totalPeople],
    [1, 2, 3, 1],
  );
  // flattenOrgView carries the same total onto the row as `totalHeadcount`,
  // next to the direct-only `headcount`.
  const rows = flattenOrgView(view, new Set());
  const eastRow = rows.find((r) => r.kind === "unit" && r.name === "华东")!;
  assert.deepEqual([(eastRow as { headcount: number }).headcount, (eastRow as { totalHeadcount: number }).totalHeadcount], [1, 2]);
});
