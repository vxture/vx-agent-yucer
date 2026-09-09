import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { DEFAULT_INDUSTRIES } from "./lib/industry-vocab";

// incr/0040 - 行业分类, against a real Postgres.
//
// WHAT THIS FILE IS FOR. The increment's argument is that an industry must be a
// row rather than characters typed into a column, and everything that makes
// that true is a property of Postgres: a foreign key that refuses to let a
// customer point at an industry that does not exist, a RESTRICT that refuses to
// delete one somebody is filed under, a unique index that makes two rows for
// one industry impossible, and a grant that leaves the anchor code unwritable.
// A fully green TypeScript suite says nothing about any of them.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000040";
const WS2 = "eeeeeeee-0000-0000-0000-000000000041";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN");
    return await fn(c);
  } finally {
    // Everything here rolls back: this table is per-workspace, and a fixture
    // left behind would be a workspace's industry list in the next run.
    await c.query("ROLLBACK");
    await c.end();
  }
}

/**
 * A statement that must be refused, without taking the transaction with it.
 *
 * Postgres aborts the whole transaction on any error, so a bare
 * assert.rejects leaves every later statement failing with "current
 * transaction is aborted" - the test then reports the wrong cause. The
 * savepoint is what lets one expected refusal be followed by anything else.
 */
async function refuses(c: Client, run: () => Promise<unknown>, expected: RegExp, why?: string) {
  await c.query("SAVEPOINT probe");
  await assert.rejects(run, expected, why);
  await c.query("ROLLBACK TO SAVEPOINT probe");
}

const industry = (c: Client, ws: string, code: string, name = code) =>
  c.query<{ id: string }>(
    `INSERT INTO yucer_core.industry (workspace_id, industry_code, name)
     VALUES ($1, $2, $3) RETURNING id`,
    [ws, code, name],
  );

const account = (c: Client, no: string, industryId: string | null) =>
  c.query<{ industry_id: string | null }>(
    `INSERT INTO yucer_core.account (workspace_id, account_no, name, industry_id)
     VALUES ($1, $2, $3, $4) RETURNING industry_id`,
    [WS, no, `industry-test-${no}`, industryId],
  );

test("the column the free text lived in is gone", { skip }, async () => {
  // The point of the increment, and the one thing a mirror cannot prove: while
  // `industry` still existed, every old write path would keep working and the
  // vocabulary would be a second, ignored copy.
  await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'yucer_core' AND table_name = 'account'
          AND column_name IN ('industry', 'industry_id')`,
    );
    assert.deepEqual(rows.map((r) => r.column_name), ["industry_id"]);
  });
});

test("a customer can only be filed under an industry that exists", { skip }, async () => {
  await withPg(async (c) => {
    await refuses(
      c,
      () => account(c, "IND-GHOST", "dddddddd-0000-0000-0000-0000000000ff"),
      /fk_account_industry/,
      "a dangling industry_id must not be storable",
    );
  });
});

test("having no industry yet is allowed - most prospects are a name", { skip }, async () => {
  // NOT NULL was deliberately not set, unlike product.unit_id: an account with
  // no industry is the ordinary state of a fresh prospect, and the completeness
  // rule treats the blank as a gap to fill rather than an error to prevent.
  await withPg(async (c) => {
    const r = await account(c, "IND-NONE", null);
    assert.equal(r.rows[0].industry_id, null);
  });
});

test("an industry somebody is filed under cannot be deleted", { skip }, async () => {
  // The RESTRICT is what makes the product's refusal honest rather than a
  // courtesy: planIndustryRemoval names the count, and this is what happens if
  // anything ever gets past it.
  await withPg(async (c) => {
    const id = (await industry(c, WS, "manufacturing", "制造")).rows[0]!.id;
    await account(c, "IND-FILED", id);
    await refuses(
      c,
      () => c.query(`DELETE FROM yucer_core.industry WHERE id = $1`, [id]),
      /fk_account_industry/,
    );
    // And the way out, which the win/loss reason does not have: re-file the
    // customer and the row becomes deletable.
    await c.query(`UPDATE yucer_core.account SET industry_id = NULL WHERE workspace_id = $1`, [WS]);
    const gone = await c.query(`DELETE FROM yucer_core.industry WHERE id = $1`, [id]);
    assert.equal(gone.rowCount, 1);
  });
});

test("one industry is one row, per workspace", { skip }, async () => {
  await withPg(async (c) => {
    await industry(c, WS, "retail", "零售");
    await refuses(
      c,
      () => industry(c, WS, "retail", "零售业"),
      /uidx_industry_code/,
      "two rows for one industry is the defect this vocabulary replaced",
    );
    // The composite key, not the code alone: another workspace's list is its
    // own, and 零售 there is a different row.
    const other = await industry(c, WS2, "retail", "零售");
    assert.ok(other.rows[0]!.id);
  });
});

test("the shipped list the build knows is the list the increment seeds", { skip }, async () => {
  /* THE SEED IS IN TWO PLACES and has to stay one list: incr/0040 seeds a
     workspace that already has customers, and listIndustries() seeds a fresh
     one on first contact. This reads the codes back out of the increment's own
     VALUES block - so a row added to one and not the other fails here rather
     than becoming two starter sets that quietly differ. */
  const sql = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      new URL("../../../../../deploy/database/ddl/incr/0040_account_industry.sql", import.meta.url),
      "utf8",
    ),
  );
  const seeded = [...sql.matchAll(/^\s*\('([a-z_]+)',\s*'([^']+)',\s*\d+\)/gm)].map((m) => ({
    industryCode: m[1]!,
    name: m[2]!,
  }));
  assert.deepEqual(seeded, [...DEFAULT_INDUSTRIES]);
});

test("the service role may add and drop industries, but not re-key one", { skip }, async () => {
  // industry_code is the anchor: a customer points at the row by uuid, and an
  // import matches on the code. Renaming is the workspace's; re-keying would
  // silently repoint every import that ever ran.
  await withPg(async (c) => {
    const priv = async (p: string) =>
      (await c.query(`SELECT has_table_privilege('yucer_svc', 'yucer_core.industry', $1) AS ok`, [p]))
        .rows[0].ok;
    for (const p of ["SELECT", "INSERT", "DELETE"]) {
      assert.equal(await priv(p), true, `${p} must be granted on the whole table`);
    }
    // UPDATE is granted PER COLUMN, so the table-level answer is false - which
    // is the shape every vocabulary in this product has, and the reason the
    // column check below is the real assertion rather than a detail.
    assert.equal(await priv("UPDATE"), false, "no blanket UPDATE on a table with an anchor");
    const col = async (name: string) =>
      (
        await c.query(
          `SELECT has_column_privilege('yucer_svc', 'yucer_core.industry', $1, 'UPDATE') AS ok`,
          [name],
        )
      ).rows[0].ok;
    assert.equal(await col("name"), true, "renaming an industry is the workspace's");
    assert.equal(await col("sort_order"), true, "so is the order it is offered in");
    assert.equal(await col("industry_code"), false, "the anchor must not be writable");
  });
});
