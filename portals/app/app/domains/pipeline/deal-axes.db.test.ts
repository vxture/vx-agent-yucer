import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { DEFAULT_CONTRACT_TYPES } from "./lib/contract-type-vocab";
import { DEFAULT_BUSINESS_FORMS } from "./lib/business-form-vocab";

// incr/0067 - 签约类型 and 业务形态, the two vocabularies 商机类型 split into,
// against a real Postgres.
//
// WHAT THIS FILE IS FOR. The TypeScript rules (contract-type.test.ts /
// business-form.test.ts) say what the product refuses; only the database
// proves the floor is real: the shipped rows match the increment's own seed,
// one code per workspace per axis, both FKs hold, ON DELETE RESTRICT actually
// bites, the stall CHECK is enforced on the axis it moved to, and the old
// deal_type table is genuinely gone rather than merely unused.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "ffffffff-0000-0000-0000-000000000067";
const ACC = "ffffffff-0000-0000-0000-0000000067ac";

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
     VALUES ($1, $2, 'ACC-AXES', 'Deal Axes Test', 'active') ON CONFLICT DO NOTHING`,
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

const insertContractType = (c: Client, code: string, name: string, sortOrder = 1) =>
  c.query(
    `INSERT INTO yucer_pipeline.contract_type (workspace_id, contract_type_code, name, sort_order)
     VALUES ($1, $2, $3, $4)`,
    [WS, code, name, sortOrder],
  );

const insertBusinessForm = (c: Client, code: string, name: string, sortOrder = 1) =>
  c.query(
    `INSERT INTO yucer_pipeline.business_form (workspace_id, business_form_code, name, sort_order)
     VALUES ($1, $2, $3, $4)`,
    [WS, code, name, sortOrder],
  );

// --- The old axis is gone, not merely unused --------------------------------------

test("yucer_pipeline.deal_type no longer exists, and neither does opportunity.deal_type_id", { skip }, async () => {
  // The increment drops both once backfilled - the same shape incr/0029 used
  // when product.category/status gave way to their vocabularies. A dormant
  // table would be a second place a reader could believe the answer lives.
  await withPg(async (c) => {
    const table = await c.query(`SELECT to_regclass('yucer_pipeline.deal_type') AS reg`);
    assert.equal(table.rows[0].reg, null, "deal_type must be dropped, not left dormant");

    const column = await c.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'yucer_pipeline' AND table_name = 'opportunity'
          AND column_name = 'deal_type_id'`,
    );
    assert.equal(column.rowCount, 0, "opportunity.deal_type_id must be dropped");
  });
});

// --- The shipped rows, verbatim ---------------------------------------------------

test("incr/0067's own seed matches DEFAULT_CONTRACT_TYPES exactly - the two cannot disagree", { skip }, async () => {
  await withPg(async (c) => {
    for (const [i, d] of DEFAULT_CONTRACT_TYPES.entries()) {
      await insertContractType(c, d.contractTypeCode, d.name, i + 1);
    }
    const { rows } = await c.query(
      `SELECT contract_type_code, name FROM yucer_pipeline.contract_type
        WHERE workspace_id = $1 ORDER BY sort_order`,
      [WS],
    );
    assert.deepEqual(
      rows.map((r) => ({ contractTypeCode: r.contract_type_code, name: r.name })),
      DEFAULT_CONTRACT_TYPES.map((d) => ({ contractTypeCode: d.contractTypeCode, name: d.name })),
    );
  });
});

test("incr/0067's own seed matches DEFAULT_BUSINESS_FORMS exactly", { skip }, async () => {
  await withPg(async (c) => {
    for (const [i, b] of DEFAULT_BUSINESS_FORMS.entries()) {
      await insertBusinessForm(c, b.businessFormCode, b.name, i + 1);
    }
    const { rows } = await c.query(
      `SELECT business_form_code, name FROM yucer_pipeline.business_form
        WHERE workspace_id = $1 ORDER BY sort_order`,
      [WS],
    );
    assert.deepEqual(
      rows.map((r) => ({ businessFormCode: r.business_form_code, name: r.name })),
      DEFAULT_BUSINESS_FORMS.map((b) => ({ businessFormCode: b.businessFormCode, name: b.name })),
    );
  });
});

// --- One code per workspace, per axis ---------------------------------------------

test("one code per workspace on each axis - the same code twice is a state with no meaning", { skip }, async () => {
  await withPg(async (c) => {
    await insertContractType(c, "new_logo", "新签");
    await refuses(c, () => insertContractType(c, "new_logo", "different"), /uidx_contract_type_code/);

    await insertBusinessForm(c, "custom_project", "项目定制类");
    await refuses(
      c,
      () => insertBusinessForm(c, "custom_project", "different"),
      /uidx_business_form_code/,
    );
  });
});

// --- The two FKs ------------------------------------------------------------------

