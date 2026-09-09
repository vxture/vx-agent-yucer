import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { PROVINCE_FRAMES } from "./market-division";
import { ALL_PROVINCES, PROVINCE_CODE, shortProvince } from "./provinces";

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
        `SELECT d.name_zh, d.short_zh, d.name_en, d.code, d.abbr_en
           FROM yucer_ref.admin_division d
           JOIN yucer_ref.admin_division p ON p.id = d.parent_id
          WHERE d.level = 3 AND p.code = 'CN'`,
      )
    ).rows;
    assert.deepEqual(
      rows.map((r) => r.name_zh).sort(),
      [...ALL_PROVINCES].sort(),
      "the table and domains/shared/provinces.ts must name the same 34",
    );
    // The tag configuration prints is `GD 广东`, and both halves of it come
    // from the build today. If the table disagreed with either, the day the
    // interface starts reading the table the labels would quietly change.
    for (const r of rows) {
      assert.equal(r.abbr_en, PROVINCE_CODE[r.name_zh], `${r.name_zh} letter code`);
      assert.equal(r.short_zh, shortProvince(r.name_zh), `${r.name_zh} short name`);
      assert.ok(r.name_en, `${r.name_zh} needs an English name`);
      assert.match(r.code, /^\d{6}$/, `${r.name_zh} should carry a six-digit adcode`);
    }
  });
});

test("every row carries the three names the interface needs", { skip }, async () => {
  await withPg(async (c) => {
    // 中文全称 and 中文简称 are NOT NULL by column definition; what a test has
    // to prove is that the short one is a short one where a rule could safely
    // produce it, and honestly equal to the full name where none could.
    const cn = (
      await c.query(
        `SELECT code, name_zh, short_zh, name_en, abbr_en FROM yucer_ref.admin_division
          WHERE code IN ('CN', '440000', '150000', '440300', '422800')`,
      )
    ).rows;
    const by = new Map(cn.map((r) => [r.code, r]));
    assert.deepEqual(
      [by.get("CN")!.name_zh, by.get("CN")!.short_zh, by.get("CN")!.abbr_en],
      ["中华人民共和国", "中国", "CN"],
    );
    assert.deepEqual(
      [by.get("440000")!.short_zh, by.get("440000")!.abbr_en, by.get("440000")!.name_en],
      ["广东", "GD", "Guangdong"],
    );
    assert.equal(by.get("150000")!.short_zh, "内蒙古");
    assert.equal(by.get("440300")!.short_zh, "深圳", "a city drops its 市");
    // The refusal, which matters more than the rule: cutting the ethnic
    // qualifier off would be writing a name rather than shortening one.
    assert.equal(by.get("422800")!.short_zh, "恩施土家族苗族自治州");
  });
});

test("the path is the ancestry, and it is queryable as a prefix", { skip }, async () => {
  await withPg(async (c) => {
    const gd = (
      await c.query(`SELECT path FROM yucer_ref.admin_division WHERE level = 3 AND code = '440000'`)
    ).rows[0].path;
    assert.equal(gd, "AS/CN/440000");
    // The query the materialised path exists for: everything under Guangdong,
    // at any depth, without a recursive CTE.
    const under = Number(
      (
        await c.query(
          `SELECT count(*)::int AS n FROM yucer_ref.admin_division WHERE path LIKE $1`,
          [`${gd}/%`],
        )
      ).rows[0].n,
    );
    assert.ok(under > 100, `expected Guangdong's cities and counties, got ${under}`);
    // And a path that does not match its parent's would make that query lie.
    const broken = await count(
      c,
      `parent_id IS NOT NULL AND path <> (
         SELECT p.path FROM yucer_ref.admin_division p WHERE p.id = admin_division.parent_id
       ) || '/' || code`,
    );
    assert.equal(broken, 0, "a path that does not extend its parent's");
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

test("陕西's cities in the build are the table's, exactly (incr/0045)", { skip }, async () => {
  /* THE SEAM FOR THE FIRST PROVINCE FRAME. The in-memory store carves 陕西
     from PROVINCE_FRAMES; the Prisma store reads the same cities from this
     table. If the two disagreed, the demo would offer a city the database
     would then refuse to place (fk_market_division_member_place). */
  await withPg(async (c) => {
    for (const f of PROVINCE_FRAMES) {
      const province = (
        await c.query(
          `SELECT id, name_zh, abbr_en FROM yucer_ref.admin_division WHERE level = 3 AND code = $1`,
          [f.adcode],
        )
      ).rows[0];
      assert.ok(province, `${f.province} must be a level-3 row`);
      assert.equal(province.name_zh, f.province);
      assert.equal(province.abbr_en, f.code);
      const cities = (
        await c.query(
          `SELECT code, name_zh, short_zh FROM yucer_ref.admin_division
            WHERE level = 4 AND parent_id = $1 AND status = 'active' ORDER BY sort_order`,
          [province.id],
        )
      ).rows;
      assert.deepEqual(
        cities.map((r) => [r.code, r.name_zh, r.short_zh]),
        f.cities.map((x) => [x.code, x.name, x.short]),
        `${f.province}: the build's city list must be the table's`,
      );
    }
  });
});
