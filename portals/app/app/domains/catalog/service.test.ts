import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryCatalogStore } from "./store";
import {
  listPrices,
  listProducts,
  listProductStatuses,
  listProductTypes,
  listSolutions,
  moveProduct,
  moveProductStatus,
  moveProductType,
  moveSolution,
  removePrice,
  removeProduct,
  removeSolution,
  setSolutionStatus,
  removeProductStatus,
  removeProductType,
  saveProductStatus,
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
      { id: "p1", workspaceId: WS, productCode: "P-1", name: "POS", typeId: "t_sw", unit: "seat", statusId: "st_active", sortOrder: 1 },
      { id: "p2", workspaceId: WS, productCode: "P-2", name: "Rollout", typeId: "t_svc", unit: "day", statusId: "st_active", sortOrder: 2 },
      { id: "px", workspaceId: "ws_other", productCode: "P-X", name: "Other", typeId: null, unit: "seat", statusId: "stx", sortOrder: 1 },
    ],
    types: [
      { id: "t_sw", workspaceId: WS, typeCode: "software", name: "software", sortOrder: 1, status: "active" },
      { id: "t_svc", workspaceId: WS, typeCode: "service", name: "service", sortOrder: 2, status: "active" },
    ],
    statuses: [
      { id: "st_dev", workspaceId: WS, statusCode: "in_development", name: "在研", description: null, sortOrder: 1 },
      { id: "st_active", workspaceId: WS, statusCode: "active", name: "在售", description: null, sortOrder: 2 },
      { id: "st_retired", workspaceId: WS, statusCode: "retired", name: "已退役", description: null, sortOrder: 3 },
    ],
    solutions: [{ id: "s1", workspaceId: WS, solutionCode: "S-1", name: "Retail bundle", summary: null, scenario: null, status: "active", sortOrder: 1 }],
    items: [
      { id: "i1", workspaceId: WS, solutionId: "s1", productId: "p1", quantity: 10, optional: false, note: null },
      { id: "i2", workspaceId: WS, solutionId: "s1", productId: "p2", quantity: 5, optional: false, note: null },
    ],
    prices: [
      { id: "e1", workspaceId: WS, productId: "p1", currency: "CNY", listPrice: 1000, floorPrice: 800, effectiveAt: new Date("2026-01-01"), supersedesId: null },
      { id: "e2", workspaceId: WS, productId: "p1", currency: "CNY", listPrice: 1200, floorPrice: 900, effectiveAt: new Date("2026-06-01"), supersedesId: "e1" },
      { id: "ex", workspaceId: "ws_other", productId: "px", currency: "CNY", listPrice: 5, floorPrice: 5, effectiveAt: new Date("2026-06-01"), supersedesId: null },
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
      { id: "p1", workspaceId: WS, productCode: "P-1", name: "旗舰", typeId: "t1", unit: "套", statusId: "st_active", sortOrder: 1 },
      { id: "p2", workspaceId: WS, productCode: "P-2", name: "退役品", typeId: "t1", unit: "套", statusId: "st_retired", sortOrder: 2 },
      { id: "p3", workspaceId: WS, productCode: "P-3", name: "在研品", typeId: "t2", unit: "套", statusId: "st_dev", sortOrder: 3 },
    ],
    statuses: [
      { id: "st_dev", workspaceId: WS, statusCode: "in_development", name: "在研", description: null, sortOrder: 1 },
      { id: "st_active", workspaceId: WS, statusCode: "active", name: "在售", description: null, sortOrder: 2 },
      { id: "st_retired", workspaceId: WS, statusCode: "retired", name: "已退役", description: null, sortOrder: 3 },
    ],
    types: [
      { id: "t1", workspaceId: WS, typeCode: "平台", name: "平台", sortOrder: 1, status: "active" },
      { id: "t2", workspaceId: WS, typeCode: "服务", name: "服务", sortOrder: 2, status: "active" },
    ],
    items: [{ id: "i1", workspaceId: WS, solutionId: "s1", productId: "p1", quantity: 1, optional: false, note: null }],
  });
  return store;
}

