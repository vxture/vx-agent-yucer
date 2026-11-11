import assert from "node:assert/strict";
import { test } from "node:test";
import { availablePrices, productPriceVersions, suggestedProductPrices } from "./product-prices";
import { inForceByProduct } from "../../domains/catalog/lib/pricing";
import type { PriceEntryRecord } from "../../domains/catalog/store";

const price = (id: string, at: string, currency = "CNY"): PriceEntryRecord => ({
  id, workspaceId: "w", productId: "p", currency, effectiveAt: new Date(at),
  listPrice: 100, floorPrice: 70, minPrice: null, supersedesId: null,
});

test("partial price display preserves zero and omits absent values", () => {
  assert.deepEqual(availablePrices(undefined), []);
  assert.deepEqual(availablePrices({ listPrice: 0, floorPrice: null }), [{ key: "listPrice", value: 0 }]);
  assert.deepEqual(availablePrices({ minPrice: 50 }), [{ key: "minPrice", value: 50 }]);
  assert.deepEqual(availablePrices({ listPrice: 100, floorPrice: 70, minPrice: null }), [
    { key: "listPrice", value: 100 }, { key: "floorPrice", value: 70 },
  ]);
});

test("scheduled and foreign-currency entries never become today's current price", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");
  const entries = [price("old", "2026-01-01"), price("current", "2026-06-01"),
    price("future", "2026-12-01"), price("foreign", "2026-10-01", "USD")];
  assert.deepEqual(productPriceVersions(entries, "CNY", now).map((p) => [p.id, p.state]), [
    ["future", "scheduled"], ["current", "current"], ["old", "historical"],
  ]);
  assert.equal(productPriceVersions(entries, undefined, now).find((p) => p.id === "foreign")?.state, "current");
  assert.equal(inForceByProduct(entries, "CNY", now).get("p")?.id, "current");
  assert.equal(inForceByProduct([entries[2]], "CNY", now).size, 0);
});

test("discount suggestions round to whole units while respecting price ordering", () => {
  assert.deepEqual(suggestedProductPrices(1001), { floorPrice: 701, minPrice: 501 });
  assert.deepEqual(suggestedProductPrices(100), { floorPrice: 70, minPrice: 50 });
  assert.deepEqual(suggestedProductPrices(0), { floorPrice: 0, minPrice: 0 });
  assert.equal(suggestedProductPrices(-1), null);
  assert.equal(suggestedProductPrices(Number.NaN), null);
  for (const list of [0.01, 0.8, 1, 1.5, 12.99, 999999.99]) {
    const values = suggestedProductPrices(list)!;
    assert.ok(Number.isInteger(values.floorPrice) && Number.isInteger(values.minPrice));
    assert.ok(values.minPrice >= 0 && values.minPrice <= values.floorPrice && values.floorPrice <= list);
  }
});
