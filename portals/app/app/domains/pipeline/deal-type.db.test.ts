import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { DEFAULT_DEAL_TYPES } from "./lib/deal-type-vocab";

// incr/0060 - the deal-type catalog and its FK, against a real Postgres.
//
// WHAT THIS FILE IS FOR. The TypeScript rules (deal-type.test.ts) say what the
// product refuses; only the database proves the floor is real: the shipped
// five match the increment's own seed, one code per workspace, a workspace's
// own FK rejects a code that only exists for another workspace, and ON DELETE
// RESTRICT actually holds while an opportunity references it.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "ffffffff-0000-0000-0000-000000000060";
const ACC = "ffffffff-0000-0000-0000-0000000060ac";

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN");
    return await fn(c);
  } finally {
    await c.query("ROLLBACK");
    await c.end();
  }
}

/** A statement that must be refused, without taking the transaction with it. */
async function refuses(c: Client, run: () => Promise<unknown>, expected: RegExp, why?: string) {
  await c.query("SAVEPOINT probe");
  await assert.rejects(run, expected, why);
  await c.query("ROLLBACK TO SAVEPOINT probe");
}

async function seedAccount(c: Client): Promise<void> {
  await c.query(
    `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
     VALUES ($1, $2, 'ACC-DTP', 'Deal Type Test', 'active') ON CONFLICT DO NOTHING`,
    [ACC, WS],
  );
}

// 0057's own stage seed: opportunity.stage is a composite FK too, so every
// insert in this file needs a real stage code to reference.
async function seedStage(c: Client): Promise<void> {
  await c.query(
    `INSERT INTO yucer_pipeline.stage_definition
       (workspace_id, stage_code, name, sort_order, default_probability, is_won, is_terminal)
     VALUES ($1, 'qualify', '合格判定', 1, 10, FALSE, FALSE)
     ON CONFLICT (workspace_id, stage_code) DO NOTHING`,
    [WS],
  );
}

async function insertDealType(c: Client, code: string, name: string, sortOrder = 1) {
  return c.query(
    `INSERT INTO yucer_pipeline.deal_type (workspace_id, deal_type_code, name, sort_order)
     VALUES ($1, $2, $3, $4)`,
    [WS, code, name, sortOrder],
  );
}

// --- The five shipped rows, verbatim --------------------------------------------

test("incr/0060's own seed matches DEFAULT_DEAL_TYPES exactly - the two cannot disagree", { skip }, async () => {
  await withPg(async (c) => {
    for (const [i, d] of DEFAULT_DEAL_TYPES.entries()) {
      await insertDealType(c, d.dealTypeCode, d.name, i + 1);
    }
    const { rows } = await c.query(
      `SELECT deal_type_code, name, sort_order FROM yucer_pipeline.deal_type
        WHERE workspace_id = $1 ORDER BY sort_order`,
      [WS],
    );
    assert.deepEqual(
      rows.map((r) => ({ dealTypeCode: r.deal_type_code, name: r.name })),
      DEFAULT_DEAL_TYPES.map((d) => ({ dealTypeCode: d.dealTypeCode, name: d.name })),
    );
  });
});

// --- One code per workspace -----------------------------------------------------

test("one code per workspace - the same code twice is a state with no meaning", { skip }, async () => {
  await withPg(async (c) => {
    await insertDealType(c, "new_logo", "新签");
    await refuses(c, () => insertDealType(c, "new_logo", "different name"), /uidx_deal_type_code/);
  });
});

// --- The FK (incr/0060) -----------------------------------------------------------

test("opportunity.deal_type_id rejects a code outside THIS workspace's own catalog", { skip }, async () => {
  await withPg(async (c) => {
    await seedAccount(c);
    await seedStage(c);
    await insertDealType(c, "new_logo", "新签");
    const { rows } = await c.query(
      `SELECT id FROM yucer_pipeline.deal_type WHERE workspace_id = $1 AND deal_type_code = 'new_logo'`,
      [WS],
    );
    const dealTypeId = rows[0].id;

    // NULL is legal - most deals carry no type.
    const untyped = await c.query(
      `INSERT INTO yucer_pipeline.opportunity
         (workspace_id, opportunity_no, name, account_id, owner_sub, requirement)
       VALUES ($1, 'OPP-DTP-1', 'Untyped', $2, 'usr_db', 'fixture requirement')`,
      [WS, ACC],
    );
    assert.equal(untyped.rowCount, 1);

    // A real id from THIS workspace is legal.
    const typed = await c.query(
      `INSERT INTO yucer_pipeline.opportunity
         (workspace_id, opportunity_no, name, account_id, owner_sub, requirement, deal_type_id)
       VALUES ($1, 'OPP-DTP-2', 'Typed', $2, 'usr_db', 'fixture requirement', $3)`,
      [WS, ACC, dealTypeId],
    );
    assert.equal(typed.rowCount, 1);

    // A made-up uuid is refused.
    await refuses(
      c,
      () =>
        c.query(
          `INSERT INTO yucer_pipeline.opportunity
             (workspace_id, opportunity_no, name, account_id, owner_sub, requirement, deal_type_id)
           VALUES ($1, 'OPP-DTP-3', 'Bad', $2, 'usr_db', 'fixture requirement', gen_random_uuid())`,
          [WS, ACC],
        ),
      /fk_opportunity_deal_type/,
    );
  });
});

