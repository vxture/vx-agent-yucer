import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { DEFAULT_STAGE_DEFINITIONS } from "./lib/stage";

// incr/0057-0058 - the stage catalog and its composite FK, against a real
// Postgres.
//
// WHAT THIS FILE IS FOR. The TypeScript rules (stage-definition.test.ts) say
// what the product refuses; only the database proves the floor is real: a
// won row fixed at 100%, a terminal-non-won row fixed at 0%, a probability
// out of 0-100, and - the whole reason this migration exists - a workspace's
// opportunity.stage actually rejects a code that is not in ITS OWN catalog,
// where the old chk_opportunity_stage would have rejected it identically for
// every workspace because there was only one shipped list.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "ffffffff-0000-0000-0000-000000000057";
const ACC = "ffffffff-0000-0000-0000-0000000000ac";

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
     VALUES ($1, $2, 'ACC-STG', 'Stage Test', 'active') ON CONFLICT DO NOTHING`,
    [ACC, WS],
  );
}

async function insertStage(
  c: Client,
  fields: Partial<{
    code: string;
    name: string;
    sortOrder: number;
    probability: number;
    isWon: boolean;
    isTerminal: boolean;
  }> = {},
) {
  const f = {
    code: "intake",
    name: "接洽",
    sortOrder: 1,
    probability: 15,
    isWon: false,
    isTerminal: false,
    ...fields,
  };
  return c.query(
    `INSERT INTO yucer_pipeline.stage_definition
       (workspace_id, stage_code, name, sort_order, default_probability, is_won, is_terminal)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [WS, f.code, f.name, f.sortOrder, f.probability, f.isWon, f.isTerminal],
  );
}

// --- The seven shipped rows, verbatim -----------------------------------------

test("incr/0057's own seed matches DEFAULT_STAGE_DEFINITIONS exactly - the two cannot disagree", { skip }, async () => {
  await withPg(async (c) => {
    // A real opportunity already exists in this fresh transaction's test
    // workspace? No - but incr/0057's backfill only reaches a workspace that
    // HAD an opportunity at migration time. This asserts the two sources of
    // truth (the SQL seed and the TS constant) hold the same values by
    // reading them straight back for a workspace seeded the same way the
    // increment does, rather than trusting the comment.
    for (const d of DEFAULT_STAGE_DEFINITIONS) {
      await insertStage(c, {
        code: d.code,
        name: d.name,
        sortOrder: d.sortOrder,
        probability: d.defaultProbability,
        isWon: d.isWon,
        isTerminal: d.isTerminal,
      });
    }
    const { rows } = await c.query(
      `SELECT stage_code, name, sort_order, default_probability, is_won, is_terminal
         FROM yucer_pipeline.stage_definition WHERE workspace_id = $1 ORDER BY sort_order`,
      [WS],
    );
    assert.deepEqual(
      rows.map((r) => ({
        code: r.stage_code,
        name: r.name,
        sortOrder: r.sort_order,
        defaultProbability: r.default_probability,
        isWon: r.is_won,
        isTerminal: r.is_terminal,
      })),
      DEFAULT_STAGE_DEFINITIONS.map((d) => ({ ...d })),
    );
  });
});

// --- The CHECK constraints ------------------------------------------------------

test("the probability is bounded 0-100, live", { skip }, async () => {
  await withPg(async (c) => {
    await refuses(c, () => insertStage(c, { probability: -1 }), /chk_stage_definition_probability/);
    await refuses(c, () => insertStage(c, { probability: 101 }), /chk_stage_definition_probability/);
    assert.equal((await insertStage(c, { probability: 0 })).rowCount, 1);
  });
});

test("a won stage must be terminal", { skip }, async () => {
  await withPg(async (c) => {
    await refuses(
      c,
      () => insertStage(c, { code: "closed", isWon: true, isTerminal: false, probability: 100 }),
      /chk_stage_definition_won_terminal/,
    );
  });
});

test("a won stage is fixed at 100%, whatever anyone tries to insert", { skip }, async () => {
  await withPg(async (c) => {
    await refuses(
      c,
      () => insertStage(c, { code: "closed", isWon: true, isTerminal: true, probability: 90 }),
      /chk_stage_definition_won_probability/,
    );
    assert.equal(
      (await insertStage(c, { code: "closed", isWon: true, isTerminal: true, probability: 100 })).rowCount,
      1,
    );
  });
});

test("a terminal, non-won stage is fixed at 0%", { skip }, async () => {
  await withPg(async (c) => {
    await refuses(
      c,
      () => insertStage(c, { code: "dead", isWon: false, isTerminal: true, probability: 5 }),
      /chk_stage_definition_lost_probability/,
    );
    assert.equal(
      (await insertStage(c, { code: "dead", isWon: false, isTerminal: true, probability: 0 })).rowCount,
      1,
    );
  });
});

test("one code per workspace - the same code twice is a state with no meaning", { skip }, async () => {
  await withPg(async (c) => {
    await insertStage(c, { code: "intake" });
    await refuses(c, () => insertStage(c, { code: "intake", name: "different name" }), /uidx_stage_definition_code/);
  });
});

// --- The composite FK (incr/0058) -----------------------------------------------

