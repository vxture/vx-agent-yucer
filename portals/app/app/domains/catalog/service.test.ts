import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryCatalogStore } from "./store";
import {
  listPrices,
  listProducts,
  listSolutions,
  setPrice,
  upsertProduct,
  upsertSolution,
  type CatalogContext,
} from "./service";

const WS = "ws_1";

function seeded(): InMemoryCatalogStore {
  const store = new InMemoryCatalogStore();
  store.seed({
    products: [
      { id: "p1", workspaceId: WS, productCode: "P-1", name: "POS", category: "software", unit: "seat", status: "active" },
      { id: "p2", workspaceId: WS, productCode: "P-2", name: "Rollout", category: "service", unit: "day", status: "active" },
      { id: "px", workspaceId: "ws_other", productCode: "P-X", name: "Other", category: null, unit: "seat", status: "active" },
    ],
    solutions: [{ id: "s1", workspaceId: WS, solutionCode: "S-1", name: "Retail bundle", summary: null, status: "active" }],
    items: [
      { id: "i1", workspaceId: WS, solutionId: "s1", productId: "p1", quantity: 10 },
      { id: "i2", workspaceId: WS, solutionId: "s1", productId: "p2", quantity: 5 },
    ],
    prices: [
      { id: "e1", workspaceId: WS, productId: "p1", currency: "CNY", listPrice: 1000, floorPrice: 800, effectiveAt: new Date("2026-01-01") },
      { id: "e2", workspaceId: WS, productId: "p1", currency: "CNY", listPrice: 1200, floorPrice: 900, effectiveAt: new Date("2026-06-01") },
      { id: "ex", workspaceId: "ws_other", productId: "px", currency: "CNY", listPrice: 5, floorPrice: 5, effectiveAt: new Date("2026-06-01") },
    ],
  });
  return store;
}

function ctx(role: RoleCode, tier: Entitlement["tier"], store = seeded()): CatalogContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

// THE POINT OF THIS FILE: the catalogue is gated by permission and by NOTHING
// ELSE. Every other domain refuses on tier somewhere; this one must not, and a
// test that only ever ran at "enterprise" would not notice the day someone
// "helpfully" gives the catalogue a feature key.

test("every tier reads it, including none at all above baseline", async () => {
  for (const tier of ["free", "starter", "pro", "business", "enterprise"] as const) {
    const c = ctx("sales_rep", tier);
    assert.equal((await listProducts(c)).ok, true, `products at ${tier}`);
    assert.equal((await listSolutions(c)).ok, true, `solutions at ${tier}`);
    assert.equal((await listPrices(c)).ok, true, `prices at ${tier}`);
  }
});

test("a member without catalog.read is refused, and that is the only way to be refused", async () => {
  // Constructed directly rather than by role: every seeded role holds
  // catalog.read, which is the intended state - so the refusal path has no
  // role that exercises it and would otherwise never be tested at all.
  const c: CatalogContext = {
    ...ctx("viewer", "enterprise"),
    holder: { permissions: new Set() },
  };
  for (const fn of [listProducts, listSolutions, listPrices]) {
    const r = await fn(c);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.violations[0]!.code, "permission_denied");
  }
});

test("reads are scoped to the workspace", async () => {
  const c = ctx("sales_rep", "free");
  const products = unwrap(await listProducts(c));
  assert.deepEqual(products.map((p) => p.id).sort(), ["p1", "p2"]);
  const prices = unwrap(await listPrices(c));
  assert.equal(prices.every((p) => p.workspaceId === WS), true);
});

test("a solution arrives with its items, because without them it is a name", async () => {
  const views = unwrap(await listSolutions(ctx("sales_rep", "free")));
  assert.equal(views.length, 1);
  assert.equal(views[0]!.solution.name, "Retail bundle");
  assert.deepEqual(views[0]!.items.map((i) => i.productId).sort(), ["p1", "p2"]);
});

test("the price book keeps superseded rows, newest first", async () => {
  // A price book is not a price. It shows how today's number was arrived at,
  // which is why the port has listPrices as well as priceFor - and why the
  // superseded 2026-01 row must still be here.
  const prices = unwrap(await listPrices(ctx("sales_ops", "free")));
  assert.deepEqual(prices.map((p) => p.id), ["e2", "e1"]);
  assert.equal(prices[0]!.floorPrice, 900);
});

