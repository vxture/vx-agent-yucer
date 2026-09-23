import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryDeliveryStore, type ContractRecord } from "./store";
import { setAccountStore, setCatalogStore, setCopilotStore, setDeliveryStore } from "../shared/registry";
import { runUpsellSweep, UPSELL_ACTION_TYPE, UPSELL_CAPABILITY } from "./upsell-sweep";

const NOW = new Date("2026-09-22T00:00:00Z");
const WS = [{ workspaceId: "ws_1" }];
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function contract(id: string, accountId: string, productIds: string[]): ContractRecord {
  return {
    id, workspaceId: "ws_1", contractNo: id, name: id, accountId, opportunityId: null, totalAmount: null,
    currency: "CNY", termStart: days(-100), termEnd: days(200), noticeDays: 30, status: "active",
    renewedFromContractId: null, renewedBy: null, signedAt: null, events: [],
    lines: productIds.map((p, i) => ({
      id: `${id}_${i}`, contractId: id, productId: p, quantity: 1, unitPrice: 1, amount: 1, currency: "CNY", termEnd: null,
    })),
  };
}

function setup(opts: { products?: Array<{ id: string; statusId: string }> } = {}) {
  const delivery = new InMemoryDeliveryStore();
  delivery.seed({
    contracts: [
      contract("c_me", "me", ["core"]),
      contract("c_p1", "p1", ["core", "wms"]),
      contract("c_p2", "p2", ["core", "wms"]),
      contract("c_p3", "p3", ["core", "wms"]),
    ],
  });
  setDeliveryStore(delivery);
  const accounts = ["me", "p1", "p2", "p3"].map((id) => ({ id, industryId: "retail" }));
  setAccountStore({ listAccounts: async () => accounts } as never);
  const products = opts.products ?? [
    { id: "core", statusId: "st_active" },
    { id: "wms", statusId: "st_active" },
    { id: "legacy", statusId: "st_retired" },
  ];
  setCatalogStore({
    listProducts: async () => products.map((p) => ({ ...p, name: p.id.toUpperCase() })),
    listStatusConfigs: async () => [
      { id: "st_active", statusCode: "active" },
      { id: "st_retired", statusCode: "retired" },
    ],
  } as never);
  const copilot = new InMemoryCopilotStore();
  setCopilotStore(copilot);
  process.env.MOCK_TIER = "enterprise";
  return { copilot };
}

function teardown() {
  setDeliveryStore(null);
  setAccountStore(null);
  setCatalogStore(null);
  setCopilotStore(null);
}

test("files one upsell per supported 白地 product, counts in the rationale, peer share as confidence", async () => {
  const { copilot } = setup();
  const ledger = await runUpsellSweep({ workspaces: WS, now: NOW });
  const filed = await copilot.listProposals("ws_1", { status: "proposed" });
  // Only `me` lacks wms (3 of 3 peers run it); p1-p3 already run everything active.
  assert.equal(filed.length, 1);
  const [p] = filed;
  assert.equal(p.actionType, UPSELL_ACTION_TYPE);
  assert.equal(p.capability, UPSELL_CAPABILITY);
  assert.equal(p.subjectId, "me");
  assert.equal(p.confidence, 100);
  assert.deepEqual((p.payload as { owners: number; peers: number }).owners, 3);
  assert.match(p.rationale ?? "", /3 of 3 same-industry/);
  assert.equal(ledger.proposed, 1);
  teardown();
});

test("a pending proposal is not filed twice; a retired product is never 白地", async () => {
  const { copilot } = setup();
  await runUpsellSweep({ workspaces: WS, now: NOW });
  const second = await runUpsellSweep({ workspaces: WS, now: NOW });
  assert.equal(second.proposed, 0);
  assert.equal(second.alreadyQueued, 1);
  const filed = await copilot.listProposals("ws_1", {});
  assert.ok(filed.every((p) => (p.payload as { productId: string }).productId !== "legacy"));
  teardown();
});

test("no sellable product -> the workspace is counted as unknown catalogue, nothing filed", async () => {
  const { copilot } = setup({ products: [{ id: "legacy", statusId: "st_retired" }] });
  const ledger = await runUpsellSweep({ workspaces: WS, now: NOW });
  assert.equal(ledger.unknownCatalogue, 1);
  assert.equal((await copilot.listProposals("ws_1", {})).length, 0);
  teardown();
});

test("a recommendation a person REJECTED stays quiet for 90 days, then may return", async () => {
  const rejected = (decidedDaysAgo: number) => ({
    id: "act_old", status: "rejected" as const, actionType: UPSELL_ACTION_TYPE, capability: UPSELL_CAPABILITY,
    subjectType: "account" as const, subjectId: "me", payload: { productId: "wms" }, rationale: null, confidence: 100,
    decidedBySub: "usr_x", decidedAt: days(-decidedDaysAgo), executedAt: null, createdAt: days(-decidedDaysAgo - 1),
  });
  let { copilot } = setup();
  copilot.seedProposals("ws_1", [rejected(30)]);
  assert.equal((await runUpsellSweep({ workspaces: WS, now: NOW })).proposed, 0);
  teardown();

  ({ copilot } = setup());
  copilot.seedProposals("ws_1", [rejected(120)]);
  assert.equal((await runUpsellSweep({ workspaces: WS, now: NOW })).proposed, 1);
  teardown();
});
