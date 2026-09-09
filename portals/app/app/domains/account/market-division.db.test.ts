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
      `INSERT INTO yucer_core.market_division_province (workspace_id, province, division_id, admin_division_id)
       SELECT $1, $2, d.id, a.id FROM yucer_core.market_division d
         JOIN yucer_ref.admin_division a ON a.level = 3 AND a.name_zh = $2
        WHERE d.workspace_id = $1 AND d.division_code = $3`,
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
        `INSERT INTO yucer_core.market_division_province (workspace_id, province, division_id, admin_division_id)
         SELECT $1, '山东省', d.id, a.id FROM yucer_core.market_division d
           JOIN yucer_ref.admin_division a ON a.level = 3 AND a.name_zh = '山东省'
          WHERE d.workspace_id = $1 AND d.division_code = 'CHINA-WEST'`,
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
        /* With a real place id and the wrong NAME: the name CHECK is what
           refuses - 0045's id relation does not replace it. */
        `INSERT INTO yucer_core.market_division_province (workspace_id, province, division_id, admin_division_id)
         SELECT $1, '江苏', d.id, a.id FROM yucer_core.market_division d
           JOIN yucer_ref.admin_division a ON a.level = 3 AND a.name_zh = '江苏省'
          WHERE d.workspace_id = $1 AND d.division_code = 'CHINA-EAST'`,
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
        `DELETE FROM yucer_core.market_division WHERE workspace_id = $1 AND division_code = 'CHINA-EAST'`,
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
        WHERE workspace_id = $1 AND division_code = 'CHINA-EAST'`, [WS],
    );
    await c.query(
      `UPDATE yucer_core.market_division_province
          SET division_id = (SELECT id FROM yucer_core.market_division
                              WHERE workspace_id = $1 AND division_code = 'CHINA-NORTH')
        WHERE workspace_id = $1 AND province = '山东省'`, [WS],
    );
    const { rows } = await c.query(
      `SELECT d.name, d.sort_order, (SELECT division_code FROM yucer_core.market_division x
          JOIN yucer_core.market_division_province m ON m.division_id = x.id
         WHERE m.workspace_id = $1 AND m.province = '山东省') AS moved
         FROM yucer_core.market_division d
        WHERE d.workspace_id = $1 AND d.division_code = 'CHINA-EAST'`, [WS],
    );
    assert.equal(rows[0].name, "东部大区");
    assert.equal(rows[0].sort_order, 9);
    assert.equal(rows[0].moved, "CHINA-NORTH");
  } finally { await c.end(); }
});

test("a code that does not carry its frame is refused by the database", { skip }, async () => {
  /* incr/0043. The frame's prefix IS the code's prefix, and it is a CHECK
     rather than a form rule so that no import can land `east` beside
     `CHINA-EAST` or CHINA-EAST inside a global frame. */
  const c = await connect();
  try {
    await seed(c);
    for (const [code, scope] of [["east", "china"], ["CHINA-EAST", "global"], ["china-east", "china"]]) {
      await assert.rejects(
        c.query(
          `INSERT INTO yucer_core.market_division (workspace_id, division_code, name, scope)
           VALUES ($1, $2, 'x', $3)`,
          [WS, code, scope],
        ),
        /chk_market_division_code_frame/,
        `${code} in a ${scope} frame`,
      );
    }
    /* 0045: a province code carries NO prefix, and the province is a column
       that must be there - and only there. */
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_core.market_division (workspace_id, division_code, name, scope, scope_province)
         VALUES ($1, 'SN-GUANZHONG', 'x', 'province', 'SN')`,
        [WS],
      ),
      /chk_market_division_code_frame/,
      "a prefixed province code",
    );
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_core.market_division (workspace_id, division_code, name, scope)
         VALUES ($1, '610100', 'x', 'province')`,
        [WS],
      ),
      /chk_market_division_frame_province/,
      "a province row has to name its province",
    );
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_core.market_division (workspace_id, division_code, name, scope, scope_province)
         VALUES ($1, 'CHINA-X', 'x', 'china', 'SN')`,
        [WS],
      ),
      /chk_market_division_frame_province/,
      "a china row names no province",
    );
    // And the same word may live under two frames: the key is per frame.
    await c.query(
      `INSERT INTO yucer_core.market_division (workspace_id, division_code, name, scope, scope_province)
       VALUES ($1, 'GUANZHONG', 'x', 'province', 'SN'), ($1, 'GUANZHONG', 'y', 'province', 'GD')`,
      [WS],
    );
    await c.query(`DELETE FROM yucer_core.market_division WHERE workspace_id = $1 AND scope = 'province'`, [WS]);
    // And the frame row pairs its kind with its code, both ways.
    await assert.rejects(
      c.query(`INSERT INTO yucer_core.market_scope (workspace_id, scope_kind) VALUES ($1, 'province')`, [WS]),
      /chk_market_scope_code/,
      "a province frame has to say which province",
    );
    await assert.rejects(
      c.query(`INSERT INTO yucer_core.market_scope (workspace_id, scope_kind, scope_province) VALUES ($1, 'china', 'GD')`, [WS]),
      /chk_market_scope_code/,
      "a china frame has no province to name",
    );
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
    // `scope` (incr/0043) is deliberately absent: a division's members are
    // level-bound to its frame, so moving it is a delete and a create.
    assert.deepEqual(updatable, ["name", "sort_order", "updated_at"]);
    const frame = await c.query(
      `SELECT column_name FROM information_schema.column_privileges
        WHERE table_schema = 'yucer_core' AND table_name = 'market_scope'
          AND grantee = 'yucer_svc' AND privilege_type = 'UPDATE'
        ORDER BY column_name`,
    );
    assert.deepEqual(
      frame.rows.map((r: { column_name: string }) => r.column_name),
      ["scope_kind", "scope_province", "updated_at"],
    );

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