test("a deal may carry either axis, both, or neither", { skip }, async () => {
  // THE WHOLE POINT OF THE SPLIT, at the database level: the old single column
  // could not say "a renewal, of something we have not classified yet".
  await withPg(async (c) => {
    await seedAccount(c);
    await seedStage(c);
    await insertContractType(c, "renewal", "续签");
    await insertBusinessForm(c, "consulting", "咨询服务类");
    const ct = (
      await c.query(
        `SELECT id FROM yucer_pipeline.contract_type WHERE workspace_id = $1 AND contract_type_code = 'renewal'`,
        [WS],
      )
    ).rows[0].id;
    const bf = (
      await c.query(
        `SELECT id FROM yucer_pipeline.business_form WHERE workspace_id = $1 AND business_form_code = 'consulting'`,
        [WS],
      )
    ).rows[0].id;

    const both = await c.query(
      `INSERT INTO yucer_pipeline.opportunity
         (workspace_id, opportunity_no, name, account_id, owner_sub, requirement,
          contract_type_id, business_form_id)
       VALUES ($1, 'OPP-AX-1', 'Both', $2, 'usr_db', 'fixture requirement', $3, $4)`,
      [WS, ACC, ct, bf],
    );
    assert.equal(both.rowCount, 1);

    const oneAxis = await c.query(
      `INSERT INTO yucer_pipeline.opportunity
         (workspace_id, opportunity_no, name, account_id, owner_sub, requirement, contract_type_id)
       VALUES ($1, 'OPP-AX-2', 'Contract type only', $2, 'usr_db', 'fixture requirement', $3)`,
      [WS, ACC, ct],
    );
    assert.equal(oneAxis.rowCount, 1, "a deal may know one axis and not the other");

    const neither = await c.query(
      `INSERT INTO yucer_pipeline.opportunity
         (workspace_id, opportunity_no, name, account_id, owner_sub, requirement)
       VALUES ($1, 'OPP-AX-3', 'Unclassified', $2, 'usr_db', 'fixture requirement')`,
      [WS, ACC],
    );
    assert.equal(neither.rowCount, 1);
  });
});

test("both columns reject a made-up uuid", { skip }, async () => {
  await withPg(async (c) => {
    await seedAccount(c);
    await seedStage(c);
    await refuses(
      c,
      () =>
        c.query(
          `INSERT INTO yucer_pipeline.opportunity
             (workspace_id, opportunity_no, name, account_id, owner_sub, requirement, contract_type_id)
           VALUES ($1, 'OPP-AX-4', 'Bad', $2, 'usr_db', 'fixture requirement', gen_random_uuid())`,
          [WS, ACC],
        ),
      /fk_opportunity_contract_type/,
    );
    await refuses(
      c,
      () =>
        c.query(
          `INSERT INTO yucer_pipeline.opportunity
             (workspace_id, opportunity_no, name, account_id, owner_sub, requirement, business_form_id)
           VALUES ($1, 'OPP-AX-5', 'Bad', $2, 'usr_db', 'fixture requirement', gen_random_uuid())`,
          [WS, ACC],
        ),
      /fk_opportunity_business_form/,
    );
  });
});

test("both FKs check only that the id exists, not which workspace it belongs to - the known shape deal_type_id had", { skip }, async () => {
  // DOCUMENTING A KNOWN GAP CARRIED FORWARD, not asserting protection that
  // does not exist. Both are surrogate uuid FKs, exactly as deal_type_id and
  // account.industry_id are: a row from another workspace's catalog satisfies
  // them. The application layer is what actually prevents it - every list and
  // upsert verb is scoped by workspaceId, so nothing in the product ever
  // OFFERS a foreign id to pick from.
  const OTHER_WS = "ffffffff-0000-0000-0000-0000000067ee";
  await withPg(async (c) => {
    await seedAccount(c);
    await seedStage(c);
    await c.query(
      `INSERT INTO yucer_pipeline.contract_type (workspace_id, contract_type_code, name, sort_order)
       VALUES ($1, 'new_logo', '新签', 1)`,
      [OTHER_WS],
    );
    const foreign = (
      await c.query(`SELECT id FROM yucer_pipeline.contract_type WHERE workspace_id = $1`, [OTHER_WS])
    ).rows[0].id;

    const written = await c.query(
      `INSERT INTO yucer_pipeline.opportunity
         (workspace_id, opportunity_no, name, account_id, owner_sub, requirement, contract_type_id)
       VALUES ($1, 'OPP-AX-6', 'Deal', $2, 'usr_db', 'fixture requirement', $3)`,
      [WS, ACC, foreign],
    );
    assert.equal(written.rowCount, 1, "the FK does not refuse a foreign workspace's id");
  });
});

// --- ON DELETE RESTRICT -------------------------------------------------------------

