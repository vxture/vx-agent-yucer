import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

/* incr/0045 - market_division_member, against a real Postgres.
 *
 * The first province-level market (陕西, carved by city) stands on four
 * database properties, and none of them is visible to the unit suite: a
 * primary key that keeps a city in at most one region, a composite foreign
 * key that makes a member an admin_division row and nothing else, a CHECK on
 * the level, and a grant set that lets the service role place and move but
 * never rewrite the key.
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
  for (const [code, name, ord] of [["SN-GUANZHONG", "关中", 1], ["SN-SHAANBEI", "陕北", 2]] as const) {
    const r = await c.query(
      `INSERT INTO yucer_core.market_division (workspace_id, division_code, name, scope, sort_order)
       VALUES ($1,$2,$3,'province',$4) RETURNING id`,
      [WS, code, name, ord],
    );
    ids[code] = r.rows[0].id;
  }
  return { guanzhong: ids["SN-GUANZHONG"]!, shaanbei: ids["SN-SHAANBEI"]! };
}

const place = (c: Client, level: number, code: string, divisionId: string) =>
  c.query(
    `INSERT INTO yucer_core.market_division_member (workspace_id, member_level, member_code, division_id)
     VALUES ($1,$2,$3,$4)`,
    [WS, level, code, divisionId],
  );

test("a city sits in at most one region - the primary key", { skip }, async () => {
  await withPg(async (c) => {
    const { guanzhong, shaanbei } = await seed(c);
    await place(c, 4, "610100", guanzhong);
    await assert.rejects(place(c, 4, "610100", shaanbei), /pk_market_division_member/);
    // Moving is an UPDATE of division_id, which the grant allows.
    await c.query(
      `UPDATE yucer_core.market_division_member SET division_id = $1
        WHERE workspace_id = $2 AND member_level = 4 AND member_code = '610100'`,
      [shaanbei, WS],
    );
    const r = await c.query(
      `SELECT d.division_code FROM yucer_core.market_division_member m
         JOIN yucer_core.market_division d ON d.id = m.division_id
        WHERE m.workspace_id = $1`,
      [WS],
    );
    assert.deepEqual(r.rows.map((x) => x.division_code), ["SN-SHAANBEI"]);
  });
});

test("a member is an admin_division row, at the level the frame carves by", { skip }, async () => {
  await withPg(async (c) => {
    const { guanzhong } = await seed(c);
    // A code nobody has.
    await assert.rejects(place(c, 4, "619999", guanzhong), /fk_market_division_member_place/);
    // 西安 exists at level 4; the same digits at level 5 do not - and level 5
    // (county) is not a level a region holds anyway (owner: 陕西看市级).
    await assert.rejects(place(c, 5, "610100", guanzhong), /chk_market_division_member_level/);
    // A province is level 3 and belongs in market_division_province.
    await assert.rejects(place(c, 3, "610000", guanzhong), /chk_market_division_member_level/);
    await place(c, 4, "610100", guanzhong);
    // And it can be read back with its name, which is the whole point of the
    // foreign key: the roster prints 西安 without a second copy of the name.
    const r = await c.query(
      `SELECT a.short_zh FROM yucer_core.market_division_member m
         JOIN yucer_ref.admin_division a ON a.level = m.member_level AND a.code = m.member_code
        WHERE m.workspace_id = $1`,
      [WS],
    );
    assert.deepEqual(r.rows.map((x) => x.short_zh), ["西安"]);
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
    for (const name of ["workspace_id", "member_level", "member_code"]) {
      assert.equal((await col(name)).rows[0].ok, false, `${name} is the key and must not be writable`);
    }
  });
});
