import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOrgView } from "./member-org-view";

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
