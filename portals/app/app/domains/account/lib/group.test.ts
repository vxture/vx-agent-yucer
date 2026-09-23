import { test } from "node:test";
import assert from "node:assert/strict";
import { descendantsOf, rollupGroup, type GroupUnitFacts } from "./group";

test("the group is every unit below, at any depth, and not the root", () => {
  const rows = [
    { id: "hq", parentId: null },
    { id: "east", parentId: "hq" },
    { id: "west", parentId: "hq" },
    { id: "shanghai", parentId: "east" },
    { id: "other", parentId: null },
  ];
  assert.deepEqual(descendantsOf("hq", rows), ["east", "west", "shanghai"]);
  assert.deepEqual(descendantsOf("east", rows), ["shanghai"]);
  assert.deepEqual(descendantsOf("other", rows), []);
});

test("a corrupt cycle ends the walk instead of spinning it", () => {
  const rows = [
    { id: "a", parentId: "b" },
    { id: "b", parentId: "a" },
  ];
  assert.deepEqual(descendantsOf("a", rows), ["b"]);
});

const unit = (over: Partial<GroupUnitFacts> & { id: string }): GroupUnitFacts => ({
  name: over.id,
  healthScore: 60,
  status: "active",
  openDeals: [],
  ...over,
});

test("deal money sums per currency and never across", () => {
  const r = rollupGroup([
    unit({ id: "hq", openDeals: [{ amount: 100, currency: "CNY" }, { amount: null, currency: "CNY" }] }),
    unit({ id: "east", openDeals: [{ amount: 50, currency: "CNY" }, { amount: 7, currency: "USD" }] }),
  ]);
  assert.equal(r.openDealCount, 4, "an unpriced deal is still a deal");
  assert.deepEqual([...r.amountByCurrency], [["CNY", 150], ["USD", 7]]);
});

test("a unit is at risk for low health or a lost / dormant status, with every reason", () => {
  const r = rollupGroup([
    unit({ id: "ok" }),
    unit({ id: "sick", healthScore: 32 }),
    unit({ id: "gone", healthScore: 20, status: "churned" }),
    unit({ id: "asleep", status: "dormant" }),
    unit({ id: "unknown", healthScore: null }),
  ]);
  assert.deepEqual(
    r.atRisk.map((x) => [x.id, x.reasons]),
    [["sick", ["low_health"]], ["gone", ["low_health", "churned"]], ["asleep", ["dormant"]]],
  );
  assert.equal(r.unitCount, 5);
});
