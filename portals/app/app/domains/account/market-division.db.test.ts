import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import {
  MARKET_DIVISIONS,
  MARKET_DIVISION_PROVINCES,
} from "../shared/market-division";
import { ALL_PROVINCES } from "../shared/provinces";

/* 大区 against a real Postgres.
 *
 * Everything asserted here is a property of the DATABASE and of nothing else: a
 * primary key, a CHECK, a foreign key and a column-level GRANT. A fully green
 * TypeScript suite says nothing about any of them, and each one is load-bearing
 * for a screen whose national figure must equal the sum of its divisions.
 *
 * SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts. In CI the
 * db-contract job applies the full DDL first.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "dddddddd-0000-0000-0000-000000000001";

async function connect(): Promise<Client> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  return c;
}

/** The preset, applied to one workspace the way incr/0036 applies it. */
async function seed(c: Client): Promise<void> {
  await c.query(`DELETE FROM yucer_core.market_division_province WHERE workspace_id = $1`, [WS]);
  await c.query(`DELETE FROM yucer_core.market_division WHERE workspace_id = $1`, [WS]);
  for (const d of MARKET_DIVISIONS) {
    await c.query(
      `INSERT INTO yucer_core.market_division (workspace_id, division_code, name, sort_order)
       VALUES ($1,$2,$3,$4)`,
      [WS, d.code, d.name, d.sortOrder],
    );
  }
  for (const [province, code] of Object.entries(MARKET_DIVISION_PROVINCES)) {
    await c.query(
      `INSERT INTO yucer_core.market_division_province (workspace_id, province, division_id)
       SELECT $1, $2, id FROM yucer_core.market_division
        WHERE workspace_id = $1 AND division_code = $3`,
      [WS, province, code],
    );
  }
}

test("every province is placed, in exactly one division", { skip }, async () => {
  // A province in two divisions double-counts every figure rolled up from it,
  // and a national total that does not equal the sum of its parts is the one
  // failure this screen cannot survive. The primary key is what prevents it.
  const c = await connect();
  try {
    await seed(c);
    const { rows } = await c.query(
      `SELECT count(*)::int AS n FROM yucer_core.market_division_province WHERE workspace_id = $1`,
      [WS],
    );
    assert.equal(rows[0].n, ALL_PROVINCES.length);

    await assert.rejects(
      c.query(
        `INSERT INTO yucer_core.market_division_province (workspace_id, province, division_id)
         SELECT $1, '山东省', id FROM yucer_core.market_division
          WHERE workspace_id = $1 AND division_code = 'west'`,
        [WS],
      ),
      /pk_market_division_province|duplicate key/,
      "a second division for one province must be refused by the database",
    );
  } finally { await c.end(); }
});

test("a province outside the vocabulary is refused", { skip }, async () => {
  // The same 34 incr/0035 constrains `account.province` to, so a mapping row
  // cannot name ground no account could ever sit on.
  const c = await connect();
  try {
    await seed(c);
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_core.market_division_province (workspace_id, province, division_id)
         SELECT $1, '江苏', id FROM yucer_core.market_division
          WHERE workspace_id = $1 AND division_code = 'east'`,
        [WS],
      ),
      /chk_market_division_province/,
    );
  } finally { await c.end(); }
});

test("a division still holding provinces cannot be deleted", { skip }, async () => {
  // ON DELETE RESTRICT. Cascading would silently unplace ten provinces, and
  // they would vanish from the map with nothing to say why.
  const c = await connect();
  try {
    await seed(c);
    await assert.rejects(
      c.query(
        `DELETE FROM yucer_core.market_division WHERE workspace_id = $1 AND division_code = 'east'`,
        [WS],
      ),
      /fk_market_division_province_division|violates foreign key/,
    );
  } finally { await c.end(); }
});

test("the tenant may rename and re-order, and move a province", { skip }, async () => {
  // The whole reason this is data rather than a constant.
  const c = await connect();
  try {
    await seed(c);
    await c.query(
      `UPDATE yucer_core.market_division SET name = '东部大区', sort_order = 9
        WHERE workspace_id = $1 AND division_code = 'east'`, [WS],
    );
    await c.query(
      `UPDATE yucer_core.market_division_province
          SET division_id = (SELECT id FROM yucer_core.market_division
                              WHERE workspace_id = $1 AND division_code = 'north')
        WHERE workspace_id = $1 AND province = '山东省'`, [WS],
    );
    const { rows } = await c.query(
      `SELECT d.name, d.sort_order, (SELECT division_code FROM yucer_core.market_division x
          JOIN yucer_core.market_division_province m ON m.division_id = x.id
         WHERE m.workspace_id = $1 AND m.province = '山东省') AS moved
         FROM yucer_core.market_division d
        WHERE d.workspace_id = $1 AND d.division_code = 'east'`, [WS],
    );
    assert.equal(rows[0].name, "东部大区");
    assert.equal(rows[0].sort_order, 9);
    assert.equal(rows[0].moved, "north");
  } finally { await c.end(); }
});

test("the service role may not rewrite the anchor code", { skip }, async () => {
  /* THE COLUMN LOCK, and it is only a property of Postgres. 98 REVOKEs UPDATE
     and re-grants column by column; incr/0036 re-grants name/sort_order and
     deliberately NOT division_code. A division whose code changed is a new
     division wearing an old one's history, and every preset upsert and import
     keys on that code. */
  const c = await connect();
  try {
    const { rows } = await c.query(
      `SELECT column_name FROM information_schema.column_privileges
        WHERE table_schema = 'yucer_core' AND table_name = 'market_division'
          AND grantee = 'yucer_svc' AND privilege_type = 'UPDATE'
        ORDER BY column_name`,
    );
    const updatable = rows.map((r: { column_name: string }) => r.column_name);
    assert.deepEqual(updatable, ["name", "sort_order", "updated_at"]);

    const mapping = await c.query(
      `SELECT column_name FROM information_schema.column_privileges
        WHERE table_schema = 'yucer_core' AND table_name = 'market_division_province'
          AND grantee = 'yucer_svc' AND privilege_type = 'UPDATE'
        ORDER BY column_name`,
    );
    // `province` is half the primary key: changing it in place is a delete and
    // an insert wearing one statement.
    assert.deepEqual(
      mapping.rows.map((r: { column_name: string }) => r.column_name),
      ["division_id", "updated_at"],
    );
  } finally { await c.end(); }
});
