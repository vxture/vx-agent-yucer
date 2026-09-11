import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "pg";

/* THE BASELINE TRIO IS A NO-OP ON A MIGRATED DATABASE.
 *
 * db-init keeps a ledger now (ADR-032) and does not re-run 00 / 97 / 98 on a
 * database that has them - but the day it did (2026-09-10, production run
 * 34517329962) the baseline re-created a table incr/0026 had renamed and the
 * locks granted on a column incr/0040 had dropped. Both files carry guards
 * for that now, and this test is what keeps the guards honest: the trio,
 * applied AGAIN on the database the db-contract job has already migrated,
 * must go through and must not create anything the increments took away.
 *
 * Only the trio. The increments are NOT replayable by design - an increment
 * is written against the schema as it was when it was new - which is exactly
 * why the ledger exists; asserting otherwise here would assert the wrong
 * property.
 *
 * IN ONE TRANSACTION, ROLLED BACK: invisible to the other db tests running
 * beside this one (node --test runs files concurrently) and leaves the
 * database as it found it.
 *
 * SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";
const DDL = join(import.meta.dirname, "../../../../../deploy/database/ddl");

test("00 / 97 / 98 re-apply cleanly on a migrated database and re-create nothing renamed away", { skip }, async () => {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN");
    try {
      for (const f of ["00_baseline.sql", "97_service_role.sql", "98_column_locks.sql"]) {
        try {
          await c.query(readFileSync(join(DDL, f), "utf8"));
        } catch (e) {
          assert.fail(`${f} is not a no-op on a migrated database: ${(e as Error).message}`);
        }
      }
      const r = await c.query(
        "SELECT to_regclass('yucer_core.contact') IS NULL AS no_stray, to_regclass('yucer_core.person') IS NOT NULL AS person",
      );
      assert.deepEqual(r.rows[0], { no_stray: true, person: true }, "the baseline must not re-create contact beside person");
    } finally {
      await c.query("ROLLBACK");
    }
  } finally {
    await c.end();
  }
});