test("a status change follows the birth rule and lands in the store", async () => {
  const store = lifecycleStore();
  const c = ctx("sales_ops", "free", store);
  const launched = await setProductStatus(c, { productId: "p3", statusId: "st_active" });
  assert.equal(launched.ok && launched.value.statusId, "st_active");

  // The birth state cannot be re-entered - the rule, exercised end to end.
  const back = await setProductStatus(c, { productId: "p1", statusId: "st_dev" });
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

test("the type vocabulary upserts by code, reorders, and deletes only when empty", async () => {
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

  const refused = await removeProductType(c, { typeId: "t1" });
  assert.equal(!refused.ok && refused.violations[0]!.code, "type_in_use");
  const empty = await upsertProductType(c, { typeCode: "空型", name: "空型" });
  const id = empty.ok ? empty.value.id : "";
  assert.equal((await removeProductType(c, { typeId: id })).ok, true);
});

// --- the status vocabulary (owner's final model: rows ARE the content) -------

test("a fresh workspace gets the full shipped lifecycle, in order", async () => {
  const store = new InMemoryCatalogStore(); // seeds NOTHING
  const c = ctx("sales_ops", "free", store);
  const vocab = unwrap(await listProductStatuses(c));
  assert.deepEqual(
    vocab.map((r) => r.statusCode),
    ["in_development", "pilot", "presale", "active", "discontinued", "clearance", "retired"],
  );
  // Self-contained rows: every row can say its own name - no dictionary
  // fallback, no coupling to the interface.
  for (const r of vocab) {
    assert.ok(r.name.length > 0);
    assert.ok((r.description ?? "").length > 0);
  }
});

test("starter statuses never resurrect once the tenant has a vocabulary", async () => {
  const store = lifecycleStore(); // holds the three system rows only
  const c = ctx("sales_ops", "free", store);
  const vocab = unwrap(await listProductStatuses(c));
  assert.deepEqual(
    vocab.map((r) => r.statusCode).sort(),
    ["active", "in_development", "retired"],
    "an existing vocabulary is the tenant's own - no starter re-seeding",
  );
});

test("an added status takes create/rename/reorder/delete, and products move into it", async () => {
  const store = lifecycleStore();
  const c = ctx("sales_ops", "free", store);
  const added = await saveProductStatus(c, {
    statusCode: "presale",
    name: "预售",
    description: "已定型待上市",
  });
  assert.equal(added.ok && added.value.name, "预售");
  const presaleId = added.ok ? added.value.id : "";

  const moved = await setProductStatus(c, { productId: "p1", statusId: presaleId });
  assert.equal(moved.ok && moved.value.statusId, presaleId);

  // Carried -> delete refused; move away -> delete succeeds.
  const refused = await removeProductStatus(c, { statusId: presaleId });
  assert.equal(!refused.ok && refused.violations[0]!.code, "status_in_use");
  await setProductStatus(c, { productId: "p1", statusId: "st_active" });
  assert.equal((await removeProductStatus(c, { statusId: presaleId })).ok, true);
});

test("canonical statuses rename and reorder, never delete", async () => {
  const store = lifecycleStore();
  const c = ctx("sales_ops", "free", store);
  const renamed = await saveProductStatus(c, { statusCode: "active", name: "在售中", description: "改过的描述" });
  assert.equal(renamed.ok && renamed.value.name, "在售中");
  assert.equal(renamed.ok && renamed.value.id, "st_active"); // same row

  const moved = await moveProductStatus(c, { statusId: "st_retired", direction: "up" });
  assert.equal(moved.ok, true);
  assert.deepEqual(
    unwrap(await listProductStatuses(c)).map((r) => r.statusCode),
    ["in_development", "retired", "active"],
  );

  const del = await removeProductStatus(c, { statusId: "st_retired" });
  assert.equal(!del.ok && del.violations[0]!.code, "system_status");
});

test("a product cannot be born retired, nor typed with a stranger's type", async () => {
  const store = lifecycleStore();
  const c = ctx("sales_ops", "free", store);
  const shelved = await upsertProduct(c, {
    productCode: "P-DEAD",
    name: "亡品",
    unit: "套",
    statusId: "st_retired",
  });
  assert.equal(!shelved.ok && shelved.violations[0]!.code, "born_shelved");
  const badType = await upsertProduct(c, {
    productCode: "P-T",
    name: "有型",
    typeId: "t_missing",
    unit: "套",
  });
  assert.equal(!badType.ok && badType.violations[0]!.code, "type_not_found");
});

test("every row operation refuses without catalog.write", async () => {
  const store = lifecycleStore();
  const c = ctx("sales_rep", "enterprise", store); // reps read, never maintain
  for (const r of [
    await setProductStatus(c, { productId: "p1", statusId: "st_retired" }),
    await moveProduct(c, { productId: "p1", direction: "down" }),
    await removeProduct(c, { productId: "p3" }),
    await upsertProductType(c, { typeCode: "新", name: "新" }),
    await moveProductType(c, { typeId: "t1", direction: "down" }),
    await removeProductType(c, { typeId: "t1" }),
    await saveProductStatus(c, { statusCode: "x", name: "x" }),
    await removeProductStatus(c, { statusId: "st_dev" }),
    await moveProductStatus(c, { statusId: "st_dev", direction: "down" }),
  ]) {
    assert.equal(!r.ok && r.violations[0]!.code, "permission_denied");
  }
});

// --- pre-provisioned vocabularies (owner ruling: delivered = usable) ---------

test("a fresh tenant gets the starter type vocabulary; a gutted one stays gutted", async () => {
  const fresh = new InMemoryCatalogStore(); // nothing at all
  const c1 = ctx("sales_ops", "free", fresh);
  const seeded = unwrap(await listProductTypes(c1));
  assert.deepEqual(
    seeded.map((t) => t.typeCode),
    ["software", "subscription", "hardware", "goods", "consumables",
     "implementation", "maintenance", "training", "consulting"],
  );

  // A workspace WITH products but zero types chose that emptiness - the
  // starter set must not resurrect on the next read.
  const gutted = new InMemoryCatalogStore();
  gutted.seed({
    products: [
      { id: "p1", workspaceId: WS, productCode: "P-1", name: "X", typeId: null, unit: "套", statusId: "st_active", sortOrder: 1 },
    ],
    statuses: [
      { id: "st_active", workspaceId: WS, statusCode: "active", name: "在售", description: null, sortOrder: 1 },
    ],
  });
  const c2 = ctx("sales_ops", "free", gutted);
  assert.deepEqual(unwrap(await listProductTypes(c2)), []);
});

// --- deleting a price entry (owner ruling 2026-09-05) ------------------------

test("the price in force refuses deletion; the one it replaced allows it", async () => {
  const store = seeded(); // p1 has two entries: 2026-01 (800/800) and 2026-06
  const c = ctx("sales_ops", "free", store);

  const inForce = await removePrice(c, { priceId: "e2" });
  assert.equal(!inForce.ok && inForce.violations[0]!.code, "price_in_force");

  const superseded = await removePrice(c, { priceId: "e1" });
  assert.equal(superseded.ok, true);
  assert.equal(unwrap(await listPrices(c)).some((e) => e.id === "e1"), false);
});

test("a superseded entry a discount signature cites survives deletion", async () => {
  const store = seeded();
  store.seed({
    approvals: [
      {
        id: "appr1",
        workspaceId: WS,
        opportunityId: "opp1",
        productId: "p1",
        unitPrice: 700,
        currency: "CNY",
        // The floor that was in force at signing - e1's.
        floorPrice: 800,
        reason: "strategic",
        approvedBySub: "usr_boss",
        approvedAt: new Date("2026-02-01"),
      },
    ],
  });
  const c = ctx("sales_ops", "free", store);
  const r = await removePrice(c, { priceId: "e1" });
  assert.equal(!r.ok && r.violations[0]!.code, "price_signed");
});

test("deleting a price refuses without the pricing permission", async () => {
  const c = ctx("sales_rep", "enterprise", seeded());
  const r = await removePrice(c, { priceId: "e1" });
  assert.equal(!r.ok && r.violations[0]!.code, "permission_denied");
});

test("a new price records which price it replaced, and the first records none", async () => {
  const store = new InMemoryCatalogStore();
  const c = ctx("sales_ops", "free", store);

  const first = await setPrice(c, {
    productId: "p1",
    currency: "CNY",
    listPrice: 1000,
    floorPrice: 800,
  });
  assert.equal(first.ok && first.value.supersedesId, null, "nothing came before it");

  const second = await setPrice(c, {
    productId: "p1",
    currency: "CNY",
    listPrice: 1200,
    floorPrice: 900,
  });
  assert.equal(
    second.ok && second.value.supersedesId,
    first.ok ? first.value.id : "?",
    "the chain is asserted at write time, not inferred from dates later",
  );

  // Another product's price starts its own chain rather than joining this one.
  const other = await setPrice(c, {
    productId: "p2",
    currency: "CNY",
    listPrice: 500,
    floorPrice: 400,
  });
  assert.equal(other.ok && other.value.supersedesId, null);
});

// --- solutions: a combination AND its customisation (owner, 2026-09-05) -----

function solutionStore(): InMemoryCatalogStore {
  const store = new InMemoryCatalogStore();
  store.seed({
    products: [
      { id: "p1", workspaceId: WS, productCode: "P-1", name: "平台", typeId: null, unit: "套", statusId: "st_active", sortOrder: 1 },
      { id: "p2", workspaceId: WS, productCode: "P-2", name: "实施", typeId: null, unit: "人月", statusId: "st_active", sortOrder: 2 },
    ],
    statuses: [
      { id: "st_active", workspaceId: WS, statusCode: "active", name: "在售", description: null, sortOrder: 1 },
    ],
  });
  return store;
}

test("a solution keeps its combination and its tailoring", async () => {
  const c = ctx("sales_ops", "free", solutionStore());
  const saved = await upsertSolution(c, {
    solutionCode: "SOL-1",
    name: "零售方案",
    scenario: "50 家门店以上的连锁",
    items: [
      { productId: "p1", quantity: 1 },
      { productId: "p2", quantity: 6, optional: true, note: "按门店数量" },
    ],
  });
  assert.equal(saved.ok && saved.value.scenario, "50 家门店以上的连锁");

  const [view] = unwrap(await listSolutions(c));
  assert.equal(view!.items.length, 2);
  const optional = view!.items.find((i) => i.optional);
  assert.equal(optional?.note, "按门店数量", "the tailoring survives the round trip");
  assert.equal(view!.items.some((i) => !i.optional), true, "and the standard core with it");
});

test("an all-optional bundle is refused - that is a menu, not a solution", async () => {
  const c = ctx("sales_ops", "free", solutionStore());
  const r = await upsertSolution(c, {
    solutionCode: "SOL-MENU",
    name: "全可选",
    items: [
      { productId: "p1", quantity: 1, optional: true },
      { productId: "p2", quantity: 1, optional: true },
    ],
  });
  assert.equal(!r.ok && r.violations[0]!.code, "all_optional");
});

test("a solution cannot be built from a product this workspace does not have", async () => {
  const c = ctx("sales_ops", "free", solutionStore());
  const r = await upsertSolution(c, {
    solutionCode: "SOL-X",
    name: "野产品",
    items: [{ productId: "p_missing", quantity: 1 }],
  });
  assert.equal(!r.ok && r.violations[0]!.code, "product_not_found");
});

test("retiring a solution keeps its composition; the status verb does not empty it", async () => {
  const store = solutionStore();
  const c = ctx("sales_ops", "free", store);
  const saved = await upsertSolution(c, {
    solutionCode: "SOL-1",
    name: "零售方案",
    items: [{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 2 }],
  });
  const id = saved.ok ? saved.value.id : "";

  const retired = await setSolutionStatus(c, { solutionId: id, status: "retired" });
  assert.equal(retired.ok && retired.value.status, "retired");
  const [view] = unwrap(await listSolutions(c));
  assert.equal(view!.items.length, 2, "the bundle survives the status change");

  const again = await setSolutionStatus(c, { solutionId: id, status: "retired" });
  assert.equal(!again.ok && again.violations[0]!.code, "status_unchanged");
});

test("a solution moves within its roster and deletes outright", async () => {
  const store = solutionStore();
  const c = ctx("sales_ops", "free", store);
  const a = await upsertSolution(c, { solutionCode: "SOL-A", name: "甲", items: [{ productId: "p1", quantity: 1 }] });
  const b = await upsertSolution(c, { solutionCode: "SOL-B", name: "乙", items: [{ productId: "p2", quantity: 1 }] });

  assert.equal((await moveSolution(c, { solutionId: b.ok ? b.value.id : "", direction: "up" })).ok, true);
  assert.deepEqual(
    unwrap(await listSolutions(c)).map((v) => v.solution.solutionCode),
    ["SOL-B", "SOL-A"],
  );

  // Deleting a template cannot strand a deal - lines reference products.
  assert.equal((await removeSolution(c, { solutionId: a.ok ? a.value.id : "" })).ok, true);
  assert.equal(unwrap(await listSolutions(c)).length, 1);
});

test("every solution operation refuses without catalog.write", async () => {
  const c = ctx("sales_rep", "enterprise", solutionStore());
  for (const r of [
    await upsertSolution(c, { solutionCode: "X", name: "X", items: [{ productId: "p1", quantity: 1 }] }),
    await setSolutionStatus(c, { solutionId: "s1", status: "retired" }),
    await moveSolution(c, { solutionId: "s1", direction: "up" }),
    await removeSolution(c, { solutionId: "s1" }),
  ]) {
    assert.equal(!r.ok && r.violations[0]!.code, "permission_denied");
  }
});
