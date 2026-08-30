import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "../../shared/result";
import { planTerritory, type KnownTerritory, type TerritoryDraft } from "./territory";

const draft = (over: Partial<TerritoryDraft> = {}): TerritoryDraft => ({
  territoryCode: "EAST",
  name: "East China",
  parentId: null,
  ownerSub: null,
  regions: [],
  status: "active",
  ...over,
});

const known = (id: string, code: string, parentId: string | null = null): KnownTerritory => ({
  id,
  territoryCode: code,
  parentId,
});

test("a territory needs a code and a name", () => {
  assert.equal(
    planTerritory(draft({ territoryCode: "  " })).ok === false &&
      (planTerritory(draft({ territoryCode: "  " })) as { violations: { code: string }[] })
        .violations[0].code,
    "code_required",
  );
  const r = planTerritory(draft({ name: "   " }));
  assert.equal(r.ok === false && r.violations[0].code, "name_required");
});

test("code and name are trimmed, because a trailing space is a different code", () => {
  // territory_code is the anchor and workspace-unique: "EAST " and "EAST" would
  // be two regions with one name, and the second import would create the twin.
  const t = unwrap(planTerritory(draft({ territoryCode: " EAST ", name: " East China " })));
  assert.equal(t.territoryCode, "EAST");
  assert.equal(t.name, "East China");
});

test("an unknown status is refused", () => {
  const r = planTerritory(draft({ status: "paused" as never }));
  assert.equal(r.ok === false && r.violations[0].code, "unknown_status");
});

test("a parent that does not exist is refused by name, not by a foreign key", () => {
  const r = planTerritory(draft({ parentId: "terr_nope" }), [known("terr_1", "EAST")]);
  assert.equal(r.ok === false && r.violations[0].code, "parent_not_found");
});

test("a territory cannot be its own parent", () => {
  const r = planTerritory(draft({ territoryCode: "EAST", parentId: "terr_1" }), [
    known("terr_1", "EAST"),
  ]);
  assert.equal(r.ok === false && r.violations[0].code, "parent_cycle");
});

test("a cycle THROUGH A CHAIN is refused too", () => {
  // EAST -> NORTH -> EAST. The FK is satisfied at every step: a cycle is legal
  // to Postgres and nonsense to every reader of the hierarchy, so nothing below
  // this function can catch it.
  const existing = [known("terr_1", "EAST"), known("terr_2", "NORTH", "terr_1")];
  const r = planTerritory(draft({ territoryCode: "EAST", parentId: "terr_2" }), existing);
  assert.equal(r.ok === false && r.violations[0].code, "parent_cycle");
});

test("a deeper chain that does NOT close is allowed", () => {
  // EAST -> NORTH -> SOUTH is a tree, not a loop. Refusing it would make the
  // cycle check useless: any hierarchy at all would be rejected.
  const existing = [
    known("terr_1", "EAST"),
    known("terr_2", "NORTH", "terr_3"),
    known("terr_3", "SOUTH"),
  ];
  assert.ok(planTerritory(draft({ territoryCode: "EAST", parentId: "terr_2" }), existing).ok);
});

test("a NEW territory may name any existing parent", () => {
  // Nothing can point at it yet, so no chain can come back to it.
  assert.ok(planTerritory(draft({ territoryCode: "WEST", parentId: "terr_1" }), [
    known("terr_1", "EAST"),
  ]).ok);
});
