import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_MEMBERS, seedDemoMembers } from "./demo-members";
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
