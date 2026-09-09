import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

/* incr/0045 - market_division_member, against a real Postgres.
 *
 * The first province-level market (陕西, carved by city) stands on four
 * database properties, and none of them is visible to the unit suite: a
 * primary key that keeps a city in at most one region, a foreign key that
 * makes a member an admin_division row BY ID and nothing else (0045), and a
 * grant set that lets the service role place and move but never rewrite the
 * key.
 *
 * SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "dddddddd-0000-0000-0000-000000000045";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** A 陕西 frame with 关中 and 陕北, empty. */
async function seed(c: Client): Promise<{ guanzhong: string; shaanbei: string }> {
  await c.query(`DELETE FROM yucer_core.market_division_member WHERE workspace_id = $1`, [WS]);
  await c.query(`DELETE FROM yucer_core.market_division WHERE workspace_id = $1`, [WS]);
  await c.query(
    `INSERT INTO yucer_core.market_scope (workspace_id, scope_kind, scope_province)
     VALUES ($1, 'province', 'SN')
     ON CONFLICT (workspace_id) DO UPDATE SET scope_kind = 'province', scope_province = 'SN'`,
    [WS],
  );
  const ids: Record<string, string> = {};
  for (const [code, name, ord] of [["GUANZHONG", "关中", 1], ["SHAANBEI", "陕北", 2]] as const) {
    const r = await c.query(
      `INSERT INTO yucer_core.market_division (workspace_id, division_code, name, scope, scope_province, sort_order)
       VALUES ($1,$2,$3,'province','SN',$4) RETURNING id`,
      [WS, code, name, ord],
    );
    ids[code] = r.rows[0].id;
  }
  return { guanzhong: ids["GUANZHONG"]!, shaanbei: ids["SHAANBEI"]! };
}

/** Place the admin_division row with this (level, code) - resolved to its id
 *  here, the way the store does it; the table relates by the id (0045). */
const place = (c: Client, level: number, code: string, divisionId: string) =>
  c.query(
    `INSERT INTO yucer_core.market_division_member (workspace_id, admin_division_id, division_id)
     SELECT $1, a.id, $4 FROM yucer_ref.admin_division a WHERE a.level = $2 AND a.code = $3`,
    [WS, level, code, divisionId],
  );

test("a city sits in at most one region - the primary key", { skip }, async () => {
  await withPg(async (c) => {
    const { guanzhong, shaanbei } = await seed(c);
    await place(c, 4, "610100", guanzhong);
    await assert.rejects(place(c, 4, "610100", shaanbei), /pk_market_division_member/);
    // Moving is an UPDATE of division_id, which the grant allows.
    await c.query(
      `UPDATE yucer_core.market_division_member m SET division_id = $1
        FROM yucer_ref.admin_division a
       WHERE m.workspace_id = $2 AND m.admin_division_id = a.id AND a.level = 4 AND a.code = '610100'`,
      [shaanbei, WS],
    );
    const r = await c.query(
      `SELECT d.division_code FROM yucer_core.market_division_member m
         JOIN yucer_core.market_division d ON d.id = m.division_id
        WHERE m.workspace_id = $1`,
      [WS],
    );
    assert.deepEqual(r.rows.map((x) => x.division_code), ["SHAANBEI"]);
  });
});

test("a member is an admin_division row, by id - a key the table does not have places nothing", { skip }, async () => {
  await withPg(async (c) => {
    const { guanzhong } = await seed(c);
    // A code nobody has resolves to no row: the INSERT ... SELECT writes
    // nothing, and that is the refusal - there is no id to relate by.
    const none = await place(c, 4, "619999", guanzhong);
    assert.equal(none.rowCount, 0);
    // A made-up id is refused by the foreign key itself.
    await assert.rejects(
      c.query(
        `INSERT INTO yucer_core.market_division_member (workspace_id, admin_division_id, division_id)
         VALUES ($1, '00000000-0000-0000-0000-000000000000', $2)`,
        [WS, guanzhong],
      ),
      /fk_market_division_member_place/,
    );
    await place(c, 4, "610100", guanzhong);
    // And it reads back with its name, which is the whole point of relating
    // by id: the roster prints 西安 without a second copy of the name.
    const r = await c.query(
      `SELECT a.short_zh, a.code FROM yucer_core.market_division_member m
         JOIN yucer_ref.admin_division a ON a.id = m.admin_division_id
        WHERE m.workspace_id = $1`,
      [WS],
    );
    assert.deepEqual(r.rows, [{ short_zh: "西安", code: "610100" }]);
    // A district under 北京 is level 5 and may be placed too (0045).
    await place(c, 5, "110101", guanzhong);
    await c.query(`DELETE FROM yucer_core.market_division_member WHERE workspace_id = $1`, [WS]);
  });
});

test("a region still holding cities cannot be deleted", { skip }, async () => {
  await withPg(async (c) => {
    const { guanzhong } = await seed(c);
    await place(c, 4, "610100", guanzhong);
    await assert.rejects(
      c.query(`DELETE FROM yucer_core.market_division WHERE id = $1`, [guanzhong]),
      /fk_market_division_member_division/,
    );
    await c.query(`DELETE FROM yucer_core.market_division_member WHERE division_id = $1`, [guanzhong]);
    await c.query(`DELETE FROM yucer_core.market_division WHERE id = $1`, [guanzhong]);
  });
});

test("the service role may place, move and unplace - and not rewrite the key", { skip }, async () => {
  await withPg(async (c) => {
    const priv = (p: string) =>
      c.query(`SELECT has_table_privilege('yucer_svc', 'yucer_core.market_division_member', $1) AS ok`, [p]);
    for (const p of ["SELECT", "INSERT", "DELETE"]) {
      assert.equal((await priv(p)).rows[0].ok, true, `${p} must be granted`);
    }
    const col = (name: string) =>
      c.query(
        `SELECT has_column_privilege('yucer_svc', 'yucer_core.market_division_member', $1, 'UPDATE') AS ok`,
        [name],
      );
    assert.equal((await col("division_id")).rows[0].ok, true);
    assert.equal((await col("updated_at")).rows[0].ok, true);
    for (const name of ["workspace_id", "admin_division_id"]) {
      assert.equal((await col(name)).rows[0].ok, false, `${name} is the key and must not be writable`);
    }
  });
});
