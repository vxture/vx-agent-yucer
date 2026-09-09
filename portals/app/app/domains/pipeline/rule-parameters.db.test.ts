import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { DEFAULT_FORECAST_THRESHOLDS } from "./lib/forecast-rule";
import { DEFAULT_AGEING_CUTOFFS } from "../delivery/lib/collection-stats";

// incr/0041 + 0042 - the two rule-parameter rows, against a real Postgres.
//
// WHAT THIS FILE IS FOR. Both increments make an argument that only the
// database can keep: a workspace may pick its own numbers, and there are
// numbers no workspace may pick. Bands that cross, a stall clock of zero, an
// ageing policy whose cutoffs run backwards - each of those would produce a
// screen that is wrong rather than a screen that errors, and each is a CHECK
// here and nowhere else. The TypeScript rules say the same things first; this
// proves the floor is real when something gets past them.
//
// ONE FILE FOR TWO TABLES because they are one decision taken twice, and a
// reader comparing them learns more than two files would tell them apart.
//
// SELF-SKIPPING without DATABASE_URL, like every *.db.test.ts.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "eeeeeeee-0000-0000-0000-000000000041";

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

// --- incr/0041, 预测阈值 -------------------------------------------------------

test("a workspace's thresholds default to the ones the build ships", { skip }, async () => {
  // TWO COPIES OF THREE NUMBERS - the column DEFAULTs and
  // DEFAULT_FORECAST_THRESHOLDS - and this is what keeps them one list. A row
  // inserted with no values is what a fresh workspace gets, and the rule falls
  // back to the constant when there is no row at all; if those disagreed, the
  // same workspace would forecast differently before and after its first save.
  await withPg(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO yucer_pipeline.forecast_threshold (workspace_id) VALUES ($1)
       RETURNING commit_probability, best_case_probability, stall_days`,
      [WS],
    );
    assert.deepEqual(
      {
        commitAt: rows[0].commit_probability,
        bestCaseAt: rows[0].best_case_probability,
        stallDays: rows[0].stall_days,
      },
      DEFAULT_FORECAST_THRESHOLDS,
    );
  });
});

test("bands that cross are refused by the database, not just by the rule", { skip }, async () => {
  await withPg(async (c) => {
    const set = (commit: number, best: number) =>
      c.query(
        `INSERT INTO yucer_pipeline.forecast_threshold
           (workspace_id, commit_probability, best_case_probability)
         VALUES ($1, $2, $3)`,
        [WS, commit, best],
      );
    // Equal is as broken as inverted: every deal would land in whichever branch
    // the code tested first, and the page would look like it was working.
    await refuses(c, () => set(60, 60), /chk_forecast_threshold_ordered/);
    await refuses(c, () => set(40, 60), /chk_forecast_threshold_ordered/);
    await refuses(c, () => set(101, 50), /chk_forecast_threshold_commit/);
    const ok = await set(90, 40);
    assert.equal(ok.rowCount, 1);
  });
});

test("a stall clock cannot be turned off by setting it to nothing", { skip }, async () => {
  await withPg(async (c) => {
    const stall = (days: number) =>
      c.query(
        `INSERT INTO yucer_pipeline.forecast_threshold (workspace_id, stall_days) VALUES ($1, $2)`,
        [WS, days],
      );
    // Zero caps every deal on the day it moves; ten years never fires. Both are
    // ways of disabling the rule while looking like a setting.
    await refuses(c, () => stall(0), /chk_forecast_threshold_stall/);
    await refuses(c, () => stall(3650), /chk_forecast_threshold_stall/);
    assert.equal((await stall(90)).rowCount, 1);
  });
});

test("one workspace has one set of thresholds", { skip }, async () => {
  await withPg(async (c) => {
    await c.query(`INSERT INTO yucer_pipeline.forecast_threshold (workspace_id) VALUES ($1)`, [WS]);
    await refuses(
      c,
      () => c.query(`INSERT INTO yucer_pipeline.forecast_threshold (workspace_id) VALUES ($1)`, [WS]),
      /forecast_threshold_pkey/,
      "two rows of thresholds for one workspace is a state with no meaning",
    );
  });
});

// --- incr/0042, 账龄分档 -------------------------------------------------------

test("a workspace's ageing cutoffs default to the ones the build ships", { skip }, async () => {
  await withPg(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO yucer_delivery.ageing_policy (workspace_id) VALUES ($1) RETURNING late_cutoffs`,
      [WS],
    );
    assert.deepEqual(rows[0].late_cutoffs.map(Number), [...DEFAULT_AGEING_CUTOFFS]);
  });
});

test("cutoffs that do not rise are refused by the database", { skip }, async () => {
  await withPg(async (c) => {
    const set = (cutoffs: number[]) =>
      c.query(
        `INSERT INTO yucer_delivery.ageing_policy (workspace_id, late_cutoffs) VALUES ($1, $2)`,
        [WS, cutoffs],
      );
    await refuses(c, () => set([60, 30]), /chk_ageing_policy_ascending/);
    await refuses(c, () => set([30, 30]), /chk_ageing_policy_ascending/);
    // The written-out ascending CHECK has to hold at every length it covers,
    // which is the thing about writing one out that is worth testing.
    await refuses(c, () => set([10, 20, 30, 25]), /chk_ageing_policy_ascending/);
    await refuses(c, () => set([]), /chk_ageing_policy_size/);
    await refuses(c, () => set([10, 20, 30, 40, 50, 60]), /chk_ageing_policy_size/);
    await refuses(c, () => set([0, 30]), /chk_ageing_policy_positive/);
    assert.equal((await set([15, 45, 90, 180, 365])).rowCount, 1, "five is allowed");
  });
});

// --- both: the grants ---------------------------------------------------------

test("the service role may set the numbers and not re-key the row", { skip }, async () => {
  // workspace_id IS the identity of both rows. A service role that could write
  // it could move one workspace's forecast policy onto another's.
  await withPg(async (c) => {
    const col = async (table: string, name: string) =>
      (
        await c.query(`SELECT has_column_privilege('yucer_svc', $1, $2, 'UPDATE') AS ok`, [
          table,
          name,
        ])
      ).rows[0].ok;

    for (const [table, writable] of [
      ["yucer_pipeline.forecast_threshold", ["commit_probability", "best_case_probability", "stall_days"]],
      ["yucer_delivery.ageing_policy", ["late_cutoffs"]],
    ] as const) {
      for (const name of writable) {
        assert.equal(await col(table, name), true, `${table}.${name} must be writable`);
      }
      assert.equal(await col(table, "workspace_id"), false, `${table}.workspace_id must not be`);
      // NO DELETE, on either. "Reset to ours" is an update back to the
      // defaults; a missing row would send the rule back to the build, which
      // is the coupling both increments remove.
      assert.equal(
        (
          await c.query(`SELECT has_table_privilege('yucer_svc', $1, 'DELETE') AS ok`, [table])
        ).rows[0].ok,
        false,
        `${table} must not be deletable`,
      );
    }
  });
});
