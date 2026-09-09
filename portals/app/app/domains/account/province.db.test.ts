import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// incr/0035 - the province column, against a real Postgres.
//
// WHAT THIS FILE IS FOR. The increment's argument is that a national roll-up is
// only trustworthy if the province column cannot hold a value the map has no
// shape for. That is a CHECK constraint and a GRANT - properties of Postgres and
// of nothing else - so a fully green TypeScript suite says nothing about either.
// The screen would simply drop a province whose name did not match, and drop it
// silently, which is the failure this constraint exists to make impossible.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000035";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const insert = (c: Client, no: string, province: string | null) =>
  c.query(
    `INSERT INTO yucer_core.account (workspace_id, account_no, name, province)
     VALUES ($1, $2, $3, $4) RETURNING province`,
    [WS, no, "province-test-" + no, province],
  );

test("a province the map has geometry for is accepted", { skip }, async () => {
  await withPg(async (c) => {
    const r = await insert(c, "P-OK", "江苏省");
    assert.equal(r.rows[0].province, "江苏省");
    await c.query("DELETE FROM yucer_core.account WHERE workspace_id = $1", [WS]);
  });
});

test("a plausible mis-spelling is REFUSED, not stored", { skip }, async () => {
  await withPg(async (c) => {
    // 江苏 is what a person types and what an import produces. It is not a value
    // the map can find a shape for, and without the CHECK it would sit in the
    // column looking exactly as valid as 江苏省 - the roll-up would then report
    // a province short and nothing anywhere would say so.
    await assert.rejects(
      () => insert(c, "P-BAD", "江苏"),
      /chk_account_province/,
      "a province name outside the vocabulary must not be storable",
    );
  });
});

test("not knowing the province is allowed - most prospects are a name", { skip }, async () => {
  await withPg(async (c) => {
    const r = await insert(c, "P-NULL", null);
    assert.equal(r.rows[0].province, null);
    await c.query("DELETE FROM yucer_core.account WHERE workspace_id = $1", [WS]);
  });
});

test("the service role may UPDATE province - the column lock includes it", { skip }, async () => {
  await withPg(async (c) => {
    const r = await c.query(
      `SELECT 1 FROM information_schema.column_privileges
        WHERE table_schema = 'yucer_core' AND table_name = 'account'
          AND column_name = 'province' AND grantee = 'yucer_svc'
          AND privilege_type = 'UPDATE'`,
    );
    // 98_column_locks REVOKEs UPDATE on the table and re-grants it column by
    // column, so a column added by a later increment is readable, insertable
    // and NOT updatable until it is named. The failure is silent until a write.
    assert.equal(r.rowCount, 1, "province must be in the account UPDATE grant");
  });
});

test("province is indexed for the per-workspace roll-up the screen runs", { skip }, async () => {
  await withPg(async (c) => {
    const r = await c.query(
      `SELECT 1 FROM pg_indexes
        WHERE schemaname = 'yucer_core' AND tablename = 'account'
          AND indexname = 'idx_account_ws_province'`,
    );
    assert.equal(r.rowCount, 1);
  });
});

test("region is untouched - territory routing still matches on 大区", { skip }, async () => {
  await withPg(async (c) => {
    // The increment's central claim: province is ADDITIVE. If it had replaced
    // region, every account would sit on ground no territory covers.
    const r = await insert(c, "P-BOTH", "广东省");
    assert.equal(r.rows[0].province, "广东省");
    const both = await c.query(
      "UPDATE yucer_core.account SET region = $1 WHERE workspace_id = $2 RETURNING region, province",
      ["华南", WS],
    );
    assert.equal(both.rows[0].region, "华南");
    assert.equal(both.rows[0].province, "广东省");
    await c.query("DELETE FROM yucer_core.account WHERE workspace_id = $1", [WS]);
  });
});
