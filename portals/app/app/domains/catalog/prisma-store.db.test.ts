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

// --- products ------------------------------------------------------------------

test("upsertProduct creates on the first call and updates in place on the real unique index", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const first = await s.upsertProduct(WS, { productCode: "P-1", name: "Widget", typeId: null, unit: "set", status: "active" });
    const second = await s.upsertProduct(WS, { productCode: "P-1", name: "Widget v2", typeId: null, unit: "set", status: "active" });
    assert.equal(second.id, first.id, "same product_code must upsert, not duplicate");
    assert.equal(second.name, "Widget v2");

    const list = await s.listProducts(WS);
    assert.equal(list.length, 1);
  } finally {
    await cleanup();
  }
});

test("a workspace-minted status code is a legal product value since 0029", { skip }, async () => {
  // The CHECK is gone on purpose: codes belong to the workspace vocabulary
  // and validity is the rule layer's. The database's own guard is now the
  // vocabulary table's unique index and locked columns, tested below.
  await cleanup();
  try {
    const s = await store();
    const p = await s.upsertProduct(WS, { productCode: "P-VOC", name: "Voc", typeId: null, unit: "set", status: "presale" });
    assert.equal(p.status, "presale");
  } finally {
    await cleanup();
  }
});

test("the status vocabulary upserts on its real unique index with behavior locked", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const first = await s.upsertStatusConfig(WS, { statusCode: "presale", name: "预售", behavior: "active", status: "active" });
    const renamed = await s.upsertStatusConfig(WS, { statusCode: "presale", name: "预售中", behavior: "active", status: "active" });
    assert.equal(renamed.id, first.id, "same status_code must upsert, not duplicate");
    assert.equal(renamed.name, "预售中");

    // behavior carries no UPDATE grant - the adapter's guard refuses before
    // Prisma even builds the query.
    const { assertWritable } = await import("../shared/column-locks");
    assert.equal(assertWritable("yucer_catalog.product_status", { behavior: "retired" }).ok, false);

    await s.setStatusConfigOrder(WS, [{ id: first.id, sortOrder: 9 }]);
    const rows = await s.listStatusConfigs(WS);
    assert.equal(rows.find((r) => r.id === first.id)?.sortOrder, 9);

    assert.equal(await s.countProductsByStatus(WS, "presale"), 0);
    assert.equal(await s.removeStatusConfig(WS, first.id), true);
  } finally {
    await cleanup();
  }
});

test("the type association is a real FK: deleting a carried type RESTRICTs", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const t = await s.upsertProductType(WS, { typeCode: "硬件", name: "硬件", status: "active" });
    await s.upsertProduct(WS, { productCode: "P-HW", name: "HW", typeId: t.id, unit: "set", status: "active" });
    assert.equal(await s.countProductsByType(WS, t.id), 1);
    await assert.rejects(() => s.removeProductType(WS, t.id), /constraint|Foreign key/i);

    await s.upsertProduct(WS, { productCode: "P-HW", name: "HW", typeId: null, unit: "set", status: "active" });
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
    const p1 = await s.upsertProduct(WS, { productCode: "P-A", name: "A", typeId: null, unit: "set", status: "active" });
    const p2 = await s.upsertProduct(WS, { productCode: "P-B", name: "B", typeId: null, unit: "set", status: "active" });

    const sol1 = await s.upsertSolution(WS, { solutionCode: "SOL-1", name: "Bundle", summary: null, status: "active" }, [
      { productId: p1.id, quantity: 2 },
    ]);
    let items = await s.listSolutionItems(WS, sol1.id);
    assert.deepEqual(items.map((i) => i.productId), [p1.id]);

    const sol2 = await s.upsertSolution(WS, { solutionCode: "SOL-1", name: "Bundle v2", summary: null, status: "active" }, [
      { productId: p2.id, quantity: 3 },
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
    const sol = await s.upsertSolution(WS, { solutionCode: "SOL-EMPTY", name: "Empty", summary: null, status: "active" }, []);
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
    const p = await s.upsertProduct(WS, { productCode: "P-Q", name: "Q", typeId: null, unit: "set", status: "active" });
    await assert.rejects(
      () => s.upsertSolution(WS, { solutionCode: "SOL-Q", name: "Q Bundle", summary: null, status: "active" }, [{ productId: p.id, quantity: 0 }]),
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
    const p = await s.upsertProduct(WS, { productCode: "P-PR", name: "Priced", typeId: null, unit: "set", status: "active" });
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
    const p = await s.upsertProduct(WS, { productCode: "P-NONE", name: "None", typeId: null, unit: "set", status: "active" });
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
    const p = await s.upsertProduct(WS, { productCode: "P-FL", name: "Floor", typeId: null, unit: "set", status: "active" });
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
    const p = await s.upsertProduct(WS, { productCode: "P-HIST", name: "History", typeId: null, unit: "set", status: "active" });
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
    const p1 = await s.upsertProduct(WS, { productCode: "P-L1", name: "L1", typeId: null, unit: "set", status: "active" });
    const p2 = await s.upsertProduct(WS, { productCode: "P-L2", name: "L2", typeId: null, unit: "set", status: "active" });

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
    const p = await s.upsertProduct(WS, { productCode: "P-NEG", name: "Neg", typeId: null, unit: "set", status: "active" });
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
    const p = await s.upsertProduct(WS, { productCode: "P-APP", name: "Approved", typeId: null, unit: "set", status: "active" });
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
    const p = await s.upsertProduct(WS, { productCode: "P-BLANK", name: "Blank", typeId: null, unit: "set", status: "active" });
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
    const a = await s.upsertProduct(WS, { productCode: "P-S1", name: "First", typeId: null, unit: "set", status: "active" });
    const b = await s.upsertProduct(WS, { productCode: "P-S2", name: "Second", typeId: null, unit: "set", status: "active" });
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

test("in_development is a real status and setProductStatus round-trips it away", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const p = await s.upsertProduct(WS, { productCode: "P-DEV", name: "Building", typeId: null, unit: "set", status: "in_development" });
    assert.equal(p.status, "in_development", "the widened CHECK accepts the birth state");
    const launched = await s.setProductStatus(WS, p.id, "active");
    assert.equal(launched?.status, "active");
    assert.equal(await s.setProductStatus(WS, "eeeeeeee-dead-0000-0000-000000000000", "active"), null);
  } finally {
    await cleanup();
  }
});

test("removeProduct cascades prices but the line FK restricts underneath", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const p = await s.upsertProduct(WS, { productCode: "P-DEL", name: "Doomed", typeId: null, unit: "set", status: "active" });
    await s.appendPrice(WS, { productId: p.id, currency: "CNY", listPrice: 10, floorPrice: 8, effectiveAt: new Date() });
    assert.equal(await s.removeProduct(WS, p.id), true);
    assert.equal((await s.listPrices(WS)).length, 0, "fk_price_product cascades");

    // A referenced product: the SERVICE refuses via planRemoval first, but the
    // RESTRICT FK must hold as the last line even if a caller skips the rule.
    await withPg(seed);
    const q = await s.upsertProduct(WS, { productCode: "P-REF", name: "Referenced", typeId: null, unit: "set", status: "active" });
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