// --- writes (batch 6b-1b) ----------------------------------------------------

test("catalog.write maintains the catalogue; catalog.price is a different job", async () => {
  // THE SPLIT IS THE POINT. sales_rep holds catalog.read only, so it may look
  // and change nothing. Nobody in the seeded catalog holds write without price
  // or the reverse - so the two are exercised through a hand-built holder,
  // which is also the only way to prove they are actually separate rather than
  // two names for one grant.
  const base = ctx("sales_rep", "free");

  const writer: CatalogContext = { ...base, holder: { permissions: new Set(["catalog.write"] as never) } };
  const pricer: CatalogContext = { ...base, holder: { permissions: new Set(["catalog.price"] as never) } };

  assert.equal((await upsertProduct(writer, { productCode: "P-9", name: "New", unit: "seat" })).ok, true);
  const refusedPrice = await setPrice(writer, { productId: "p1", currency: "CNY", listPrice: 10, floorPrice: 5 });
  assert.equal(refusedPrice.ok, false, "catalog.write must NOT be able to move the floor");

  assert.equal((await setPrice(pricer, { productId: "p1", currency: "CNY", listPrice: 10, floorPrice: 5 })).ok, true);
  const refusedWrite = await upsertProduct(pricer, { productCode: "P-8", name: "Nope", unit: "seat" });
  assert.equal(refusedWrite.ok, false, "catalog.price must NOT be able to edit the catalogue");
});

test("a floor above list is refused - it is the same as having no floor", async () => {
  const c: CatalogContext = {
    ...ctx("sales_rep", "free"),
    holder: { permissions: new Set(["catalog.price"] as never) },
  };
  const r = await setPrice(c, { productId: "p1", currency: "CNY", listPrice: 100, floorPrice: 101 });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0]!.code, "floor_above_list");

  // Equal IS allowed: "this product is not discountable" is a position, not a
  // mistake.
  assert.equal((await setPrice(c, { productId: "p1", currency: "CNY", listPrice: 100, floorPrice: 100 })).ok, true);
});

test("setting a price appends - the superseded entry stays readable", async () => {
  const store = seeded();
  const pricer: CatalogContext = {
    ...ctx("sales_rep", "free", store),
    holder: { permissions: new Set(["catalog.price", "catalog.read"] as never) },
  };
  const before = unwrap(await listPrices(pricer)).length;
  unwrap(await setPrice(pricer, { productId: "p1", currency: "CNY", listPrice: 1500, floorPrice: 1100 }));
  const after = unwrap(await listPrices(pricer));
  assert.equal(after.length, before + 1, "a price book records history, it does not overwrite");
  assert.equal(after[0]!.listPrice, 1500, "newest first");
});

test("upserting a product by code updates rather than duplicating", async () => {
  const store = seeded();
  const c: CatalogContext = {
    ...ctx("sales_rep", "free", store),
    holder: { permissions: new Set(["catalog.write", "catalog.read"] as never) },
  };
  unwrap(await upsertProduct(c, { productCode: "P-1", name: "POS renamed", unit: "seat" }));
  const products = unwrap(await listProducts(c));
  assert.equal(products.filter((p) => p.productCode === "P-1").length, 1);
  assert.equal(products.find((p) => p.productCode === "P-1")!.name, "POS renamed");
});

test("a solution must contain something, and its items are replaced whole", async () => {
  const store = seeded();
  const c: CatalogContext = {
    ...ctx("sales_rep", "free", store),
    holder: { permissions: new Set(["catalog.write", "catalog.read"] as never) },
  };
  const empty = await upsertSolution(c, { solutionCode: "S-2", name: "Hollow", items: [] });
  assert.equal(empty.ok, false);
  assert.equal(empty.ok === false && empty.violations[0]!.code, "items_required");

  // S-1 had two products; sending one must LEAVE one, not merge to two.
  unwrap(
    await upsertSolution(c, {
      solutionCode: "S-1",
      name: "Retail bundle",
      items: [{ productId: "p1", quantity: 3 }],
    }),
  );
  const views = unwrap(await listSolutions(c));
  const s1 = views.find((v) => v.solution.solutionCode === "S-1")!;
  assert.deepEqual(s1.items.map((i) => i.productId), ["p1"]);
  assert.equal(s1.items[0]!.quantity, 3);
});
