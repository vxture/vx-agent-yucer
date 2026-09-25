import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

// incr/0090 - 重要度档位与优先级 against a real Postgres. What only the
// database can prove: one code, one rank and one default per axis; a level
// in use cannot be deleted; the anchors (code, subject, rank) are not
// updatable by the service role while the names are; and the three deal
// columns plus account.tier_level_id are writable.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "ffffffff-0000-0000-0000-000000000090";

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

async function refuses(c: Client, run: () => Promise<unknown>, expected: RegExp, why?: string) {
  await c.query("SAVEPOINT probe");
  await assert.rejects(run, expected, why);
  await c.query("ROLLBACK TO SAVEPOINT probe");
}

const level = (c: Client, subject: string, code: string, rank: number, isDefault = false) =>
  c
    .query(
      `INSERT INTO yucer_core.importance_level (workspace_id, subject, level_code, name, rank, is_default, sort_order)
       VALUES ($1, $2, $3, $3, $4::smallint, $5, $6) RETURNING id`,
      [WS, subject, code, rank, isDefault, rank],
    )
    .then((r) => r.rows[0].id as string);

test("one code, one rank and one default per axis; the other axis is separate", { skip }, async () => {
  await withPg(async (c) => {
    await level(c, "opportunity", "core", 1);
    await level(c, "opportunity", "normal", 3, true);
    await refuses(c, () => level(c, "opportunity", "core", 2), /uidx_importance_level_code/);
    await refuses(c, () => level(c, "opportunity", "other", 1), /uidx_importance_level_rank/);
    await refuses(c, () => level(c, "opportunity", "other", 2, true), /uidx_importance_level_default/);
    await refuses(c, () => level(c, "deal", "x", 5), /chk_importance_level_subject/);
    await refuses(c, () => level(c, "opportunity", "zero", 0), /chk_importance_level_rank/);
    // Same code and rank on the customer axis is a different row.
    await level(c, "account", "core", 1);
  });
});

test("a level a rule or a deal points at cannot be deleted", { skip }, async () => {
  await withPg(async (c) => {
    const acc = await level(c, "account", "strategic", 1);
    const opp = await level(c, "opportunity", "core", 1);
    await c.query(
      `INSERT INTO yucer_core.priority_rule (workspace_id, account_level_id, opportunity_level_id, priority) VALUES ($1, $2, $3, 1)`,
      [WS, acc, opp],
    );
    await refuses(c, () => c.query(`DELETE FROM yucer_core.importance_level WHERE id = $1`, [opp]), /foreign key/);
    await refuses(
      c,
      () =>
        c.query(
          `INSERT INTO yucer_core.priority_rule (workspace_id, account_level_id, opportunity_level_id, priority) VALUES ($1, $2, $3, 0)`,
          [WS, opp, acc],
        ),
      /chk_priority_rule_priority/,
    );
  });
});

test("the service role edits names and priorities, never the anchors", { skip }, async () => {
  await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT table_name, column_name FROM information_schema.column_privileges
        WHERE grantee = 'yucer_svc' AND privilege_type = 'UPDATE'
          AND ((table_schema = 'yucer_core' AND table_name IN ('importance_level', 'priority_rule', 'account'))
            OR (table_schema = 'yucer_pipeline' AND table_name = 'opportunity'))`,
    );
    const has = (t: string, col: string) => rows.some((r) => r.table_name === t && r.column_name === col);
    for (const col of ["name", "description", "sort_order", "updated_at"]) assert.ok(has("importance_level", col), col);
    for (const col of ["level_code", "subject", "rank", "is_default", "workspace_id"]) {
      assert.ok(!has("importance_level", col), `${col} is an anchor`);
    }
    assert.ok(has("priority_rule", "priority"));
    assert.ok(!has("priority_rule", "account_level_id"));
    for (const col of ["importance_level_id", "importance_by_sub", "importance_at"]) assert.ok(has("opportunity", col), col);
    assert.ok(has("account", "tier_level_id"));
    assert.ok(has("account", "tier"), "the old column stays writable until every read has moved");
  });
});
