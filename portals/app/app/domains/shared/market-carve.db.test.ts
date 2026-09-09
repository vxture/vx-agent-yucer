import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { DIVISION_TEMPLATES } from "./market-division";
import { ALL_PROVINCES } from "./provinces";

/* incr/0045 - 预置方案, against a real Postgres.
 *
 * THE POINT: the carves are DATA (owner: 不容许代码写死), and the service reads
 * them from yucer_ref.market_carve. The TypeScript list still exists for the
 * store that has no table to read, and this file is what stops it becoming a
 * second truth: every carve in the table equals its mirror, in both
 * directions, and the by-unit carves the SQL derives from admin_division are
 * exactly what the build derives from the same rows.
 *
 * SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

test("the table and the mirror hold the same carves, exactly", { skip }, async () => {
  await withPg(async (c) => {
    const carves = (
      await c.query(`SELECT carve_key, scope_kind, scope_province, name FROM yucer_ref.market_carve ORDER BY sort_order`)
    ).rows;
    assert.equal(carves.length, DIVISION_TEMPLATES.length, "2 national + 6 typed + 31 derived");
    for (const row of carves) {
      const t = DIVISION_TEMPLATES.find((x) => x.key === row.carve_key);
      assert.ok(t, `${row.carve_key} is in the table and not in the mirror`);
      assert.deepEqual([t.scope, t.province, t.name], [row.scope_kind, row.scope_province, row.name], row.carve_key);
      const divisions = (
        await c.query(
          `SELECT d.division_code, d.name, d.sort_order FROM yucer_ref.market_carve_division d
             JOIN yucer_ref.market_carve c ON c.id = d.carve_id
            WHERE c.carve_key = $1 ORDER BY d.sort_order`,
          [row.carve_key],
        )
      ).rows;
      assert.deepEqual(
        divisions.map((d) => ({ code: d.division_code, name: d.name, sortOrder: d.sort_order })),
        [...t.divisions],
        `${row.carve_key}: divisions`,
      );
      // The relation is by id (0049); the mirror's KEY - a province name, a
      // unit adcode - is read back through admin_division.
      const members = (
        await c.query(
          `SELECT CASE WHEN a.level = 3 THEN a.name_zh ELSE a.code END AS member_key, d.division_code
             FROM yucer_ref.market_carve_member m
             JOIN yucer_ref.market_carve c ON c.id = m.carve_id
             JOIN yucer_ref.admin_division a ON a.id = m.admin_division_id
             JOIN yucer_ref.market_carve_division d ON d.id = m.division_id
            WHERE c.carve_key = $1`,
          [row.carve_key],
        )
      ).rows;
      assert.deepEqual(
        Object.fromEntries(members.map((m) => [m.member_key, m.division_code])),
        { ...t.members },
        `${row.carve_key}: members`,
      );
    }
  });
});

test("a china carve places all 34 provinces; a province carve's members are its own units", { skip }, async () => {
  await withPg(async (c) => {
    const china = (
      await c.query(
        `SELECT c.carve_key, count(m.admin_division_id)::int AS n
           FROM yucer_ref.market_carve c LEFT JOIN yucer_ref.market_carve_member m ON m.carve_id = c.id
          WHERE c.scope_kind = 'china' GROUP BY c.carve_key`,
      )
    ).rows;
    assert.deepEqual(china.map((r) => r.n), china.map(() => ALL_PROVINCES.length));
    // Every member of a province carve is a level-4 or level-5 row UNDER that
    // province; every member of a china carve is a level-3 row.
    const stray = (
      await c.query(
        `SELECT c.carve_key, a.code FROM yucer_ref.market_carve c
           JOIN yucer_ref.market_carve_member m ON m.carve_id = c.id
           JOIN yucer_ref.admin_division a ON a.id = m.admin_division_id
           LEFT JOIN yucer_ref.admin_division p ON p.level = 3 AND p.abbr_en = c.scope_province
          WHERE (c.scope_kind = 'china' AND a.level <> 3)
             OR (c.scope_kind = 'province' AND NOT (a.level IN (4, 5) AND a.path LIKE p.path || '/%'))`,
      )
    ).rows;
    assert.deepEqual(stray, []);
    // And every unit under a province is in its by-unit carve - nothing
    // dropped (the first cut of the ground rule dropped 西安).
    const missing = (
      await c.query(
        `SELECT p.abbr_en, u.code, u.name_zh FROM yucer_ref.admin_division p
           JOIN yucer_ref.admin_division u ON u.status = 'active' AND (
                 (p.code NOT IN ('110000','120000','310000','500000') AND u.level = 4 AND u.parent_id = p.id AND u.name_zh !~ '直辖县级行政区划$')
              OR (p.code IN ('110000','120000','310000','500000') AND u.level = 5 AND u.path LIKE p.path || '/%'))
          WHERE p.level = 3
            AND NOT EXISTS (SELECT 1 FROM yucer_ref.market_carve_member m
                              JOIN yucer_ref.market_carve c ON c.id = m.carve_id
                             WHERE c.carve_key = lower(p.abbr_en) || '-units' AND m.admin_division_id = u.id)`,
      )
    ).rows;
    assert.deepEqual(missing, []);
  });
});

test("the service role may read the carves and may not write them", { skip }, async () => {
  await withPg(async (c) => {
    for (const t of ["market_carve", "market_carve_division", "market_carve_member"]) {
      const priv = (p: string) =>
        c.query(`SELECT has_table_privilege('yucer_svc', 'yucer_ref.${t}', $1) AS ok`, [p]);
      assert.equal((await priv("SELECT")).rows[0].ok, true, `${t}: read`);
      for (const p of ["INSERT", "UPDATE", "DELETE"]) {
        assert.equal((await priv(p)).rows[0].ok, false, `${t}: ${p} must not be granted`);
      }
    }
  });
});
