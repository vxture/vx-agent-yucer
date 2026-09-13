import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_MEMBERS, seedDemoMembers, seedDemoPlacements } from "./demo-members";
import { DEMO_WUXIA_MEMBER_NAMES } from "./demo-fixtures";
import { InMemoryAuthzStore } from "../../authz/store";
import { seedDemoWorkspace, type DemoStores } from "./demo-seed";
import { InMemoryAccountStore } from "../account/store";
import { InMemoryFieldStore } from "../account/field-store";
import { InMemoryCatalogStore } from "../catalog/store";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryDeliveryStore } from "../delivery/store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { InMemoryPlanningStore } from "../planning/store";
import { InMemorySignalStore } from "../signal/store";
import { InMemoryStrategyStore } from "../strategy/store";

const WS = "ws_demo";

function stores(): DemoStores {
  return {
    strategy: new InMemoryStrategyStore(),
    planning: new InMemoryPlanningStore(),
    account: new InMemoryAccountStore(),
    field: new InMemoryFieldStore(),
    signal: new InMemorySignalStore(),
    pipeline: new InMemoryPipelineStore(),
    delivery: new InMemoryDeliveryStore(),
    copilot: new InMemoryCopilotStore(),
    catalog: new InMemoryCatalogStore(),
  };
}

test("every sub the demo's own data names is somebody in the roster", async () => {
  // THE COHERENCE THIS FILE EXISTS FOR. The member row is the only thing that
  // maps `usr_demo_rep` to a human, and every owner column, every reviewer and
  // every decided_by_sub in the demo reads through it. A sub that owns a deal
  // and appears in no roster is a person the product cannot explain - and the
  // roster was EMPTY until 2026-09-01, so every one of them was in that state.
  //
  // Derived from the seeded stores rather than from a list beside the fixture:
  // a list would agree with itself while the data moved underneath it.
  const s = stores();
  seedDemoWorkspace(WS, s);

  const referenced = new Set<string>();
  for (const o of await s.pipeline.listOpportunities(WS, { includeClosed: true })) {
    if (o.ownerSub) referenced.add(o.ownerSub);
  }
  for (const p of await s.delivery.listProjects(WS)) {
    if (p.managerSub) referenced.add(p.managerSub);
  }
  for (const a of await s.copilot.listProposals(WS, {})) {
    if (a.decidedBySub) referenced.add(a.decidedBySub);
  }

  assert.ok(referenced.size > 0, "the demo should name somebody, or this test proves nothing");

  const roster = new Set(DEMO_MEMBERS.map((m) => m.sub));
  const strangers = [...referenced].filter((sub) => !roster.has(sub)).sort();
  assert.deepEqual(strangers, [], "these subs own or signed something and are in no roster");
});

test("the roster shows both standings, or it cannot teach the difference", async () => {
  // A roster where everybody is active cannot show what deactivation looks
  // like, and the state is not decoration - a departed member keeps their row
  // forever so the history they signed stays readable.
  const store = new InMemoryAuthzStore();
  await seedDemoMembers(WS, store);
  const members = await store.listMembers(WS);

  assert.ok(members.some((m) => m.status === "active"));
  assert.ok(members.some((m) => m.status === "inactive"));
});

test("the departed member holds no role, and every active one does", async () => {
  // deactivateMember drops roles rather than remembering them; a fixture that
  // showed an inactive member still holding sales_leader would teach the
  // opposite of what the verb does.
  const store = new InMemoryAuthzStore();
  await seedDemoMembers(WS, store);
  for (const m of await store.listMembers(WS)) {
    if (m.status === "inactive") {
      assert.deepEqual(m.roles, [], `${m.sub} has left and should hold nothing`);
    } else {
      assert.ok(m.roles.length > 0, `${m.sub} is active and would see a locked-out product`);
    }
  }
});

test("the roster is 100+ deep, and every seat is at some unit in the default tree", async () => {
  // 100+用户，并分配到各级部门 (owner, 2026-09-13). The 116-name cast joins
  // the six the business-rule fixtures already needed, so the roster a
  // reviewer pages through is deep enough to actually page, search and
  // filter against.
  assert.ok(DEMO_MEMBERS.length >= 100 + 6, `only ${DEMO_MEMBERS.length} members - the cast should be 100+ on top of the original six`);
  assert.equal(new Set(DEMO_MEMBERS.map((m) => m.sub)).size, DEMO_MEMBERS.length, "two seats share one sub");
  assert.equal(new Set(DEMO_WUXIA_MEMBER_NAMES).size, DEMO_WUXIA_MEMBER_NAMES.length, "two seats share one name");

  const planning = new InMemoryPlanningStore();
  await seedDemoPlacements("ws_wuxia", planning);
  const byCode = new Map((await planning.listOrgUnits("ws_wuxia")).map((u) => [u.id, u.unitCode]));
  const placements = await planning.listOrgMembers("ws_wuxia");

  // Everyone but the departed member (placed nowhere on purpose) lands somewhere.
  const seated = DEMO_MEMBERS.filter((m) => m.active && m.sub !== "usr_demo_former");
  for (const m of seated) {
    assert.ok((placements.get(m.sub) ?? []).length > 0, `${m.sub} has a role but sits in no unit`);
  }

  // 各级部门: headquarters, a 大区 (region) and a team all hold somebody -
  // not just the floor, and not just the top.
  const kinds = new Set<string>();
  for (const unitIds of placements.values()) {
    for (const id of unitIds) {
      const code = byCode.get(id);
      if (!code) continue;
      if (code === "headquarters") kinds.add("headquarters");
      else if (code.endsWith("_team1")) kinds.add("team");
      else kinds.add("region");
    }
  }
  assert.deepEqual([...kinds].sort(), ["headquarters", "region", "team"]);
});

test("seeding twice does not duplicate or re-grant", async () => {
  // ensureDemoData is called on every render; the roster must survive that the
  // same way the domain fixtures do.
  const store = new InMemoryAuthzStore();
  await seedDemoMembers(WS, store);
  await seedDemoMembers(WS, store);
  const members = await store.listMembers(WS);
  assert.equal(members.length, DEMO_MEMBERS.length);
  for (const m of members) {
    assert.equal(new Set(m.roles).size, m.roles.length, `${m.sub} holds a role twice`);
  }
});
