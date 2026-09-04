import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// incr/0024 and incr/0025, against a real Postgres.
//
// EVERY ASSERTION HERE IS ABOUT A PROPERTY OF POSTGRES AND OF NOTHING ELSE. A
// partial UNIQUE index, a CHECK, a self-referencing foreign key and a column
// grant are not visible to the TypeScript suite: it can run entirely green
// while the index does not exist, the CHECK was never created, or the grant
// names a column that is not there - the last of which would kill db-init at
// deploy time rather than at review.
//
// THE PARTIAL INDEX IS THE ONE THAT NEEDED TESTING MOST, because both of its
// predicates are easy to write and easy to get wrong, and each failure mode is
// silent in a different direction:
//   - drop `credit_code IS NOT NULL` and nothing breaks visibly, because
//     Postgres treats NULLs as distinct anyway - until somebody "tidies" the
//     index into NULLS NOT DISTINCT and every unidentified prospect collides.
//   - drop `deleted_at IS NULL` and soft-deleting a customer permanently
//     reserves its credit code, so re-creating that customer is impossible and
//     the error blames a duplicate that the user cannot see.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts. In CI the
// db-contract job applies the full DDL first.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "dddddddd-0000-0000-0000-000000000001";
const WS_OTHER = "dddddddd-0000-0000-0000-000000000002";
const A1 = "dddddddd-0000-0000-0000-0000000000a1";
const A2 = "dddddddd-0000-0000-0000-0000000000a2";
const A3 = "dddddddd-0000-0000-0000-0000000000a3";
const CODE = "91310000MA1TEST0AA";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function cleanup() {
  await withPg(async (c) => {
    // parent_id first: a subsidiary row references its parent, and deleting in
    // one statement would depend on the order Postgres happens to pick.
    await c.query(`UPDATE yucer_core.account SET parent_id = NULL WHERE workspace_id IN ($1, $2)`, [WS, WS_OTHER]);
    await c.query(`DELETE FROM yucer_core.person WHERE workspace_id IN ($1, $2)`, [WS, WS_OTHER]);
    await c.query(`DELETE FROM yucer_core.account WHERE workspace_id IN ($1, $2)`, [WS, WS_OTHER]);
  });
}

async function account(
  c: Client,
  id: string,
  no: string,
  over: { workspaceId?: string; creditCode?: string | null; deletedAt?: string | null } = {},
) {
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, credit_code, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, over.workspaceId ?? WS, no, "Test", over.creditCode ?? null, over.deletedAt ?? null],
  );
}

// --- incr/0024, the identity columns --------------------------------------

test("the new columns exist with the types the mirror claims", { skip }, async () => {
  await withPg(async (c) => {
    const r = await c.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'yucer_core' AND table_name = $1 AND column_name = ANY($2)`,
      ["account", ["credit_code", "website", "employee_count", "parent_id"]],
    );
    assert.equal(r.rows.length, 4, `expected 4 new account columns, found ${r.rows.length}`);
    // ALL NULLABLE is the design, not an accident: every row on file predates
    // these columns and a NOT NULL would have to be satisfied by inventing data.
    for (const row of r.rows) assert.equal(row.is_nullable, "YES", `${row.column_name} must be nullable`);
    assert.equal(r.rows.find((x) => x.column_name === "employee_count")!.data_type, "integer");

    const k = await c.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'yucer_core' AND table_name = 'person' AND column_name = ANY($1)`,
      [["email", "mobile", "wechat"]],
    );
    assert.equal(k.rows.length, 3);
    for (const row of k.rows) assert.equal(row.is_nullable, "YES");
  });
});

test("two customers cannot share a credit code inside one workspace", { skip }, async () => {
  await cleanup();
  await withPg(async (c) => {
    await account(c, A1, "ACC-D001", { creditCode: CODE });
    await assert.rejects(
      () => account(c, A2, "ACC-D002", { creditCode: CODE }),
      /uidx_account_ws_credit_code/,
      "a duplicate customer master record must be refused by the database",
    );
  });
  await cleanup();
});

