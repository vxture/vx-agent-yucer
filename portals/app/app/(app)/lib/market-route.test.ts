import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyMarketDestination, resolveMarketId } from "./market-route";

test("old market bookmarks retain the market UUID and repeated filters", () => {
  const href = legacyMarketDestination({ view: "markets", market: "seg_demo_2", filter: ["retail", "mid market"], absent: undefined });
  assert.ok(href);
  const url = new URL(href, "https://example.test");
  assert.equal(url.pathname, "/segment");
  assert.equal(url.searchParams.get("market"), "seg_demo_2");
  assert.deepEqual(url.searchParams.getAll("filter"), ["retail", "mid market"]);
  assert.equal(url.searchParams.has("view"), false);
  assert.equal(url.searchParams.has("absent"), false);
});

test("a bare market bookmark opens the library without a query suffix", () => {
  assert.equal(legacyMarketDestination({ view: "markets" }), "/segment");
});

test("strategy overview and validation stay on their own route", () => {
  for (const view of [undefined, "overview", "validation", ["markets", "validation"]]) {
    assert.equal(legacyMarketDestination({ view }), null);
  }
});


test("legacy detail references resolve to a UUID, preferring identity over display code", () => {
  const markets = [
    {id:"market-a",segmentCode:"MKT-20261119-001"},
    {id:"market-b",segmentCode:"market-a"},
  ];
  assert.equal(resolveMarketId(markets,"MKT-20261119-001"),"market-a");
  assert.equal(resolveMarketId(markets,"market-a"),"market-a");
  assert.equal(resolveMarketId(markets,"market-b"),"market-b");
  assert.equal(resolveMarketId(markets,"missing"),null);
  assert.equal(resolveMarketId([],"market-a"),null);
});