test("fk_opportunity_deal_type checks only that the id exists, not which workspace it belongs to - the same shape fk_account_industry (incr/0040) already has", { skip }, async () => {
  // DOCUMENTING A KNOWN GAP, not asserting protection that does not exist.
  // Unlike stage_definition's FK (incr/0058, a composite natural key on
  // (workspace_id, stage_code)), deal_type_id is a surrogate uuid FK against
  // deal_type.id alone - so a row from ANOTHER workspace's catalog satisfies
  // it. account.industry_id has the identical shape against industry.id, and
  // that precedent is why this one was built the same way rather than as a
  // composite FK: the application layer is what actually prevents this -
  // listDealTypes/upsertDealType are always scoped by workspaceId, so nothing
  // in the product ever OFFERS another workspace's id to pick from. A crafted
  // raw write could still smuggle one in, which is what this test pins down
  // as a known, accepted, cross-tenant surface rather than a silent one.
  const OTHER_WS = "ffffffff-0000-0000-0000-0000000060ee";
  await withPg(async (c) => {
    await seedAccount(c);
    await seedStage(c);
    await c.query(
      `INSERT INTO yucer_pipeline.deal_type (workspace_id, deal_type_code, name, sort_order)
       VALUES ($1, 'new_logo', '新签', 1)`,
      [OTHER_WS],
    );
    const { rows } = await c.query(
      `SELECT id FROM yucer_pipeline.deal_type WHERE workspace_id = $1`,
      [OTHER_WS],
    );
    const otherWorkspacesDealTypeId = rows[0].id;

    const written = await c.query(
      `INSERT INTO yucer_pipeline.opportunity
         (workspace_id, opportunity_no, name, account_id, owner_sub, requirement, deal_type_id)
       VALUES ($1, 'OPP-DTP-4', 'Deal', $2, 'usr_db', 'fixture requirement', $3)`,
      [WS, ACC, otherWorkspacesDealTypeId],
    );
    assert.equal(written.rowCount, 1, "the FK does not refuse a foreign workspace's id");
  });
});

// --- ON DELETE RESTRICT ------------------------------------------------------------

test("a deal type cannot be deleted while an opportunity still references it", { skip }, async () => {
  await withPg(async (c) => {
    await seedAccount(c);
    await seedStage(c);
    await insertDealType(c, "new_logo", "新签");
    const { rows } = await c.query(
      `SELECT id FROM yucer_pipeline.deal_type WHERE workspace_id = $1`,
      [WS],
    );
    const dealTypeId = rows[0].id;
    await c.query(
      `INSERT INTO yucer_pipeline.opportunity
         (workspace_id, opportunity_no, name, account_id, owner_sub, requirement, deal_type_id)
       VALUES ($1, 'OPP-DTP-5', 'Deal', $2, 'usr_db', 'fixture requirement', $3)`,
      [WS, ACC, dealTypeId],
    );
    await refuses(
      c,
      () => c.query(`DELETE FROM yucer_pipeline.deal_type WHERE id = $1`, [dealTypeId]),
      /fk_opportunity_deal_type/,
    );
  });
});

test("an unused deal type can be deleted", { skip }, async () => {
  await withPg(async (c) => {
    await insertDealType(c, "new_logo", "新签");
    const deleted = await c.query(
      `DELETE FROM yucer_pipeline.deal_type WHERE workspace_id = $1 AND deal_type_code = 'new_logo'`,
      [WS],
    );
    assert.equal(deleted.rowCount, 1);
  });
});

// --- Grants -----------------------------------------------------------------------

test("the service role may write name/order, and not the anchor or the workspace", { skip }, async () => {
  await withPg(async (c) => {
    const col = async (name: string) =>
      (
        await c.query(`SELECT has_column_privilege('yucer_svc', 'yucer_pipeline.deal_type', $1, 'UPDATE') AS ok`, [
          name,
        ])
      ).rows[0].ok;

    for (const name of ["name", "sort_order", "updated_at"]) {
      assert.equal(await col(name), true, `deal_type.${name} must be writable`);
    }
    assert.equal(await col("deal_type_code"), false, "deal_type_code is the anchor and must not be writable");
    assert.equal(await col("workspace_id"), false, "workspace_id must not be writable");
  });
});

test("opportunity.deal_type_id is writable by the service role", { skip }, async () => {
  await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT has_column_privilege('yucer_svc', 'yucer_pipeline.opportunity', 'deal_type_id', 'UPDATE') AS ok`,
    );
    assert.equal(rows[0].ok, true);
  });
});
