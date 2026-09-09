import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { ALL_PROVINCES, PROVINCE_CODE } from "./provinces";

// incr/0038 - 行政区划, against a real Postgres.
//
// WHAT THIS FILE IS FOR. The increment ships 3,611 rows generated from two
// pinned datasets, and everything that could go wrong with it is a property of
// the database rather than of TypeScript: a county whose parent city was
// skipped is an orphan the tree can never reach; a duplicate (level, code) is
// two rows for one place; a service role that can WRITE this table can rename a
// province for every tenant at once. None of that is visible to the unit suite.
//
// It also holds the seam between the table and the build: the 34 provinces are
// still a constant, because the CHECK on account.province and the map geometry
// are keyed by those exact names (ADR-026 D1). The table is now a fourth copy
// of them - so this file proves the four agree rather than trusting that they
// do.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

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

const count = async (c: Client, where: string, params: unknown[] = []) =>
  Number(
    (await c.query(`SELECT count(*)::int AS n FROM yucer_ref.admin_division WHERE ${where}`, params))
      .rows[0].n,
  );

test("the five levels are all seeded", { skip }, async () => {
  await withPg(async (c) => {
    const rows = (
      await c.query(
        `SELECT level, count(*)::int AS n FROM yucer_ref.admin_division GROUP BY level ORDER BY level`,
      )
    ).rows;
    assert.deepEqual(rows.map((r) => r.level), [1, 2, 3, 4, 5]);
    // Exact figures, not "more than zero": a seed that half-applied would still
    // have five levels. These are the generator's own counts.
    assert.equal(rows[0].n, 7, "seven continents");
    assert.equal(rows[1].n, 250, "the ISO country list");
    assert.equal(rows[2].n, 34, "34 provincial-level divisions");
    assert.ok(rows[3].n > 300, `expected the prefecture-level cities, got ${rows[3].n}`);
    assert.ok(rows[4].n > 2900, `expected the county-level divisions, got ${rows[4].n}`);
  });
});

test("every row below a continent has a parent one level up", { skip }, async () => {
  await withPg(async (c) => {
    // The CHECK only says a non-continent HAS a parent. It cannot say the parent
    // is the level above - and a county hanging off a province would look
    // perfectly valid while making "cities of Jiangsu" wrong.
    const wrong = await count(
      c,
      `parent_id IS NOT NULL AND level <> 1 + (
         SELECT p.level FROM yucer_ref.admin_division p WHERE p.id = admin_division.parent_id
       )`,
    );
    assert.equal(wrong, 0, "a row whose parent is not exactly one level up");
    assert.equal(await count(c, "level > 1 AND parent_id IS NULL"), 0, "orphans");
  });
});

test("China's provinces are the same 34 the build knows", { skip }, async () => {
  await withPg(async (c) => {
    const rows = (
      await c.query(
        `SELECT d.name, d.code, d.alpha_code
           FROM yucer_ref.admin_division d
           JOIN yucer_ref.admin_division p ON p.id = d.parent_id
          WHERE d.level = 3 AND p.code = 'CN'`,
      )
    ).rows;
    assert.deepEqual(
      rows.map((r) => r.name).sort(),
      [...ALL_PROVINCES].sort(),
      "the table and domains/shared/provinces.ts must name the same 34",
    );
    // And the letter codes the configuration tags print.
    for (const r of rows) {
      assert.equal(r.alpha_code, PROVINCE_CODE[r.name], `${r.name} letter code`);
      assert.match(r.code, /^\d{6}$/, `${r.name} should carry a six-digit adcode`);
    }
  });
});

test("a place is one row - (level, code) is unique", { skip }, async () => {
  await withPg(async (c) => {
    const dupes = (
      await c.query(
        `SELECT level, code FROM yucer_ref.admin_division GROUP BY level, code HAVING count(*) > 1`,
      )
    ).rows;
    assert.deepEqual(dupes, []);
    // The collision the composite key exists for: NA is North America at level
    // 1 and Namibia at level 2, and both are seeded.
    assert.equal(await count(c, "code = 'NA'"), 2);
  });
});

test("the service role may read it and may not write it", { skip }, async () => {
  // THE POINT OF THE GRANT. Administrative divisions change by decree, and a
  // product that can rewrite them at runtime can rewrite them by accident - for
  // every tenant at once, since this table has no workspace_id.
  await withPg(async (c) => {
    const priv = (p: string) =>
      c.query(`SELECT has_table_privilege('yucer_svc', 'yucer_ref.admin_division', $1) AS ok`, [p]);
    assert.equal((await priv("SELECT")).rows[0].ok, true, "the service role must be able to read");
    for (const p of ["INSERT", "UPDATE", "DELETE"]) {
      assert.equal((await priv(p)).rows[0].ok, false, `${p} must not be granted`);
    }
  });
});