test("the same credit code in ANOTHER workspace is not a duplicate", { skip }, async () => {
  // Two tenants selling to the same company is normal. A unique index without
  // workspace_id in the key would leak one workspace's customers into another's
  // constraint failures - which is also an information leak, not just a bug.
  await cleanup();
  await withPg(async (c) => {
    await account(c, A1, "ACC-D001", { creditCode: CODE });
    await account(c, A2, "ACC-D002", { workspaceId: WS_OTHER, creditCode: CODE });
    const r = await c.query(`SELECT count(*)::int AS n FROM yucer_core.account WHERE credit_code = $1`, [CODE]);
    assert.equal(r.rows[0].n, 2);
  });
  await cleanup();
});

test("many customers with NO credit code do not collide", { skip }, async () => {
  // The common case, and the one a NULLS NOT DISTINCT index would break for
  // every prospect somebody met last week.
  await cleanup();
  await withPg(async (c) => {
    await account(c, A1, "ACC-D001");
    await account(c, A2, "ACC-D002");
    await account(c, A3, "ACC-D003");
    const r = await c.query(
      `SELECT count(*)::int AS n FROM yucer_core.account WHERE workspace_id = $1 AND credit_code IS NULL`,
      [WS],
    );
    assert.equal(r.rows[0].n, 3);
  });
  await cleanup();
});

test("a soft-deleted customer does not reserve its credit code forever", { skip }, async () => {
  // The second predicate. Without `deleted_at IS NULL` the delete is permanent
  // in a way nobody asked for, and the error names a row the user cannot see.
  await cleanup();
  await withPg(async (c) => {
    await account(c, A1, "ACC-D001", { creditCode: CODE, deletedAt: "2026-09-01T00:00:00Z" });
    await account(c, A2, "ACC-D002", { creditCode: CODE });
    const r = await c.query(
      `SELECT count(*)::int AS n FROM yucer_core.account
        WHERE workspace_id = $1 AND credit_code = $2 AND deleted_at IS NULL`,
      [WS, CODE],
    );
    assert.equal(r.rows[0].n, 1, "exactly one LIVE row may hold the code");
  });
  await cleanup();
});

test("a negative headcount is refused", { skip }, async () => {
  await cleanup();
  await withPg(async (c) => {
    await account(c, A1, "ACC-D001");
    await assert.rejects(
      () => c.query(`UPDATE yucer_core.account SET employee_count = -1 WHERE id = $1`, [A1]),
      /chk_account_employee_count/,
    );
    // Zero is not negative and is a real answer - a shell company with no staff.
    await c.query(`UPDATE yucer_core.account SET employee_count = 0 WHERE id = $1`, [A1]);
  });
  await cleanup();
});

// --- incr/0025, the hierarchy ---------------------------------------------

test("a customer cannot be its own parent - the CHECK, not the rule", { skip }, async () => {
  await cleanup();
  await withPg(async (c) => {
    await account(c, A1, "ACC-D001");
    await assert.rejects(
      () => c.query(`UPDATE yucer_core.account SET parent_id = id WHERE id = $1`, [A1]),
      /chk_account_parent_not_self/,
    );
  });
  await cleanup();
});

test("a parent that does not exist is refused by the foreign key", { skip }, async () => {
  await cleanup();
  await withPg(async (c) => {
    await account(c, A1, "ACC-D001");
    await assert.rejects(
      () => c.query(`UPDATE yucer_core.account SET parent_id = $2 WHERE id = $1`, [A1, A3]),
      /fk_account_parent/,
    );
  });
  await cleanup();
});

test("A -> B -> A is legal to Postgres, which is why the rule layer exists", { skip }, async () => {
  // NOT a bug being documented as a feature. This asserts the exact gap
  // planAccountParent covers: a foreign key constrains one row at a time and
  // has no view of a chain. If this test ever turns red because the database
  // started refusing cycles, the rule guard could be reconsidered - and until
  // then, deleting it would let this shape straight in.
  await cleanup();
  await withPg(async (c) => {
    await account(c, A1, "ACC-D001");
    await account(c, A2, "ACC-D002");
    await c.query(`UPDATE yucer_core.account SET parent_id = $2 WHERE id = $1`, [A1, A2]);
    await c.query(`UPDATE yucer_core.account SET parent_id = $2 WHERE id = $1`, [A2, A1]);
    const r = await c.query(
      `SELECT count(*)::int AS n FROM yucer_core.account a
         JOIN yucer_core.account b ON a.parent_id = b.id AND b.parent_id = a.id
        WHERE a.workspace_id = $1`,
      [WS],
    );
    assert.equal(r.rows[0].n, 2, "the database accepted a two-row cycle");
  });
  await cleanup();
});

