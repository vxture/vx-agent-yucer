import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { DEFAULT_PRICING_POLICY } from "./lib/pricing-policy";

// incr/0044 - 计价规则, against a real Postgres: the column default the build
// mirrors, the shape CHECK, and a grant that lets the service role set the
// currency and nothing else.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";
const WS = "eeeeeeee-0000-0000-0000-000000000044";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try { await c.query("BEGIN"); return await fn(c); }
  finally { await c.query("ROLLBACK"); await c.end(); }
}
async function refuses(c: Client, run: () => Promise<unknown>, expected: RegExp, why?: string) {
  await c.query("SAVEPOINT probe");
  await assert.rejects(run, expected, why);
  await c.query("ROLLBACK TO SAVEPOINT probe");
}

test("a workspace's policy defaults to the one the build ships", { skip }, async () => {
  await withPg(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO yucer_catalog.pricing_policy (workspace_id) VALUES ($1) RETURNING default_currency`, [WS],
    );
    assert.equal(rows[0].default_currency, DEFAULT_PRICING_POLICY.defaultCurrency);
  });
});

test("a currency is three capitals or it is refused", { skip }, async () => {
  await withPg(async (c) => {
    for (const bad of ["cny", "CN", "US1"]) {
      await refuses(
        c,
        () => c.query(`INSERT INTO yucer_catalog.pricing_policy (workspace_id, default_currency) VALUES ($1, $2)`, [WS, bad]),
        /chk_pricing_policy_currency|value too long/,
        bad,
      );
    }
  });
});

test("the service role may set the currency and not re-key the row", { skip }, async () => {
  await withPg(async (c) => {
    const col = async (name: string) =>
      (await c.query(`SELECT has_column_privilege('yucer_svc', 'yucer_catalog.pricing_policy', $1, 'UPDATE') AS ok`, [name])).rows[0].ok;
    assert.equal(await col("default_currency"), true);
    assert.equal(await col("workspace_id"), false);
    assert.equal(
      (await c.query(`SELECT has_table_privilege('yucer_svc', 'yucer_catalog.pricing_policy', 'DELETE') AS ok`)).rows[0].ok,
      false,
      "every workspace prices in something; back to yuan is an update",
    );
  });
});
