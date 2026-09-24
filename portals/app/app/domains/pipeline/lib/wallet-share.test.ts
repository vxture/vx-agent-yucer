import { test } from "node:test";
import assert from "node:assert/strict";
import { dealShare, walletShare, type WalletContract, type WalletDeal } from "./wallet-share";

const deal = (o: Partial<WalletDeal>): WalletDeal => ({ id: "d1", status: "open", currency: "CNY", amount: 100, budget: 400, ...o });

test("an open deal's share is its amount over the customer's project budget", () => {
  assert.deepEqual(dealShare(deal({}), []), { state: "known", basis: "quoted", ours: 100, budget: 400, share: 0.25, exceeds: false });
});

test("a won deal counts its signed contracts, not the deal amount; drafts and other currencies do not count", () => {
  const contracts: WalletContract[] = [
    { opportunityId: "d1", status: "active", currency: "CNY", totalAmount: 120 },
    { opportunityId: "d1", status: "draft", currency: "CNY", totalAmount: 999 },
    { opportunityId: "d1", status: "active", currency: "USD", totalAmount: 50 },
    { opportunityId: "other", status: "active", currency: "CNY", totalAmount: 70 },
  ];
  const s = dealShare(deal({ status: "won" }), contracts);
  assert.equal(s.state === "known" && s.ours, 120);
  assert.equal(s.state === "known" && s.basis, "committed");
  const fallback = dealShare(deal({ status: "won" }), []);
  assert.equal(fallback.state === "known" && fallback.ours, 100, "no contract yet: the deal amount");
});

test("no budget is no budget - never a zero share; a lost deal is not ours", () => {
  assert.equal(dealShare(deal({ budget: null }), []).state, "no_budget");
  assert.equal(dealShare(deal({ status: "lost" }), []).state, "not_ours");
  assert.equal(dealShare(deal({ amount: null }), []).state, "unpriced");
});

test("ours above the budget is shown as it is and flagged, not clipped", () => {
  const s = dealShare(deal({ amount: 500, budget: 400 }), []);
  assert.equal(s.state === "known" && s.share, 1.25);
  assert.equal(s.state === "known" && s.exceeds, true);
});

test("the rollup keeps won and open apart, per currency, and says how many carried a budget", () => {
  const r = walletShare(
    [
      deal({ id: "a", status: "won", amount: 240, budget: 800 }),
      deal({ id: "b", status: "won", amount: 60, budget: 200 }),
      deal({ id: "c", status: "open", amount: 120, budget: 500 }),
      deal({ id: "d", status: "open", budget: null }),
      deal({ id: "e", status: "lost", budget: 900 }),
      deal({ id: "f", status: "won", currency: "USD", amount: 10, budget: 40 }),
    ],
    [],
  );
  assert.deepEqual(r.committed.map((l) => [l.currency, l.ours, l.budget, l.share, l.counted]), [
    ["CNY", 300, 1000, 0.3, 2],
    ["USD", 10, 40, 0.25, 1],
  ]);
  assert.deepEqual(r.quoted.map((l) => [l.currency, l.ours, l.budget]), [["CNY", 120, 500]]);
  assert.equal(r.eligible, 5, "lost is not eligible");
  assert.equal(r.withBudget, 4);
});
