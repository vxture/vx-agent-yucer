import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// incr/0026 - the person/affiliation split, against a real Postgres.
//
// WHAT THIS FILE IS FOR. The migration's whole argument is that renaming
// yucer_core.contact keeps every id and every evidence foreign key, so nothing
// has to be rewritten under grants that do not permit rewriting. That claim is
// about foreign keys and grants - properties of Postgres and of nothing else -
// and a fully green TypeScript suite says nothing about any of it.
//
// The two capabilities the old schema could not express get tests here too,
// because "it compiles" is not evidence that a person can now hold two jobs.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "cccccccc-0000-0000-0000-000000000001";
const A1 = "cccccccc-0000-0000-0000-0000000000c1";
const A2 = "cccccccc-0000-0000-0000-0000000000c2";
const P1 = "cccccccc-0000-0000-0000-0000000000d1";
const P2 = "cccccccc-0000-0000-0000-0000000000d2";

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
    await c.query(`DELETE FROM yucer_core.account_relation WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.person_affiliation WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.person WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.account WHERE workspace_id = $1`, [WS]);
  });
}

async function seed(c: Client) {
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name)
     VALUES ($1, $3, 'ACC-C1', 'Group'), ($2, $3, 'ACC-C2', 'Subsidiary')`,
    [A1, A2, WS],
  );
  await c.query(
    `INSERT INTO yucer_core.person (id, workspace_id, name) VALUES ($1, $3, 'Wang'), ($2, $3, 'Chen')`,
    [P1, P2, WS],
  );
}

// --- the shape the rename produced -----------------------------------------

test("contact is gone and person is the same table under a new name", { skip }, async () => {
  await withPg(async (c) => {
    const gone = await c.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'yucer_core' AND table_name = 'contact'`,
    );
    assert.equal(gone.rows.length, 0, "yucer_core.contact must not exist after the migration");

    // The employment columns left; the person columns stayed. Both halves
    // matter: a migration that dropped the wrong three would also produce a
    // table called person.
    const cols = await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'yucer_core' AND table_name = 'person'`,
    );
    const names = new Set(cols.rows.map((r) => r.column_name));
    for (const c2 of ["account_id", "title", "department"]) {
      assert.ok(!names.has(c2), `${c2} belongs to the affiliation now`);
    }
    for (const c2 of ["id", "name", "decision_role", "influence", "email", "mobile", "wechat"]) {
      assert.ok(names.has(c2), `${c2} must have survived the rename`);
    }
  });
});

test("all four evidence foreign keys followed the rename", { skip }, async () => {
  // THE CENTRE OF ADR-024's ARGUMENT. interaction_participant is INSERT/SELECT
  // only, commitment excludes counterpart_contact_id from its narrow UPDATE,
  // and account_relation has no UPDATE at all - so "new table, repoint the
  // references" could never have run. A rename moves them for free because a
  // foreign key references the table's OID, not its name. This asserts the free
  // part actually happened.
  await withPg(async (c) => {
    const r = await c.query(
      `SELECT conname FROM pg_constraint WHERE confrelid = 'yucer_core.person'::regclass`,
    );
    const names = new Set(r.rows.map((x) => x.conname));
    for (const fk of [
      "fk_account_relation_from",
      "fk_account_relation_to",
      "fk_commitment_contact",
      "fk_participant_contact",
    ]) {
      assert.ok(names.has(fk), `${fk} must now reference yucer_core.person`);
    }
  });
});

test("no constraint or index on person still says contact", { skip }, async () => {
  // Cosmetic until it is not: a constraint name is what a caller sees in the
  // error, and chk_contact_status on a table called person makes every future
  // reader learn this history to read the message.
  await withPg(async (c) => {
    const cons = await c.query(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'yucer_core.person'::regclass
         AND conname LIKE '%contact%'`,
    );
    assert.deepEqual(cons.rows, []);
    const idx = await c.query(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'yucer_core' AND tablename = 'person' AND indexname LIKE '%contact%'`,
    );
    assert.deepEqual(idx.rows, []);
  });
});

// --- what the old schema could not say -------------------------------------

test("one person can work at two companies at once", { skip }, async () => {
  // The defect ADR-024 opens with. Under contact.account_id NOT NULL this
  // needed two rows, which then accumulated separate interactions and could
  // never be merged back into one person.
  await cleanup();
  await withPg(async (c) => {
    await seed(c);
    await c.query(
      `INSERT INTO yucer_core.person_affiliation (workspace_id, person_id, account_id, title)
       VALUES ($1, $2, $3, 'CFO'), ($1, $2, $4, 'Board member')`,
      [WS, P1, A1, A2],
    );
    const r = await c.query(
      `SELECT count(*)::int AS n FROM yucer_core.person_affiliation
        WHERE person_id = $1 AND ended_at IS NULL`,
      [P1],
    );
    assert.equal(r.rows[0].n, 2, "one person, two current employments, one id");
  });
  await cleanup();
});

test("changing employer keeps the old employment as history", { skip }, async () => {
  // The other defect: contact.account_id could only be OVERWRITTEN, so "three
  // months ago he was still at 长江物流" was destroyed by recording where he is
  // now. Both rows stand, and the person id never changed - so the interactions
  // he attended at the old company still point at him.
  await cleanup();
  await withPg(async (c) => {
    await seed(c);
    await c.query(
      `INSERT INTO yucer_core.person_affiliation (workspace_id, person_id, account_id, title, ended_at)
       VALUES ($1, $2, $3, 'CFO', now())`,
      [WS, P1, A1],
    );
    await c.query(
      `INSERT INTO yucer_core.person_affiliation (workspace_id, person_id, account_id, title)
       VALUES ($1, $2, $3, 'CFO')`,
      [WS, P1, A2],
    );
    const all = await c.query(
      `SELECT account_id, ended_at FROM yucer_core.person_affiliation WHERE person_id = $1`,
      [P1],
    );
    assert.equal(all.rows.length, 2, "the past employment is still on file");
    const current = all.rows.filter((r) => r.ended_at === null);
    assert.equal(current.length, 1);
    assert.equal(current[0].accountId ?? current[0].account_id, A2);
  });
  await cleanup();
});

test("the same person cannot hold two OPEN employments at one company", { skip }, async () => {
  // uidx_person_affiliation_current. This is the data error that would silently
  // double every contact count on a customer, and it is exactly the shape a
  // careless "record the new job" write produces when it forgets to close the
  // old one.
  await cleanup();
  await withPg(async (c) => {
    await seed(c);
    await c.query(
      `INSERT INTO yucer_core.person_affiliation (workspace_id, person_id, account_id) VALUES ($1, $2, $3)`,
      [WS, P2, A1],
    );
    await assert.rejects(
      () =>
        c.query(
          `INSERT INTO yucer_core.person_affiliation (workspace_id, person_id, account_id) VALUES ($1, $2, $3)`,
          [WS, P2, A1],
        ),
      /uidx_person_affiliation_current/,
    );
  });
  await cleanup();
});

test("a re-hire is allowed once the first employment is closed", { skip }, async () => {
  // The partial predicate's other half. A unique index over the pair alone
  // would make coming back to a company impossible, and people do.
  await cleanup();
  await withPg(async (c) => {
    await seed(c);
    await c.query(
      `INSERT INTO yucer_core.person_affiliation (workspace_id, person_id, account_id, ended_at)
       VALUES ($1, $2, $3, now())`,
      [WS, P2, A1],
    );
    await c.query(
      `INSERT INTO yucer_core.person_affiliation (workspace_id, person_id, account_id) VALUES ($1, $2, $3)`,
      [WS, P2, A1],
    );
    const r = await c.query(
      `SELECT count(*)::int AS n FROM yucer_core.person_affiliation WHERE person_id = $1`,
      [P2],
    );
    assert.equal(r.rows[0].n, 2);
  });
  await cleanup();
});

test("an employment cannot end before it started", { skip }, async () => {
  await cleanup();
  await withPg(async (c) => {
    await seed(c);
    await assert.rejects(
      () =>
        c.query(
          `INSERT INTO yucer_core.person_affiliation
             (workspace_id, person_id, account_id, started_at, ended_at)
           VALUES ($1, $2, $3, now(), now() - interval '1 day')`,
          [WS, P1, A1],
        ),
      /chk_person_affiliation_dates/,
    );
  });
  await cleanup();
});

test("deleting a person takes their employments and leaves the company", { skip }, async () => {
  await cleanup();
  await withPg(async (c) => {
    await seed(c);
    await c.query(
      `INSERT INTO yucer_core.person_affiliation (workspace_id, person_id, account_id) VALUES ($1, $2, $3)`,
      [WS, P1, A1],
    );
    await c.query(`DELETE FROM yucer_core.person WHERE id = $1`, [P1]);
    const links = await c.query(`SELECT 1 FROM yucer_core.person_affiliation WHERE person_id = $1`, [P1]);
    assert.equal(links.rows.length, 0);
    const acc = await c.query(`SELECT 1 FROM yucer_core.account WHERE id = $1`, [A1]);
    assert.equal(acc.rows.length, 1, "the customer is not collateral damage");
  });
  await cleanup();
});