test("neither vocabulary row can be deleted while an opportunity still references it", { skip }, async () => {
  await withPg(async (c) => {
    await seedAccount(c);
    await seedStage(c);
    await insertContractType(c, "new_logo", "新签");
    await insertBusinessForm(c, "custom_project", "项目定制类");
    const ct = (
      await c.query(`SELECT id FROM yucer_pipeline.contract_type WHERE workspace_id = $1`, [WS])
    ).rows[0].id;
    const bf = (
      await c.query(`SELECT id FROM yucer_pipeline.business_form WHERE workspace_id = $1`, [WS])
    ).rows[0].id;
    await c.query(
      `INSERT INTO yucer_pipeline.opportunity
         (workspace_id, opportunity_no, name, account_id, owner_sub, requirement,
          contract_type_id, business_form_id)
       VALUES ($1, 'OPP-AX-7', 'Deal', $2, 'usr_db', 'fixture requirement', $3, $4)`,
      [WS, ACC, ct, bf],
    );
    await refuses(
      c,
      () => c.query(`DELETE FROM yucer_pipeline.contract_type WHERE id = $1`, [ct]),
      /fk_opportunity_contract_type/,
    );
    await refuses(
      c,
      () => c.query(`DELETE FROM yucer_pipeline.business_form WHERE id = $1`, [bf]),
      /fk_opportunity_business_form/,
    );
  });
});

test("an unused row on either axis can be deleted", { skip }, async () => {
  await withPg(async (c) => {
    await insertContractType(c, "new_logo", "新签");
    await insertBusinessForm(c, "consulting", "咨询服务类");
    assert.equal(
      (
        await c.query(
          `DELETE FROM yucer_pipeline.contract_type WHERE workspace_id = $1 AND contract_type_code = 'new_logo'`,
          [WS],
        )
      ).rowCount,
      1,
    );
    assert.equal(
      (
        await c.query(
          `DELETE FROM yucer_pipeline.business_form WHERE workspace_id = $1 AND business_form_code = 'consulting'`,
          [WS],
        )
      ).rowCount,
      1,
    );
  });
});

// --- stall_days_override, on the axis it moved to ------------------------------------

test("business_form.stall_days_override accepts NULL and 1-365, refuses 0 and 366", { skip }, async () => {
  await withPg(async (c) => {
    await insertBusinessForm(c, "custom_project", "项目定制类");
    const id = (
      await c.query(`SELECT id FROM yucer_pipeline.business_form WHERE workspace_id = $1`, [WS])
    ).rows[0].id;

    for (const value of [null, 1, 365]) {
      const ok = await c.query(
        `UPDATE yucer_pipeline.business_form SET stall_days_override = $2 WHERE id = $1`,
        [id, value],
      );
      assert.equal(ok.rowCount, 1, `${value} must be accepted`);
    }

    for (const bad of [0, 366]) {
      await refuses(
        c,
        () =>
          c.query(`UPDATE yucer_pipeline.business_form SET stall_days_override = $2 WHERE id = $1`, [
            id,
            bad,
          ]),
        /chk_business_form_stall_override/,
      );
    }
  });
});

test("contract_type has no stall column at all - the override lives on one axis only", { skip }, async () => {
  await withPg(async (c) => {
    const { rowCount } = await c.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'yucer_pipeline' AND table_name = 'contract_type'
          AND column_name = 'stall_days_override'`,
    );
    assert.equal(rowCount, 0);
  });
});

// --- Grants ---------------------------------------------------------------------------

test("the service role may write name/order (and the stall override on business_form), never an anchor", { skip }, async () => {
  await withPg(async (c) => {
    const col = async (table: string, name: string) =>
      (
        await c.query(
          `SELECT has_column_privilege('yucer_svc', $1, $2, 'UPDATE') AS ok`,
          [`yucer_pipeline.${table}`, name],
        )
      ).rows[0].ok;

    for (const name of ["name", "sort_order", "updated_at"]) {
      assert.equal(await col("contract_type", name), true, `contract_type.${name} must be writable`);
      assert.equal(await col("business_form", name), true, `business_form.${name} must be writable`);
    }
    assert.equal(await col("business_form", "stall_days_override"), true);

    assert.equal(await col("contract_type", "contract_type_code"), false, "the anchor must not be writable");
    assert.equal(await col("business_form", "business_form_code"), false, "the anchor must not be writable");
    assert.equal(await col("contract_type", "workspace_id"), false);
    assert.equal(await col("business_form", "workspace_id"), false);
  });
});

test("both of the opportunity's own axis columns are writable by the service role", { skip }, async () => {
  await withPg(async (c) => {
    for (const name of ["contract_type_id", "business_form_id"]) {
      const { rows } = await c.query(
        `SELECT has_column_privilege('yucer_svc', 'yucer_pipeline.opportunity', $1, 'UPDATE') AS ok`,
        [name],
      );
      assert.equal(rows[0].ok, true, `opportunity.${name} must be writable`);
    }
  });
});