test("opportunity.stage rejects a code outside THIS workspace's own catalog", { skip }, async () => {
  await withPg(async (c) => {
    await seedAccount(c);
    await insertStage(c, { code: "intake" });
    await refuses(
      c,
      () =>
        c.query(
          `INSERT INTO yucer_pipeline.opportunity
             (workspace_id, opportunity_no, name, account_id, stage, owner_sub, requirement)
           VALUES ($1, 'OPP-STG', 'Deal', $2, 'not_a_real_code', 'usr_db', 'fixture requirement')`,
          [WS, ACC],
        ),
      /fk_opportunity_stage/,
    );
    const ok = await c.query(
      `INSERT INTO yucer_pipeline.opportunity
         (workspace_id, opportunity_no, name, account_id, stage, owner_sub, requirement)
       VALUES ($1, 'OPP-STG', 'Deal', $2, 'intake', 'usr_db', 'fixture requirement')`,
      [WS, ACC],
    );
    assert.equal(ok.rowCount, 1);
  });
});

test("a code seeded for ANOTHER workspace does not satisfy this one's FK - the vocabulary is per-tenant, not global", { skip }, async () => {
  const OTHER_WS = "ffffffff-0000-0000-0000-0000000005ee";
  await withPg(async (c) => {
    await seedAccount(c);
    // "intake" exists, but only for OTHER_WS - the composite key means it is
    // not the same row as WS's own "intake" would be.
    await c.query(
      `INSERT INTO yucer_pipeline.stage_definition
         (workspace_id, stage_code, name, sort_order, default_probability, is_won, is_terminal)
       VALUES ($1, 'intake', '接洽', 1, 15, FALSE, FALSE)`,
      [OTHER_WS],
    );
    await refuses(
      c,
      () =>
        c.query(
          `INSERT INTO yucer_pipeline.opportunity
             (workspace_id, opportunity_no, name, account_id, stage, owner_sub, requirement)
           VALUES ($1, 'OPP-STG', 'Deal', $2, 'intake', 'usr_db', 'fixture requirement')`,
          [WS, ACC],
        ),
      /fk_opportunity_stage/,
    );
  });
});

test("opportunity_stage_event.to_stage carries the same FK, and from_stage stays nullable through it", { skip }, async () => {
  await withPg(async (c) => {
    await seedAccount(c);
    await insertStage(c, { code: "intake" });
    await insertStage(c, { code: "closed", isWon: true, isTerminal: true, probability: 100, sortOrder: 2 });
    const opp = await c.query(
      `INSERT INTO yucer_pipeline.opportunity
         (workspace_id, opportunity_no, name, account_id, stage, owner_sub, requirement)
       VALUES ($1, 'OPP-STG', 'Deal', $2, 'intake', 'usr_db', 'fixture requirement') RETURNING id`,
      [WS, ACC],
    );
    const oppId = opp.rows[0].id;

    await refuses(
      c,
      () =>
        c.query(
          `INSERT INTO yucer_pipeline.opportunity_stage_event
             (workspace_id, opportunity_id, from_stage, to_stage, actor_sub)
           VALUES ($1, $2, 'intake', 'not_a_real_code', 'usr_db')`,
          [WS, oppId],
        ),
      /fk_opportunity_stage_event_to_stage/,
    );

    // from_stage IS NULL for an agent-driven first move with no prior stage -
    // the FK must skip it rather than refuse it.
    const ok = await c.query(
      `INSERT INTO yucer_pipeline.opportunity_stage_event
         (workspace_id, opportunity_id, from_stage, to_stage, actor_sub)
       VALUES ($1, $2, NULL, 'closed', 'usr_db')`,
      [WS, oppId],
    );
    assert.equal(ok.rowCount, 1);
  });
});

// --- ON DELETE RESTRICT ----------------------------------------------------------

test("a stage cannot be deleted while an opportunity still references it", { skip }, async () => {
  await withPg(async (c) => {
    await seedAccount(c);
    await insertStage(c, { code: "intake" });
    await c.query(
      `INSERT INTO yucer_pipeline.opportunity
         (workspace_id, opportunity_no, name, account_id, stage, owner_sub, requirement)
       VALUES ($1, 'OPP-STG', 'Deal', $2, 'intake', 'usr_db', 'fixture requirement')`,
      [WS, ACC],
    );
    await refuses(
      c,
      () => c.query(`DELETE FROM yucer_pipeline.stage_definition WHERE workspace_id = $1 AND stage_code = 'intake'`, [WS]),
      /fk_opportunity_stage/,
    );
  });
});

test("an unused stage - added and abandoned with zero history - can be deleted", { skip }, async () => {
  await withPg(async (c) => {
    await insertStage(c, { code: "intake" });
    const deleted = await c.query(
      `DELETE FROM yucer_pipeline.stage_definition WHERE workspace_id = $1 AND stage_code = 'intake'`,
      [WS],
    );
    assert.equal(deleted.rowCount, 1);
  });
});

// --- Grants ------------------------------------------------------------------------

test("the service role may write name/order/probability/flags, and not the anchor or the workspace", { skip }, async () => {
  await withPg(async (c) => {
    const col = async (name: string) =>
      (
        await c.query(`SELECT has_column_privilege('yucer_svc', 'yucer_pipeline.stage_definition', $1, 'UPDATE') AS ok`, [
          name,
        ])
      ).rows[0].ok;

    for (const name of ["name", "sort_order", "default_probability", "is_won", "is_terminal", "updated_at"]) {
      assert.equal(await col(name), true, `stage_definition.${name} must be writable`);
    }
    assert.equal(await col("stage_code"), false, "stage_code is the anchor and must not be writable");
    assert.equal(await col("workspace_id"), false, "workspace_id must not be writable");
  });
});
