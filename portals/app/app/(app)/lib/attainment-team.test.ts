import { test } from "node:test";
import assert from "node:assert/strict";
import { attainmentTeamMembers } from "./attainment-team";
import type { OrgUnitRecord } from "../../domains/planning/store";
const units: OrgUnitRecord[] = [
  { id: "root", parentId: null },
  { id: "east", parentId: "root" },
  { id: "east-sales", parentId: "east" },
  { id: "west", parentId: "root" },
].map((u) => ({
  ...u,
  workspaceId: "ws",
  unitCode: u.id,
  name: u.id,
  kindId: "kind",
  leaderSub: null,
  sortOrder: 0,
}));
const members = ["me", "alice", "bob", "retired"].map((sub) => ({
  sub,
  displayName: sub,
  status: sub === "retired" ? "inactive" : "active",
}));
const placements = new Map([
  ["me", ["east"]],
  ["alice", ["east", "east-sales"]],
  ["bob", ["west"]],
  ["retired", ["east"]],
]);

test("my team follows organization subtrees and deduplicates multi-unit members", () => {
  const team = attainmentTeamMembers({
    sub: "me",
    access: { kind: "workspace" },
    units,
    placements,
    members,
  });
  assert.equal(team.placed, true);
  assert.deepEqual(
    team.members.map((m) => m.sub),
    ["me", "alice"],
  );
  assert.equal(team.members[1].unit, "east / east-sales");
});
test("team membership never widens owner-only or regional reporting rights", () => {
  const team = attainmentTeamMembers({
    sub: "me",
    access: { kind: "own", sub: "me", accountIds: [] },
    units,
    placements,
    members,
  });
  assert.deepEqual(
    team.members.map((m) => m.sub),
    ["me"],
  );
  const regional = attainmentTeamMembers({
    sub: "me",
    access: {
      kind: "territory",
      territoryIds: ["east"],
      accountIds: [],
      ownerSubs: [],
      unplacedAccountIds: [],
    },
    units,
    placements,
    members,
  });
  assert.deepEqual(
    regional.members.map((m) => m.sub),
    ["me"],
  );
});
test("no placement shows self, never an invented whole-workspace team", () => {
  const team = attainmentTeamMembers({
    sub: "me",
    access: { kind: "workspace" },
    units,
    placements: new Map(),
    members,
  });
  assert.equal(team.placed, false);
  assert.deepEqual(
    team.members.map((m) => m.sub),
    ["me"],
  );
});
