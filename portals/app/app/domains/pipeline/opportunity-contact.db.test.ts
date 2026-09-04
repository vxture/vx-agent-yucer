import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// incr/0027 - the per-deal buying role, against a real Postgres.
//
// The rule layer's tests prove the FALLBACK; these prove the things only the
// database can enforce: one answer per person per deal, the role vocabulary,
// the cross-schema foreign key, and a column grant that stops the edge itself
// being edited. A green TypeScript suite says nothing about any of them.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "bbbbbbbb-0000-0000-0000-000000000001";
const ACC = "bbbbbbbb-0000-0000-0000-0000000000ac";
const OPP = "bbbbbbbb-0000-0000-0000-0000000000e1";
const OPP2 = "bbbbbbbb-0000-0000-0000-0000000000e2";
const P1 = "bbbbbbbb-0000-0000-0000-0000000000d1";

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
    await c.query(`DELETE FROM yucer_pipeline.opportunity_contact WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_pipeline.opportunity WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.person WHERE workspace_id = $1`, [WS]);
    await c.query(`DELETE FROM yucer_core.account WHERE workspace_id = $1`, [WS]);
  });
}

async function seed(c: Client) {
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name) VALUES ($1, $2, 'ACC-B1', 'Buyer')`,
    [ACC, WS],
  );
  await c.query(`INSERT INTO yucer_core.person (id, workspace_id, name) VALUES ($1, $2, 'Wang')`, [P1, WS]);
  await c.query(
    `INSERT INTO yucer_pipeline.opportunity (id, workspace_id, opportunity_no, name, account_id, stage)
     VALUES ($1, $3, 'OPP-B1', 'Supply chain', $4, 'validate'),
            ($2, $3, 'OPP-B2', 'Scheduling', $4, 'discover')`,
    [OPP, OPP2, WS, ACC],
  );
}

test("one person may hold different roles on different deals", { skip }, async () => {
  // THE WHOLE POINT. Under person.decision_role this needed two people or one
  // lie; both deals now have their own answer about the same person.
  await cleanup();
  await withPg(async (c) => {
    await seed(c);
    await c.query(
      `INSERT INTO yucer_pipeline.opportunity_contact (workspace_id, opportunity_id, person_id, buying_role)
       VALUES ($1, $2, $4, 'economic'), ($1, $3, $4, 'user')`,
      [WS, OPP, OPP2, P1],
    );
    const r = await c.query(
      `SELECT opportunity_id, buying_role FROM yucer_pipeline.opportunity_contact
        WHERE person_id = $1 ORDER BY buying_role`,
      [P1],
    );
    assert.deepEqual(
      r.rows.map((x) => x.buying_role),
      ["economic", "user"],
    );
  });
  await cleanup();
});

test("a person cannot hold two roles on ONE deal", { skip }, async () => {
  // uidx_opportunity_contact_pair. Two rows would be two answers to one
  // question, and the chain walk would pick one silently, by row order.
  await cleanup();
  await withPg(async (c) => {
    await seed(c);
    await c.query(
      `INSERT INTO yucer_pipeline.opportunity_contact (workspace_id, opportunity_id, person_id, buying_role)
       VALUES ($1, $2, $3, 'economic')`,
      [WS, OPP, P1],
    );
    await assert.rejects(
      () =>
        c.query(
          `INSERT INTO yucer_pipeline.opportunity_contact (workspace_id, opportunity_id, person_id, buying_role)
           VALUES ($1, $2, $3, 'coach')`,
          [WS, OPP, P1],
        ),
      /uidx_opportunity_contact_pair/,
    );
  });
  await cleanup();
});

test("the role vocabulary is the same six as the person default", { skip }, async () => {
  // Two vocabularies for one concept is how a fallback becomes untranslatable.
  await cleanup();
  await withPg(async (c) => {
    await seed(c);
    await assert.rejects(
      () =>
        c.query(
          `INSERT INTO yucer_pipeline.opportunity_contact (workspace_id, opportunity_id, person_id, buying_role)
           VALUES ($1, $2, $3, 'champion')`,
          [WS, OPP, P1],
        ),
      /chk_opportunity_contact_role/,
    );
  });
  await cleanup();
});

test("closing a deal takes its buying committee with it", { skip }, async () => {
  // ON DELETE CASCADE from the opportunity: the committee is a statement about
  // that purchase and means nothing without it. The PERSON is untouched -
  // deleting a deal must never delete a customer's contact.
  await cleanup();
  await withPg(async (c) => {
    await seed(c);
    await c.query(
      `INSERT INTO yucer_pipeline.opportunity_contact (workspace_id, opportunity_id, person_id, buying_role)
       VALUES ($1, $2, $3, 'economic')`,
      [WS, OPP, P1],
    );
    await c.query(`DELETE FROM yucer_pipeline.opportunity WHERE id = $1`, [OPP]);
    const links = await c.query(
      `SELECT 1 FROM yucer_pipeline.opportunity_contact WHERE opportunity_id = $1`,
      [OPP],
    );
    assert.equal(links.rows.length, 0);
    const person = await c.query(`SELECT 1 FROM yucer_core.person WHERE id = $1`, [P1]);
    assert.equal(person.rows.length, 1, "the person is not collateral damage");
  });
  await cleanup();
});

test("the cross-schema foreign key into person is live", { skip }, async () => {
  await cleanup();
  await withPg(async (c) => {
    await seed(c);
    await assert.rejects(
      () =>
        c.query(
          `INSERT INTO yucer_pipeline.opportunity_contact (workspace_id, opportunity_id, person_id, buying_role)
           VALUES ($1, $2, $3, 'economic')`,
          [WS, OPP, "bbbbbbbb-0000-0000-0000-0000000000ff"],
        ),
      /fk_opportunity_contact_person/,
    );
  });
  await cleanup();
});

test("the edge itself is not writable; the role is", { skip }, async () => {
  await withPg(async (c) => {
    const r = await c.query(
      `SELECT column_name FROM information_schema.role_column_grants
        WHERE grantee = 'yucer_svc' AND table_schema = 'yucer_pipeline'
          AND table_name = 'opportunity_contact' AND privilege_type = 'UPDATE'`,
    );
    const cols = new Set(r.rows.map((x) => x.column_name));
    for (const c2 of ["buying_role", "influence", "is_primary"]) {
      assert.ok(cols.has(c2), `yucer_svc cannot UPDATE ${c2}`);
    }
    for (const c2 of ["opportunity_id", "person_id"]) {
      assert.ok(!cols.has(c2), `${c2} is the edge and must stay locked`);
    }
  });
});
