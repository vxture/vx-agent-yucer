import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDataScope } from "./resolve-scope";
import { InMemoryPlanningStore } from "../../domains/planning/store";
import { setAccountStore, setPlanningStore } from "../../domains/shared/registry";
import type { AccountStore } from "../../domains/account/store";
import type { AuthzStore } from "../../authz/store";
import type { ScopeSetting } from "../../authz/scope";

/* 按组织 (incr/0052), resolved end to end on the memory store: the member's
 * unit, the subtree, the people in it, the territories the subtree works,
 * the ground they cover, and the customers on it. */

const WS = "ws_scope";

function authzWith(setting: ScopeSetting): AuthzStore {
  return { getScope: async () => setting } as unknown as AuthzStore;
}

test("a unit-scoped member sees their subtree's people and ground; placed nowhere, the queue alone", async () => {
  const planning = new InMemoryPlanningStore({
    divisions: async () => [{ id: "d_south", name: "华南" }, { id: "d_north", name: "华北" }],
  });
  setPlanningStore(planning);
  setAccountStore({
    listAccounts: async () => [
      { id: "acc_south", region: "华南" },
      { id: "acc_north", region: "华北" },
      { id: "acc_nowhere", region: null },
    ],
  } as unknown as AccountStore);
  try {
    await planning.seedOrgDefaults(WS);
    const units = await planning.listOrgUnits(WS);
    const south = units.find((u) => u.unitCode === "south")!;
    const team = units.find((u) => u.unitCode === "south_team1")!;
    const north = units.find((u) => u.unitCode === "north")!;
    await planning.setMemberUnit(WS, "usr_boss", south.id);
    await planning.setMemberUnit(WS, "usr_rep", team.id);
    await planning.setMemberUnit(WS, "usr_north", north.id);
    await planning.upsertTerritory(WS, {
      territoryCode: "SOUTH", name: "South", parentId: null, ownerSub: "usr_owner", status: "active",
      regions: [], divisionIds: ["d_south"], unitIds: [team.id],
    });
    await planning.upsertTerritory(WS, {
      territoryCode: "NORTH", name: "North", parentId: null, ownerSub: null, status: "active",
      regions: [], divisionIds: ["d_north"], unitIds: [north.id],
    });

    const scope = await resolveDataScope(WS, "usr_boss", authzWith({ kind: "unit", territoryIds: [] }));
    assert.equal(scope.kind, "unit");
    if (scope.kind !== "unit") return;
    assert.deepEqual(scope.unitIds, [south.id, team.id], "the subtree, root first");
    assert.deepEqual([...scope.memberSubs].sort(), ["usr_boss", "usr_rep"]);
    assert.deepEqual(scope.territoryIds.map((id) => id), [(await planning.listTerritories(WS)).find((t) => t.territoryCode === "SOUTH")!.id]);
    assert.deepEqual(scope.accountIds, ["acc_south"]);
    assert.deepEqual(scope.ownerSubs, ["usr_owner"]);
    assert.deepEqual(scope.unplacedAccountIds, ["acc_nowhere"]);

    const nowhere = await resolveDataScope(WS, "usr_ghost", authzWith({ kind: "unit", territoryIds: [] }));
    assert.equal(nowhere.kind, "unit");
    if (nowhere.kind !== "unit") return;
    assert.deepEqual([nowhere.unitIds, nowhere.memberSubs, nowhere.territoryIds, nowhere.accountIds], [[], [], [], []]);
  } finally {
    setPlanningStore(null);
    setAccountStore(null);
  }
});
