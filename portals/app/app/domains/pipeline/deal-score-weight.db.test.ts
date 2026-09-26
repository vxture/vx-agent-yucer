import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { DEFAULT_DEAL_SCORE_WEIGHTS } from "./lib/deal-score";

// incr/0091 reshaped by 0092 - 商机评估's five dimension weights against a real Postgres: the defaults equal
// the build's, the set must add to 100, quiet follows recent, and the service
// role may change the numbers but not re-key the row.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";
const WS = "ffffffff-0000-0000-0000-000000000091";

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

async function refuses(c: Client, sql: string, params: unknown[], expected: RegExp) {
  await c.query("SAVEPOINT probe");
  await assert.rejects(c.query(sql, params), expected);
  await c.query("ROLLBACK TO SAVEPOINT probe");
}

test("a fresh row carries the build's defaults exactly", { skip }, async () => {
  await withPg(async (c) => {
    await c.query(`INSERT INTO yucer_pipeline.deal_score_weight (workspace_id) VALUES ($1)`, [WS]);
    const { rows } = await c.query(`SELECT * FROM yucer_pipeline.deal_score_weight WHERE workspace_id = $1`, [WS]);
    const r = rows[0];
    const d = DEFAULT_DEAL_SCORE_WEIGHTS;
    assert.deepEqual(
      [r.w_value, r.w_consensus, r.w_competition, r.w_engagement, r.w_progress],
      [d.weights.value, d.weights.consensus, d.weights.competition, d.weights.engagement, d.weights.progress],
    );
    assert.deepEqual([r.watch_score, r.recent_days, r.quiet_days], [d.watchScore, d.recentDays, d.quietDays]);
  });
});

test("the weights must add to 100, quiet must follow recent, watch stays inside 1-99", { skip }, async () => {
  await withPg(async (c) => {
    await c.query(`INSERT INTO yucer_pipeline.deal_score_weight (workspace_id) VALUES ($1)`, [WS]);
    const upd = `UPDATE yucer_pipeline.deal_score_weight SET `;
    await refuses(c, upd + `w_value = 30 WHERE workspace_id = $1`, [WS], /chk_deal_score_weight_sum/);
    await refuses(c, upd + `quiet_days = 14 WHERE workspace_id = $1`, [WS], /chk_deal_score_weight_days/);
    await refuses(c, upd + `watch_score = 100 WHERE workspace_id = $1`, [WS], /chk_deal_score_weight_watch/);
    // A move that keeps the sum is fine.
    await c.query(upd + `w_value = 30, w_competition = 0 WHERE workspace_id = $1`, [WS]);
  });
});

test("the service role edits the numbers, never the workspace key, and cannot delete", { skip }, async () => {
  await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT column_name FROM information_schema.column_privileges
        WHERE grantee = 'yucer_svc' AND privilege_type = 'UPDATE'
          AND table_schema = 'yucer_pipeline' AND table_name = 'deal_score_weight'`,
    );
    const cols = new Set(rows.map((r) => r.column_name));
    for (const col of ["w_value", "w_consensus", "w_competition", "w_engagement", "w_progress", "watch_score", "recent_days", "quiet_days"]) {
      assert.ok(cols.has(col), col);
    }
    assert.ok(!cols.has("workspace_id"));
    const del = await c.query(`SELECT has_table_privilege('yucer_svc', 'yucer_pipeline.deal_score_weight', 'DELETE') AS d`);
    assert.equal(del.rows[0].d, false);
  });
});