test("deleting a parent orphans its subsidiary rather than deleting it", { skip }, async () => {
  // ON DELETE SET NULL, and the alternative is data loss dressed as referential
  // integrity: a subsidiary is a customer in its own right, with its own deals.
  await cleanup();
  await withPg(async (c) => {
    await account(c, A1, "ACC-D001");
    await account(c, A2, "ACC-D002");
    await c.query(`UPDATE yucer_core.account SET parent_id = $2 WHERE id = $1`, [A2, A1]);
    await c.query(`DELETE FROM yucer_core.account WHERE id = $1`, [A1]);
    const r = await c.query(`SELECT parent_id FROM yucer_core.account WHERE id = $1`, [A2]);
    assert.equal(r.rows.length, 1, "the subsidiary must still exist");
    assert.equal(r.rows[0].parent_id, null);
  });
  await cleanup();
});

// --- the grants ------------------------------------------------------------

test("the service role may write every new column, and the anchors stay locked", { skip }, async () => {
  // The failure this catches is the one that kills db-init at deploy time: a
  // GRANT naming a column that does not exist, or a column added without a
  // grant so the service write dies with permission denied. Both are invisible
  // to the mirror tests, which prove mirror == DDL and never DDL == schema.
  await withPg(async (c) => {
    const r = await c.query(
      `SELECT column_name FROM information_schema.role_column_grants
        WHERE grantee = 'yucer_svc' AND table_schema = 'yucer_core'
          AND table_name = $1 AND privilege_type = 'UPDATE'`,
      ["account"],
    );
    const cols = new Set(r.rows.map((x) => x.column_name));
    for (const col of ["credit_code", "website", "employee_count", "parent_id"]) {
      assert.ok(cols.has(col), `yucer_svc cannot UPDATE account.${col}`);
    }
    // account_no is the anchor and must never have become writable in passing.
    assert.ok(!cols.has("account_no"), "account_no must stay locked");
    assert.ok(!cols.has("workspace_id"), "workspace_id must stay locked");

    const k = await c.query(
      `SELECT column_name FROM information_schema.role_column_grants
        WHERE grantee = 'yucer_svc' AND table_schema = 'yucer_core'
          AND table_name = $1 AND privilege_type = 'UPDATE'`,
      ["person"],
    );
    const ccols = new Set(k.rows.map((x) => x.column_name));
    for (const col of ["email", "mobile", "wechat"]) {
      assert.ok(ccols.has(col), `yucer_svc cannot UPDATE contact.${col}`);
    }
    // account_id is not a column on person at all any more - incr/0026 moved
    // the employment to person_affiliation, where the pair (person, account) IS
    // the edge and has no UPDATE grant either. Both statements are asserted:
    // absent here, and locked there.
    assert.ok(!ccols.has("account_id"), "person must not carry account_id at all");

    const aff = await c.query(
      `SELECT column_name FROM information_schema.role_column_grants
        WHERE grantee = 'yucer_svc' AND table_schema = 'yucer_core'
          AND table_name = 'person_affiliation' AND privilege_type = 'UPDATE'`,
    );
    const acols = new Set(aff.rows.map((x) => x.column_name));
    for (const col of ["title", "department", "is_primary", "started_at", "ended_at"]) {
      assert.ok(acols.has(col), `yucer_svc cannot UPDATE person_affiliation.${col}`);
    }
    for (const col of ["person_id", "account_id"]) {
      assert.ok(!acols.has(col), `person_affiliation.${col} is the edge and must stay locked`);
    }
  });
});
