import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// Every table the service role holds a privilege on sits in a schema it may
// enter (2026-09-28). Table grants without schema USAGE are unreachable, and
// every other db test connects as the CI superuser - which is why none of them
// saw local_audit fail for yucer_svc (incr/0023 -> incr/0095).
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

test("yucer_svc can enter the schema of every table it is granted", { skip }, async () => {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query<{ schema: string; tables: string }>(`
      SELECT n.nspname AS schema, string_agg(cl.relname, ', ' ORDER BY cl.relname) AS tables
        FROM pg_class cl
        JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE cl.relkind IN ('r', 'p', 'v')
         AND (has_table_privilege('yucer_svc', cl.oid, 'SELECT')
              OR has_table_privilege('yucer_svc', cl.oid, 'INSERT'))
         AND NOT has_schema_privilege('yucer_svc', n.oid, 'USAGE')
       GROUP BY n.nspname`);
    assert.deepEqual(rows, [], `granted tables in schemas yucer_svc cannot enter: ${JSON.stringify(rows)}`);
  } finally {
    await c.end();
  }
});

test("as yucer_svc, the audit table answers a read", { skip }, async () => {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL ROLE yucer_svc");
    const r = await c.query("SELECT count(*)::int AS n FROM local_audit.event");
    assert.equal(typeof r.rows[0].n, "number");
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});
