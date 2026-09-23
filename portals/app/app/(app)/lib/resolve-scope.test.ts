import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDataScope } from "./resolve-scope";
import { InMemoryPlanningStore } from "../../domains/planning/store";
import { setAccountStore, setPipelineStore, setPlanningStore, setSignalStore } from "../../domains/shared/registry";
import type { PipelineStore } from "../../domains/pipeline/store";
import type { SignalStore } from "../../domains/signal/store";
import { canSeeRow } from "../../authz/visibility";
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
    listCollaboratedAccountIds: async () => [],
  } as unknown as AccountStore);
  try {
    await planning.seedOrgDefaults(WS);
    const units = await planning.listOrgUnits(WS);
    const south = units.find((u) => u.unitCode === "south")!;
    const team = units.find((u) => u.unitCode === "south_team1")!;
    const north = units.find((u) => u.unitCode === "north")!;
    await planning.setMemberUnits(WS, "usr_boss", [south.id]);
    await planning.setMemberUnits(WS, "usr_rep", [team.id]);
    await planning.setMemberUnits(WS, "usr_north", [north.id]);
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

test("协作人: a collaborator sees the account and its deals, in every scope; removed, they do not", async () => {
  let roster: Array<{ accountId: string; memberSub: string }> = [{ accountId: "acc_shared", memberSub: "usr_helper" }];
  setAccountStore({
    listAccounts: async () => [{ id: "acc_shared", region: "华北" }, { id: "acc_other", region: "华北" }],
    listCollaboratedAccountIds: async (_ws: string, sub: string) =>
      roster.filter((r) => r.memberSub === sub).map((r) => r.accountId),
  } as unknown as AccountStore);
  setPipelineStore({ listOpportunities: async () => [] } as unknown as PipelineStore);
  setSignalStore({ listLeads: async () => [] } as unknown as SignalStore);
  // 华北 is filed under somebody else's territory, so acc_other is filed
  // elsewhere - not 未分区, which every scope may see by design.
  const planning = new InMemoryPlanningStore();
  setPlanningStore(planning);
  try {
    await planning.upsertTerritory(WS, {
      territoryCode: "NORTH_X", name: "North", parentId: null, ownerSub: "usr_owner", status: "active",
      regions: ["华北"], divisionIds: [], unitIds: [],
    });
    const account = { ownerSub: "usr_owner", accountId: "acc_shared" };
    const deal = { ownerSub: "usr_owner", accountId: "acc_shared", territoryId: null };
    const other = { ownerSub: "usr_owner", accountId: "acc_other" };

    for (const setting of [
      { kind: "own" },
      { kind: "territory", territoryIds: [] },
      { kind: "unit", territoryIds: [] },
    ] as ScopeSetting[]) {
      const scope = await resolveDataScope(WS, "usr_helper", authzWith(setting));
      assert.ok(canSeeRow(scope, account), `${setting.kind}: the account`);
      assert.ok(canSeeRow(scope, deal), `${setting.kind}: a deal on it`);
      assert.ok(!canSeeRow(scope, other), `${setting.kind}: not a customer they do not work`);
    }

    roster = [];
    const after = await resolveDataScope(WS, "usr_helper", authzWith({ kind: "own" } as ScopeSetting));
    assert.ok(!canSeeRow(after, account), "removed from the roster, the account goes");
  } finally {
    setAccountStore(null);
    setPipelineStore(null);
    setSignalStore(null);
    setPlanningStore(null);
  }
});
