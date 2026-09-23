import { test } from "node:test";
import assert from "node:assert/strict";
import { upsellCandidates, whitespace, type PeerHolding } from "./whitespace";

const owns = (...ids: string[]) => new Set(ids);

test("白地 is sellable minus owned", () => {
  assert.deepEqual(whitespace(["a", "b", "c"], owns("b")), { state: "known", productIds: ["a", "c"] });
  assert.deepEqual(whitespace(["a"], owns("a")), { state: "known", productIds: [] });
});

test("an unreadable or empty catalogue is UNKNOWN, never 'everything is 白地' (§9.3)", () => {
  assert.deepEqual(whitespace(null, owns()), { state: "unknown" });
  assert.deepEqual(whitespace([], owns()), { state: "unknown" });
});

const peer = (id: string, industryId: string | null, ...products: string[]): PeerHolding => ({
  accountId: id,
  industryId,
  owned: owns(...products),
});

test("candidates are ranked by the same-industry peer share, above the floor", () => {
  const holdings = [
    peer("me", "retail", "core"),
    peer("p1", "retail", "core", "wms", "bi"),
    peer("p2", "retail", "core", "wms"),
    peer("p3", "retail", "core", "wms", "bi"),
    peer("p4", "retail", "core"),
    peer("other", "pharma", "bi", "wms"), // another industry - not a peer
    peer("prospect", "retail"), // no in-force contract - not a peer
  ];
  const c = upsellCandidates({ accountId: "me", industryId: "retail" }, whitespace(["core", "wms", "bi", "pos"], owns("core")), holdings);
  assert.deepEqual(
    c.map((x) => [x.productId, x.owners, x.peers]),
    [["wms", 3, 4], ["bi", 2, 4]], // pos: 0 of 4, below 40%
  );
});

test("no industry, too few peers, or unknown 白地 -> no candidates", () => {
  const holdings = [peer("p1", "retail", "wms"), peer("p2", "retail", "wms")];
  const space = whitespace(["wms"], owns());
  assert.deepEqual(upsellCandidates({ accountId: "me", industryId: null }, space, holdings), []);
  assert.deepEqual(upsellCandidates({ accountId: "me", industryId: "retail" }, space, holdings), []); // 2 < 3 peers
  assert.deepEqual(upsellCandidates({ accountId: "me", industryId: "retail" }, { state: "unknown" }, holdings), []);
});
