import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryCatalogStore } from "./store";
import {
  listPrices,
  listProducts,
  listProductTypes,
  listSolutions,
  moveProduct,
  moveProductType,
  removeProduct,
  setPrice,
  setProductStatus,
  upsertProduct,
  upsertProductType,
  upsertSolution,
  type CatalogContext,
} from "./service";

const WS = "ws_1";

function seeded(): InMemoryCatalogStore {
  const store = new InMemoryCatalogStore();
  store.seed({
    products: [
      { id: "p1", workspaceId: WS, productCode: "P-1", name: "POS", category: "software", unit: "seat", status: "active", sortOrder: 1 },
      { id: "p2", workspaceId: WS, productCode: "P-2", name: "Rollout", category: "service", unit: "day", status: "active", sortOrder: 2 },
      { id: "px", workspaceId: "ws_other", productCode: "P-X", name: "Other", category: null, unit: "seat", status: "active", sortOrder: 1 },
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

// --- the module page's row operations (owner ruling 2026-09-05) --------------

function lifecycleStore(): InMemoryCatalogStore {
  const store = new InMemoryCatalogStore();
  store.seed({
    products: [
      { id: "p1", workspaceId: WS, productCode: "P-1", name: "旗舰", category: "平台", unit: "套", status: "active", sortOrder: 1 },
      { id: "p2", workspaceId: WS, productCode: "P-2", name: "退役品", category: "平台", unit: "套", status: "retired", sortOrder: 2 },
      { id: "p3", workspaceId: WS, productCode: "P-3", name: "在研品", category: "服务", unit: "套", status: "in_development", sortOrder: 3 },
    ],
    types: [
      { id: "t1", workspaceId: WS, typeCode: "平台", name: "平台", sortOrder: 1, status: "active" },
      { id: "t2", workspaceId: WS, typeCode: "服务", name: "服务", sortOrder: 2, status: "active" },
    ],
    items: [{ id: "i1", workspaceId: WS, solutionId: "s1", productId: "p1", quantity: 1 }],
  });
  return store;
}

test("a status change follows the lifecycle and lands in the store", async () => {
  const store = lifecycleStore();
  const c = ctx("sales_ops", "free", store);
  const launched = await setProductStatus(c, { productId: "p3", status: "active" });
  assert.equal(launched.ok && launched.value.status, "active");

  // The birth state cannot be re-entered - the rule, exercised end to end.
  const back = await setProductStatus(c, { productId: "p1", status: "in_development" });
  assert.equal(!back.ok && back.violations[0]!.code, "development_is_birth_state");
});

test("a move stays inside the roster the user is looking at", async () => {
  const store = lifecycleStore();
  const c = ctx("sales_ops", "free", store);
  // p3 (live roster) moving up must hop the retired p2 and land above p1.
  const r = await moveProduct(c, { productId: "p3", direction: "up" });
  assert.equal(r.ok, true);
  const after = unwrap(await listProducts(c)).map((p) => p.id);
  assert.deepEqual(after, ["p3", "p2", "p1"]);
});

test("deletion is refused while anything references the product", async () => {
  const store = lifecycleStore();
  const c = ctx("sales_ops", "free", store);
  const refused = await removeProduct(c, { productId: "p1" });
  assert.equal(!refused.ok && refused.violations[0]!.code, "product_in_use");

  const removed = await removeProduct(c, { productId: "p3" });
  assert.equal(removed.ok, true);
  assert.equal(unwrap(await listProducts(c)).some((p) => p.id === "p3"), false);
});

test("the type vocabulary upserts by code and reorders", async () => {
  const store = lifecycleStore();
  const c = ctx("sales_ops", "free", store);
  const renamed = await upsertProductType(c, { typeCode: "服务", name: "专业服务" });
  assert.equal(renamed.ok && renamed.value.name, "专业服务");
  assert.equal(renamed.ok && renamed.value.id, "t2"); // same row, not a duplicate

  const moved = await moveProductType(c, { typeId: "t2", direction: "up" });
  assert.equal(moved.ok, true);
  assert.deepEqual(
    unwrap(await listProductTypes(c)).map((t) => t.typeCode),
    ["服务", "平台"],
  );
});

test("every row operation refuses without catalog.write", async () => {
  const store = lifecycleStore();
  const c = ctx("sales_rep", "enterprise", store); // reps read, never maintain
  for (const r of [
    await setProductStatus(c, { productId: "p1", status: "retired" }),
    await moveProduct(c, { productId: "p1", direction: "down" }),
    await removeProduct(c, { productId: "p3" }),
    await upsertProductType(c, { typeCode: "新", name: "新" }),
    await moveProductType(c, { typeId: "t1", direction: "down" }),
  ]) {
    assert.equal(!r.ok && r.violations[0]!.code, "permission_denied");
  }
});
