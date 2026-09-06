import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// PrismaCatalogStore, against a real Postgres.
//
// THE FIRST ADAPTER THIS DOMAIN HAS HAD to be tested against a database at
// all - incr/0007 created yucer_catalog in 2026-08-24 and every write since
// has only ever run against the in-memory mirror. Worth a real database:
// upsertSolution()'s transactional delete+recreate of solution_item,
// replaceLines()'s same pattern for opportunity_line, and the price-floor
// CHECK that line_discount_approval's "same price re-matches, lower price
// needs a new signature" design leans on.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000007";
const ACC = "eeeeeeee-0000-0000-0000-0000000000e1";
const OPP = "eeeeeeee-0000-0000-0000-0000000000e2";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function seed(c: Client): Promise<void> {
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
     VALUES ($1, $2, 'ACC-CAT', 'Catalog Test', 'active') ON CONFLICT DO NOTHING`,
    [ACC, WS],
  );
  await c.query(
    `INSERT INTO yucer_pipeline.opportunity (id, workspace_id, opportunity_no, name, account_id)
     VALUES ($1, $2, 'OPP-CAT', 'Catalog Deal', $3) ON CONFLICT DO NOTHING`,
    [OPP, WS, ACC],
  );
}

async function cleanup() {
  await withPg(async (c) => {
    await c.query(`DELETE FROM yucer_pipeline.line_discount_approval WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_pipeline.opportunity_line WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_catalog.price_book_entry WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_catalog.solution_item WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_catalog.solution WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_catalog.product WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_catalog.product_type WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_catalog.product_status WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_pipeline.opportunity WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.account WHERE workspace_id = $1`, [WS]);
  });
}

async function store() {
  const { PrismaCatalogStore } = await import("./prisma-store");
  return new PrismaCatalogStore();
}

/** The canonical rows, materialised the way the service would - every
 * product row references one by uuid. */
async function seedStatuses(s: Awaited<ReturnType<typeof store>>) {
  const { SYSTEM_STATUS_DEFAULTS } = await import("./lib/status-vocab");
  const ids: Record<string, string> = {};
  for (const d of SYSTEM_STATUS_DEFAULTS) {
    const row = await s.upsertStatusConfig(WS, {
      statusCode: d.statusCode,
      name: d.name,
      description: d.description,
    });
    ids[d.statusCode] = row.id;
  }
  return ids;
}

// --- products ------------------------------------------------------------------

test("upsertProduct creates on the first call and updates in place on the real unique index", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const first = await s.upsertProduct(WS, { productCode: "P-1", name: "Widget", typeId: null, unit: "set", statusId: ids.active! });
    const second = await s.upsertProduct(WS, { productCode: "P-1", name: "Widget v2", typeId: null, unit: "set", statusId: ids.active! });
    assert.equal(second.id, first.id, "same product_code must upsert, not duplicate");
    assert.equal(second.name, "Widget v2");

    const list = await s.listProducts(WS);
    assert.equal(list.length, 1);
  } finally {
    await cleanup();
  }
});

test("a workspace-added status is a real row products can reference", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const presale = await s.upsertStatusConfig(WS, { statusCode: "presale", name: "预售", description: "已定型待上市" });
    const p = await s.upsertProduct(WS, { productCode: "P-VOC", name: "Voc", typeId: null, unit: "set", statusId: presale.id });
    assert.equal(p.statusId, presale.id);

    // Carried -> the FK RESTRICTs even if a caller skips the rule.
    await assert.rejects(() => s.removeStatusConfig(WS, presale.id), /constraint|Foreign key/i);
    await s.setProductStatus(WS, p.id, ids.active!);
    assert.equal(await s.removeStatusConfig(WS, presale.id), true);
  } finally {
    await cleanup();
  }
});

test("the status vocabulary upserts on its real unique index with the code locked", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const first = await s.upsertStatusConfig(WS, { statusCode: "presale", name: "预售", description: null });
    const renamed = await s.upsertStatusConfig(WS, { statusCode: "presale", name: "预售中", description: "改了" });
    assert.equal(renamed.id, first.id, "same status_code must upsert, not duplicate");
    assert.equal(renamed.name, "预售中");
    assert.equal(renamed.description, "改了");

    // status_code carries no UPDATE grant - the adapter's guard refuses
    // before Prisma even builds the query.
    const { assertWritable } = await import("../shared/column-locks");
    assert.equal(assertWritable("yucer_catalog.product_status", { statusCode: "X" }).ok, false);

    await s.setStatusConfigOrder(WS, [{ id: first.id, sortOrder: 9 }]);
    const rows = await s.listStatusConfigs(WS);
    assert.equal(rows.find((r) => r.id === first.id)?.sortOrder, 9);

    assert.equal(await s.countProductsByStatusId(WS, ids.active!), 0);
    assert.equal(await s.removeStatusConfig(WS, first.id), true);
  } finally {
    await cleanup();
  }
});

test("the type association is a real FK: deleting a carried type RESTRICTs", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const t = await s.upsertProductType(WS, { typeCode: "硬件", name: "硬件", status: "active" });
    await s.upsertProduct(WS, { productCode: "P-HW", name: "HW", typeId: t.id, unit: "set", statusId: ids.active! });
    assert.equal(await s.countProductsByType(WS, t.id), 1);
    await assert.rejects(() => s.removeProductType(WS, t.id), /constraint|Foreign key/i);

    await s.upsertProduct(WS, { productCode: "P-HW", name: "HW", typeId: null, unit: "set", statusId: ids.active! });
    assert.equal(await s.removeProductType(WS, t.id), true);
  } finally {
    await cleanup();
  }
});

// --- solutions + items ------------------------------------------------------------

test("upsertSolution replaces its items transactionally, not merges them", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const p1 = await s.upsertProduct(WS, { productCode: "P-A", name: "A", typeId: null, unit: "set", statusId: ids.active! });
    const p2 = await s.upsertProduct(WS, { productCode: "P-B", name: "B", typeId: null, unit: "set", statusId: ids.active! });

    const sol1 = await s.upsertSolution(WS, { solutionCode: "SOL-1", name: "Bundle", summary: null, scenario: null, status: "active" }, [
      { productId: p1.id, quantity: 2, optional: false, note: null },
    ]);
    let items = await s.listSolutionItems(WS, sol1.id);
    assert.deepEqual(items.map((i) => i.productId), [p1.id]);

    const sol2 = await s.upsertSolution(WS, { solutionCode: "SOL-1", name: "Bundle v2", summary: null, scenario: null, status: "active" }, [
      { productId: p2.id, quantity: 3, optional: false, note: null },
    ]);
    assert.equal(sol2.id, sol1.id);
    items = await s.listSolutionItems(WS, sol1.id);
    assert.deepEqual(items.map((i) => i.productId), [p2.id], "old items must be gone, not appended to");
  } finally {
    await cleanup();
  }
});

test("upsertSolution can leave a solution with zero items - the service refuses that, not the store", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const sol = await s.upsertSolution(WS, { solutionCode: "SOL-EMPTY", name: "Empty", summary: null, scenario: null, status: "active" }, []);
    const items = await s.listSolutionItems(WS, sol.id);
    assert.deepEqual(items, []);
  } finally {
    await cleanup();
  }
});

test("a solution_item quantity of zero is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const p = await s.upsertProduct(WS, { productCode: "P-Q", name: "Q", typeId: null, unit: "set", statusId: ids.active! });
    await assert.rejects(
      () => s.upsertSolution(WS, { solutionCode: "SOL-Q", name: "Q Bundle", summary: null, scenario: null, status: "active" }, [{ productId: p.id, quantity: 0, optional: false, note: null }]),
      /chk_solution_item_qty/,
    );
  } finally {
    await cleanup();
  }
});

// --- price book ------------------------------------------------------------------

test("priceFor returns the latest entry that has already taken effect, not a future one", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const p = await s.upsertProduct(WS, { productCode: "P-PR", name: "Priced", typeId: null, unit: "set", statusId: ids.active! });
    await s.appendPrice(WS, { productId: p.id, currency: "CNY", listPrice: 100, floorPrice: 60, effectiveAt: new Date(Date.now() - 86_400_000) });
    await s.appendPrice(WS, { productId: p.id, currency: "CNY", listPrice: 120, floorPrice: 70, effectiveAt: new Date(Date.now() + 86_400_000) });

    const current = await s.priceFor(WS, p.id, "CNY");
    assert.equal(current?.listPrice, 100, "the future-dated entry must not be treated as in force yet");
  } finally {
    await cleanup();
  }
});

test("priceFor returns null when nothing has taken effect yet", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const p = await s.upsertProduct(WS, { productCode: "P-NONE", name: "None", typeId: null, unit: "set", statusId: ids.active! });
    await s.appendPrice(WS, { productId: p.id, currency: "CNY", listPrice: 50, floorPrice: 20, effectiveAt: new Date(Date.now() + 86_400_000) });
    assert.equal(await s.priceFor(WS, p.id, "CNY"), null);
  } finally {
    await cleanup();
  }
});

test("a floor above list price is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const p = await s.upsertProduct(WS, { productCode: "P-FL", name: "Floor", typeId: null, unit: "set", statusId: ids.active! });
    await assert.rejects(
      () => s.appendPrice(WS, { productId: p.id, currency: "CNY", listPrice: 50, floorPrice: 80, effectiveAt: new Date() }),
      /chk_price_floor/,
    );
  } finally {
    await cleanup();
  }
});

test("appendPrice always creates a new row - price history is a book, not a field", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const p = await s.upsertProduct(WS, { productCode: "P-HIST", name: "History", typeId: null, unit: "set", statusId: ids.active! });
    await s.appendPrice(WS, { productId: p.id, currency: "CNY", listPrice: 100, floorPrice: 50, effectiveAt: new Date(Date.now() - 2_000) });
    await s.appendPrice(WS, { productId: p.id, currency: "CNY", listPrice: 110, floorPrice: 55, effectiveAt: new Date() });
    const list = await s.listPrices(WS);
    assert.equal(list.length, 2);
  } finally {
    await cleanup();
  }
});

// --- opportunity lines -------------------------------------------------------------

test("replaceLines deletes and recreates transactionally, and allLines spans opportunities", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const ids = await seedStatuses(s);
    const p1 = await s.upsertProduct(WS, { productCode: "P-L1", name: "L1", typeId: null, unit: "set", statusId: ids.active! });
    const p2 = await s.upsertProduct(WS, { productCode: "P-L2", name: "L2", typeId: null, unit: "set", statusId: ids.active! });

    await s.replaceLines(WS, OPP, [
      { productId: p1.id, solutionId: null, quantity: 1, unitPrice: 100, amount: 100, currency: "CNY", needsApproval: false },
    ]);
    let lines = await s.listLines(WS, OPP);
    assert.equal(lines.length, 1);

    await s.replaceLines(WS, OPP, [
      { productId: p2.id, solutionId: null, quantity: 2, unitPrice: 50, amount: 100, currency: "CNY", needsApproval: true },
    ]);
    lines = await s.listLines(WS, OPP);
    assert.equal(lines.length, 1, "the old line must be gone, not appended to");
    assert.equal(lines[0].productId, p2.id);
    assert.equal(lines[0].needsApproval, true);

    const all = await s.allLines(WS);
    assert.deepEqual(all.map((l) => l.id), lines.map((l) => l.id));
  } finally {
    await cleanup();
  }
});

test("a negative or zero-quantity line is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const ids = await seedStatuses(s);
    const p = await s.upsertProduct(WS, { productCode: "P-NEG", name: "Neg", typeId: null, unit: "set", statusId: ids.active! });
    await assert.rejects(
      () => s.replaceLines(WS, OPP, [{ productId: p.id, solutionId: null, quantity: -1, unitPrice: 10, amount: 10, currency: "CNY", needsApproval: false }]),
      /chk_line_qty/,
    );
  } finally {
    await cleanup();
  }
});

// --- discount approvals -------------------------------------------------------------

test("appendApproval always creates a new signature row, never revises one", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const ids = await seedStatuses(s);
    const p = await s.upsertProduct(WS, { productCode: "P-APP", name: "Approved", typeId: null, unit: "set", statusId: ids.active! });
    await s.appendApproval(WS, {
      opportunityId: OPP, productId: p.id, unitPrice: 40, currency: "CNY", floorPrice: 60,
      reason: "strategic account", approvedBySub: "usr_ops", approvedAt: new Date(Date.now() - 1000),
    });
    await s.appendApproval(WS, {
      opportunityId: OPP, productId: p.id, unitPrice: 40, currency: "CNY", floorPrice: 60,
      reason: "re-signed", approvedBySub: "usr_ops2", approvedAt: new Date(),
    });
    const list = await s.listApprovals(WS, OPP);
    assert.equal(list.length, 2, "a second signature is a second row, never an overwrite");
    assert.equal(list[0].reason, "re-signed", "listApprovals orders newest first");

    const all = await s.allApprovals(WS);
    assert.equal(all.length, 2);
  } finally {
    await cleanup();
  }
});

test("a blank approval reason is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    await withPg(seed);
    const s = await store();
    const ids = await seedStatuses(s);
    const p = await s.upsertProduct(WS, { productCode: "P-BLANK", name: "Blank", typeId: null, unit: "set", statusId: ids.active! });
    await assert.rejects(
      () => s.appendApproval(WS, {
        opportunityId: OPP, productId: p.id, unitPrice: 40, currency: "CNY", floorPrice: 60,
        reason: "   ", approvedBySub: "usr_ops", approvedAt: new Date(),
      }),
      /chk_approval_reason/,
    );
  } finally {
    await cleanup();
  }
});

// --- lifecycle, order and the type vocabulary (incr/0028) --------------------

test("a new product joins at the tail and moves through the real sort_order", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const a = await s.upsertProduct(WS, { productCode: "P-S1", name: "First", typeId: null, unit: "set", statusId: ids.active! });
    const b = await s.upsertProduct(WS, { productCode: "P-S2", name: "Second", typeId: null, unit: "set", statusId: ids.active! });
    assert.equal(b.sortOrder, a.sortOrder + 1, "a new product joins at the end");

    await s.setProductOrder(WS, [
      { id: a.id, sortOrder: 2 },
      { id: b.id, sortOrder: 1 },
    ]);
    const list = await s.listProducts(WS);
    assert.deepEqual(list.map((p) => p.productCode), ["P-S2", "P-S1"]);
  } finally {
    await cleanup();
  }
});

test("setProductStatus repoints the uuid join and round-trips", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const p = await s.upsertProduct(WS, { productCode: "P-DEV", name: "Building", typeId: null, unit: "set", statusId: ids.in_development! });
    assert.equal(p.statusId, ids.in_development);
    const launched = await s.setProductStatus(WS, p.id, ids.active!);
    assert.equal(launched?.statusId, ids.active);
    assert.equal(await s.setProductStatus(WS, "eeeeeeee-dead-0000-0000-000000000000", ids.active!), null);
  } finally {
    await cleanup();
  }
});

test("removeProduct cascades prices but the line FK restricts underneath", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const p = await s.upsertProduct(WS, { productCode: "P-DEL", name: "Doomed", typeId: null, unit: "set", statusId: ids.active! });
    await s.appendPrice(WS, { productId: p.id, currency: "CNY", listPrice: 10, floorPrice: 8, effectiveAt: new Date() });
    assert.equal(await s.removeProduct(WS, p.id), true);
    assert.equal((await s.listPrices(WS)).length, 0, "fk_price_product cascades");

    // A referenced product: the SERVICE refuses via planRemoval first, but the
    // RESTRICT FK must hold as the last line even if a caller skips the rule.
    await withPg(seed);
    const q = await s.upsertProduct(WS, { productCode: "P-REF", name: "Referenced", typeId: null, unit: "set", statusId: ids.active! });
    await s.replaceLines(WS, OPP, [
      { productId: q.id, solutionId: null, quantity: 1, unitPrice: 5, amount: 5, currency: "CNY", needsApproval: false },
    ]);
    const refs = await s.countProductRefs(WS, q.id);
    assert.deepEqual(refs, { lines: 1, solutionItems: 0 });
    await assert.rejects(() => s.removeProduct(WS, q.id), /constraint|Foreign key/i);
  } finally {
    await cleanup();
  }
});

test("the type vocabulary upserts on its real unique index and its code is locked", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const first = await s.upsertProductType(WS, { typeCode: "平台", name: "平台", status: "active" });
    const renamed = await s.upsertProductType(WS, { typeCode: "平台", name: "平台产品", status: "active" });
    assert.equal(renamed.id, first.id, "same type_code must upsert, not duplicate");
    assert.equal(renamed.name, "平台产品");

    const second = await s.upsertProductType(WS, { typeCode: "服务", name: "服务", status: "active" });
    assert.equal(second.sortOrder, first.sortOrder + 1, "a new type joins at the end");

    await s.setProductTypeOrder(WS, [
      { id: first.id, sortOrder: 2 },
      { id: second.id, sortOrder: 1 },
    ]);
    assert.deepEqual((await s.listProductTypes(WS)).map((t) => t.typeCode), ["服务", "平台"]);

    // type_code carries no UPDATE grant - the adapter's own guard refuses
    // before Prisma even builds the query (renames go through the anchor rule).
    const { assertWritable } = await import("../shared/column-locks");
    assert.equal(assertWritable("yucer_catalog.product_type", { typeCode: "X" }).ok, false);
  } finally {
    await cleanup();
  }
});

test("the price chain is a real self-FK: it survives, nulls, and cannot be edited", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const p = await s.upsertProduct(WS, { productCode: "P-CH", name: "Chain", typeId: null, unit: "set", statusId: ids.active! });

    const first = await s.appendPrice(WS, {
      productId: p.id,
      currency: "CNY",
      listPrice: 1000,
      floorPrice: 800,
      effectiveAt: new Date("2026-01-01"),
    });
    assert.equal(first.supersedesId, null);

    const second = await s.appendPrice(WS, {
      productId: p.id,
      currency: "CNY",
      listPrice: 1200,
      floorPrice: 900,
      effectiveAt: new Date("2026-06-01"),
      supersedesId: first.id,
    });
    assert.equal(second.supersedesId, first.id, "the pointer round-trips through the column");

    // ON DELETE SET NULL: deleting the parent keeps the child and says the
    // predecessor is gone, rather than taking the successor with it.
    assert.equal(await s.removePrice(WS, first.id), true);
    const left = await s.listPrices(WS);
    assert.equal(left.length, 1);
    assert.equal(left[0]!.supersedesId, null);

    // The lineage carries no UPDATE grant - it is a fact about a moment that
    // has passed, frozen like the attribution keys.
    const { assertWritable } = await import("../shared/column-locks");
    assert.equal(
      assertWritable("yucer_catalog.price_book_entry", { supersedesId: null }).ok,
      false,
    );
  } finally {
    await cleanup();
  }
});

test("a solution's customisation round-trips, and the order and delete are real", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const ids = await seedStatuses(s);
    const p1 = await s.upsertProduct(WS, { productCode: "P-S1", name: "平台", typeId: null, unit: "set", statusId: ids.active! });
    const p2 = await s.upsertProduct(WS, { productCode: "P-S2", name: "实施", typeId: null, unit: "day", statusId: ids.active! });

    const sol = await s.upsertSolution(
      WS,
      { solutionCode: "SOL-C", name: "组合方案", summary: null, scenario: "连锁零售", status: "active" },
      [
        { productId: p1.id, quantity: 1, optional: false, note: null },
        { productId: p2.id, quantity: 6, optional: true, note: "按门店数量" },
      ],
    );
    assert.equal(sol.scenario, "连锁零售");

    const items = await s.listSolutionItems(WS, sol.id);
    const add = items.find((i) => i.optional);
    assert.equal(add?.note, "按门店数量", "optional and note survive the real columns");
    assert.equal(items.filter((i) => !i.optional).length, 1);

    // A second solution, then a reorder that the list reflects.
    const other = await s.upsertSolution(
      WS,
      { solutionCode: "SOL-D", name: "另一个", summary: null, scenario: null, status: "active" },
      [{ productId: p1.id, quantity: 1, optional: false, note: null }],
    );
    assert.equal(other.sortOrder, sol.sortOrder + 1, "a new solution joins at the end");
    await s.setSolutionOrder(WS, [
      { id: other.id, sortOrder: 1 },
      { id: sol.id, sortOrder: 2 },
    ]);
    assert.deepEqual(
      (await s.listSolutions(WS)).map((x) => x.solutionCode),
      ["SOL-D", "SOL-C"],
    );

    // Deleting takes the items with it - fk_solution_item_solution cascades.
    assert.equal(await s.removeSolution(WS, sol.id), true);
    assert.equal((await s.listSolutionItems(WS, sol.id)).length, 0);

    // The anchors stay locked; the customisation is writable.
    const { assertWritable } = await import("../shared/column-locks");
    assert.equal(assertWritable("yucer_catalog.solution", { solutionCode: "X" }).ok, false);
    assert.equal(assertWritable("yucer_catalog.solution", { scenario: "x" }).ok, true);
    assert.equal(assertWritable("yucer_catalog.solution_item", { optional: true, note: "x" }).ok, true);
  } finally {
    await cleanup();
  }
});
