import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const skip = process.env.DATABASE_URL ? false : "no DATABASE_URL";

test("first catalog publication is trigger-owned, once-only and rolled back with its write", { skip }, async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN");
    const ws = randomUUID(), active = randomUUID(), draft = randomUUID(), unit = randomUUID();
    const product = randomUUID(), solution = randomUUID();
    await c.query("INSERT INTO yucer_catalog.product_unit(id,workspace_id,unit_code,name) VALUES($1,$2,'set','Set')", [unit, ws]);
    await c.query("INSERT INTO yucer_catalog.product_status(id,workspace_id,status_code,name) VALUES($1,$3,'active','Active'),($2,$3,'in_development','Draft')", [active, draft, ws]);
    await c.query("SET LOCAL ROLE yucer_svc");
    const row = (await c.query("INSERT INTO yucer_catalog.product(id,workspace_id,product_code,name,unit_id,status_id,first_published_at,publication_history_known) VALUES($1,$2,'PRD-PUB','Product',$3,$4,'2000-01-01',false) RETURNING *", [product, ws, unit, draft])).rows[0];
    assert.equal(row.first_published_at, null);
    assert.equal(row.publication_history_known, true);
    await c.query("SAVEPOINT rolled_back_publication");
    await c.query("UPDATE yucer_catalog.product SET status_id=$1 WHERE id=$2 AND workspace_id=$3", [active, product, ws]);
    await c.query("ROLLBACK TO SAVEPOINT rolled_back_publication");
    assert.equal((await c.query("SELECT first_published_at FROM yucer_catalog.product WHERE id=$1", [product])).rows[0].first_published_at, null);
    const first = (await c.query("UPDATE yucer_catalog.product SET status_id=$1 WHERE id=$2 AND workspace_id=$3 RETURNING first_published_at", [active, product, ws])).rows[0].first_published_at;
    assert.ok(first instanceof Date);
    await c.query("UPDATE yucer_catalog.product SET status_id=$1, name='Revised' WHERE id=$2", [draft, product]);
    await c.query("UPDATE yucer_catalog.product SET status_id=$1 WHERE id=$2", [active, product]);
    assert.deepEqual((await c.query("SELECT first_published_at FROM yucer_catalog.product WHERE id=$1", [product])).rows[0].first_published_at, first);
    const sol = (await c.query("INSERT INTO yucer_catalog.solution(id,workspace_id,solution_code,name,status,first_published_at) VALUES($1,$2,'SOL-PUB','Solution','active','2000-01-01') RETURNING first_published_at", [solution, ws])).rows[0].first_published_at;
    assert.ok(sol instanceof Date && sol.getFullYear() > 2000);
    await c.query("UPDATE yucer_catalog.solution SET status='retired' WHERE id=$1", [solution]);
    await c.query("UPDATE yucer_catalog.solution SET status='active',name='Revised' WHERE id=$1", [solution]);
    assert.deepEqual((await c.query("SELECT first_published_at FROM yucer_catalog.solution WHERE id=$1", [solution])).rows[0].first_published_at, sol);
    for (const table of ["product", "solution"]) {
      for (const column of ["first_published_at", "publication_history_known"]) {
        await c.query("SAVEPOINT denied_metadata");
        await assert.rejects(c.query(`UPDATE yucer_catalog.${table} SET ${column}=${column} WHERE workspace_id=$1`, [ws]), /permission denied/);
        await c.query("ROLLBACK TO SAVEPOINT denied_metadata");
      }
    }
  } finally { await c.query("ROLLBACK"); await c.end(); }
});

test("Prisma catalog reads publication dates without leaking them into write inputs", { skip }, async () => {
  const { PrismaCatalogStore } = await import("./prisma-store");
  const s = new PrismaCatalogStore(), ws = randomUUID();
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const unit = await s.upsertProductUnit(ws, { unitCode: "set", name: "Set" });
    const active = await s.upsertStatusConfig(ws, { statusCode: "active", name: "Active", description: null });
    const p = await s.upsertProduct(ws, { productCode: "PRD-PUB", name: "Product", unitId: unit.id, typeId: null, statusId: active.id }, "create");
    assert.ok(p.firstPublishedAt instanceof Date);
    assert.deepEqual((await s.listProducts(ws))[0].firstPublishedAt, p.firstPublishedAt);
    const solution = await s.upsertSolution(ws, { solutionCode: "SOL-PUB", name: "Solution", summary: null, scenario: null, status: "active" }, [{ productId: p.id, quantity: 1, optional: false, note: null }], "create");
    assert.ok(solution.firstPublishedAt instanceof Date);
    assert.deepEqual((await s.listSolutions(ws))[0].firstPublishedAt, solution.firstPublishedAt);
  } finally {
    for (const table of ["solution_item", "solution", "product", "product_status", "product_unit"]) {
      await c.query(`DELETE FROM yucer_catalog.${table} WHERE workspace_id=$1`, [ws]);
    }
    await c.end();
  }
});
