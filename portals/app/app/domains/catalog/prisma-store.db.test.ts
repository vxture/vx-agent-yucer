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
    const first = await s.upsertProduct(WS, { productCode: "P-1", name: "Widget", category: "hardware", unit: "set", status: "active" });
    const second = await s.upsertProduct(WS, { productCode: "P-1", name: "Widget v2", category: "hardware", unit: "set", status: "active" });
    assert.equal(second.id, first.id, "same product_code must upsert, not duplicate");
    assert.equal(second.name, "Widget v2");

    const list = await s.listProducts(WS);
    assert.equal(list.length, 1);
  } finally {
    await cleanup();
  }
});

test("an unrecognised product status is refused by the real CHECK", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    await assert.rejects(
      () => s.upsertProduct(WS, { productCode: "P-BAD", name: "Bad", category: null, unit: "set", status: "bogus" as never }),
      /chk_product_status/,
    );
  } finally {
    await cleanup();
  }
});

// --- solutions + items ------------------------------------------------------------

test("upsertSolution replaces its items transactionally, not merges them", { skip }, async () => {
  await cleanup();
  try {
    const s = await store();
    const p1 = await s.upsertProduct(WS, { productCode: "P-A", name: "A", category: null, unit: "set", status: "active" });
    const p2 = await s.upsertProduct(WS, { productCode: "P-B", name: "B", category: null, unit: "set", status: "active" });

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
    const p = await s.upsertProduct(WS, { productCode: "P-Q", name: "Q", category: null, unit: "set", status: "active" });
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
    const p = await s.upsertProduct(WS, { productCode: "P-PR", name: "Priced", category: null, unit: "set", status: "active" });
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
    const p = await s.upsertProduct(WS, { productCode: "P-NONE", name: "None", category: null, unit: "set", status: "active" });
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
    const p = await s.upsertProduct(WS, { productCode: "P-FL", name: "Floor", category: null, unit: "set", status: "active" });
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
    const p = await s.upsertProduct(WS, { productCode: "P-HIST", name: "History", category: null, unit: "set", status: "active" });
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
    const p1 = await s.upsertProduct(WS, { productCode: "P-L1", name: "L1", category: null, unit: "set", status: "active" });
    const p2 = await s.upsertProduct(WS, { productCode: "P-L2", name: "L2", category: null, unit: "set", status: "active" });

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
    const p = await s.upsertProduct(WS, { productCode: "P-NEG", name: "Neg", category: null, unit: "set", status: "active" });
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
    const p = await s.upsertProduct(WS, { productCode: "P-APP", name: "Approved", category: null, unit: "set", status: "active" });
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
    const p = await s.upsertProduct(WS, { productCode: "P-BLANK", name: "Blank", category: null, unit: "set", status: "active" });
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
