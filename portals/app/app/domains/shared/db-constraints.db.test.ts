import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ddlTables } from "../../../../../scripts/guardrails/check-data-architecture.mjs";

// The DDL, tested against a real Postgres.
//
// Everything else in this suite runs against the in-memory adapters, which
// cannot model a constraint: a UNIQUE index, a CHECK, a REVOKE and a NULL
// comparison are all properties of the database and of nothing else. So the
// defects that live there were invisible to 780-odd passing tests - including
// one where a constraint the design leans on does not hold at all.
//
// SELF-SKIPPING. With no DATABASE_URL these report as skipped rather than
// failing, so `pnpm test` stays runnable on a laptop with no Postgres. The CI
// lane (ci.yml, job `db-contract`) sets it, applies the real DDL in the same
// order db-init.yml does, and runs them for real.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

/** One connection per test, closed on the way out even when the test throws. */
async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const WS = "11111111-1111-1111-1111-111111111111";

// --- The lane itself works ---------------------------------------------------

/**
 * Every table the DDL declares: baseline plus every increment, in the order
 * db-init.yml applies them. Parsed from the files, not written down here.
 *
 * These two tests used to carry the literals `8` and `34` and both had been
 * wrong for several increments. The schema list never gained yucer_field or
 * yucer_catalog, so the count query did not even look at the tables incr/0004
 * and incr/0007 added, and three more had arrived inside the eight schemas it
 * did look at. Nothing said so, because the only place the truth was written
 * was a number a person had to remember to bump.
 *
 * Deriving it also changes what a failure tells you. `37 !== 34` says a number
 * moved; a set difference names the table.
 */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

function declaredTables(): Set<string> {
  const incr = join(REPO, "deploy/database/ddl/incr");
  let sql = readFileSync(join(REPO, "deploy/database/ddl/00_baseline.sql"), "utf8");
  for (const f of readdirSync(incr)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    sql += "\n" + readFileSync(join(incr, f), "utf8");
  }
  return ddlTables(sql) as Set<string>;
}

function declaredSchemas(tables: Set<string>): string[] {
  return [...new Set([...tables].map((t) => t.split(".")[0]))].sort();
}

test("the DDL applied: every schema the DDL declares exists", { skip }, async () => {
  const want = declaredSchemas(declaredTables());
  await withDb(async (c) => {
    const { rows } = await c.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname = ANY($1) ORDER BY 1`,
      [want],
    );
    assert.deepEqual(
      rows.map((r) => r.nspname),
      want,
    );
  });
});

test("the built database holds exactly the tables the DDL declares", { skip }, async () => {
  // The offline guardrail proves DDL == prisma by parsing SQL text. This is the
  // third reference point: what a real db-init actually built.
  const want = declaredTables();
  await withDb(async (c) => {
    const { rows } = await c.query<{ t: string }>(
      `SELECT table_schema || '.' || table_name AS t
         FROM information_schema.tables
        WHERE table_schema = ANY($1) AND table_type = 'BASE TABLE'`,
      [declaredSchemas(want)],
    );
    const built = new Set(rows.map((r) => r.t));
    assert.deepEqual(
      [...want].filter((t) => !built.has(t)).sort(),
      [],
      "declared in the DDL but not built",
    );
    assert.deepEqual(
      [...built].filter((t) => !want.has(t)).sort(),
      [],
      "built but not declared in the DDL",
    );
  });
});

test("the service role exists and holds no blanket UPDATE", { skip }, async () => {
  // 98_column_locks.sql revokes UPDATE and re-grants it column by column. If the
  // lock file had not applied, a table-level UPDATE privilege would remain and
  // every column-lock guarantee in the codebase would be decoration.
  await withDb(async (c) => {
    const { rows: role } = await c.query(`SELECT 1 FROM pg_roles WHERE rolname = 'yucer_svc'`);
    assert.equal(role.length, 1, "yucer_svc was not created");

    const { rows } = await c.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.table_privileges
       WHERE grantee = 'yucer_svc' AND privilege_type = 'UPDATE'
         AND table_schema LIKE 'yucer_%'`,
    );
    assert.deepEqual(rows, [], "a table-level UPDATE grant survives the column locks");
  });
});

test("append-only tables have no UPDATE at any level", { skip }, async () => {
  // The whole "a correction is a new row" design rests on this being true in the
  // database rather than observed by convention in the adapters.
  await withDb(async (c) => {
    for (const [schema, table] of [
      ["yucer_core", "account_relation"],
      ["yucer_pipeline", "opportunity_stage_event"],
      ["yucer_pipeline", "forecast_snapshot"],
      ["yucer_agent", "agent_message"],
    ]) {
      const { rows } = await c.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.column_privileges
         WHERE grantee = 'yucer_svc' AND privilege_type = 'UPDATE'
           AND table_schema = $1 AND table_name = $2`,
        [schema, table],
      );
      assert.deepEqual(rows, [], `${schema}.${table} has an UPDATE grant but is append-only`);
    }
  });
});

// --- Constraints the design leans on ---------------------------------------

test("the CHECK constraints are live, not decoration", { skip }, async () => {
  // Proves the column CHECKs actually apply, which is what makes the TS unions
  // a convenience rather than the only thing standing between a typo and the
  // table.
  //
  // sales_target is chosen deliberately: its only FKs are nullable, so the
  // insert cannot trip a foreign key first and this does not depend on the
  // order Postgres evaluates constraints in.
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      // Each expected failure gets its own SAVEPOINT. In Postgres the FIRST
      // error aborts the whole transaction, and every later statement then
      // fails with "current transaction is aborted" instead of the constraint
      // that would have caught it - so without this, only the first assertion
      // means anything and the rest silently assert the same generic error.
      const rejectsWith = async (
        scope: string,
        metric: string,
        amount: number,
        expected: RegExp,
      ) => {
        await c.query("SAVEPOINT probe");
        await assert.rejects(
          () =>
            c.query(
              `INSERT INTO yucer_gtm.sales_target
                 (workspace_id, period, scope_type, metric, target_amount, currency)
               VALUES ($1, '2026Q3', $2, $3, $4, 'CNY')`,
              [WS, scope, metric, amount],
            ),
          expected,
        );
        await c.query("ROLLBACK TO SAVEPOINT probe");
      };

      await rejectsWith("everyone", "revenue", 1, /chk_sales_target_scope/);
      await rejectsWith("workspace", "vibes", 1, /chk_sales_target_metric/);
      // A negative quota is not a small quota.
      await rejectsWith("workspace", "revenue", -1, /chk_sales_target_amount/);
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

test("a scope tuple identifies at most one sales target, NULLs included", { skip }, async () => {
  // uidx_sales_target_scope is documented as making the scope tuple a target's
  // IDENTITY. Postgres UNIQUE treats NULLs as DISTINCT by default, and a
  // WORKSPACE-scope target has NULL territory_id AND NULL owner_sub - so the
  // constraint was inert for exactly the most important case and the same
  // workspace target could be inserted any number of times.
  //
  // incr/0003 rebuilds both indexes as NULLS NOT DISTINCT.
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      const insert = () =>
        c.query(
          `INSERT INTO yucer_gtm.sales_target
             (workspace_id, period, scope_type, territory_id, owner_sub, metric, target_amount, currency)
           VALUES ($1, '2026Q3', 'workspace', NULL, NULL, 'revenue', 1000, 'CNY')`,
          [WS],
        );
      await insert();
      await assert.rejects(insert, /uidx_sales_target_scope/, "the same workspace target twice");
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

test("a scope and instant identify at most one forecast snapshot", { skip }, async () => {
  // Same defect, same fix. Snapshots are append-only and their uniqueness is
  // what makes "one snapshot per scope per instant" true; without it a
  // workspace-scope snapshot could be written twice for the same instant and
  // forecast accuracy would read a number that exists twice.
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      const at = "2026-08-16T00:00:00Z";
      const insert = () =>
        c.query(
          `INSERT INTO yucer_pipeline.forecast_snapshot
             (workspace_id, period, scope_type, territory_id, owner_sub, snapshot_at,
              commit_amount, best_case_amount, pipeline_amount, closed_amount, currency)
           VALUES ($1, '2026Q3', 'workspace', NULL, NULL, $2, 0, 0, 0, 0, 'CNY')`,
          [WS, at],
        );
      await insert();
      await assert.rejects(insert, /uidx_forecast_snapshot_scope_at/, "the same snapshot twice");
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

test("a territory-scope target still collides on its own tuple", { skip }, async () => {
  // The NULLS fix must not weaken the non-NULL case it already handled.
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      const terr = "33333333-3333-3333-3333-333333333333";
      await c.query(
        `INSERT INTO yucer_gtm.territory (id, workspace_id, territory_code, name, owner_sub, status)
         VALUES ($1, $2, 'EAST', 'East', NULL, 'active')`,
        [terr, WS],
      );
      const insert = () =>
        c.query(
          `INSERT INTO yucer_gtm.sales_target
             (workspace_id, period, scope_type, territory_id, owner_sub, metric, target_amount, currency)
           VALUES ($1, '2026Q3', 'territory', $2, NULL, 'revenue', 1000, 'CNY')`,
          [WS, terr],
        );
      await insert();
      await assert.rejects(insert, /uidx_sales_target_scope/);
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

test("two workspaces may hold the same scope tuple", { skip }, async () => {
  // The tuple is scoped BY workspace, so tightening NULL handling must not turn
  // two tenants' identical targets into a collision.
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      const other = "44444444-4444-4444-4444-444444444444";
      for (const ws of [WS, other]) {
        await c.query(
          `INSERT INTO yucer_gtm.sales_target
             (workspace_id, period, scope_type, territory_id, owner_sub, metric, target_amount, currency)
           VALUES ($1, '2026Q3', 'workspace', NULL, NULL, 'revenue', 1000, 'CNY')`,
          [ws],
        );
      }
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

test("one OPEN sweep proposal per commitment; a decided one frees the slot", { skip }, async () => {
  // TD-003's floor (0016). The WHERE clause is load-bearing: rejected must
  // free the slot, or the sweep can never re-ask about a still-broken promise.
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      const insert = () =>
        c.query(
          `INSERT INTO yucer_agent.agent_action
             (workspace_id, action_type, subject_type, subject_id, payload, rationale)
           VALUES ($1, 'chase_overdue_commitment', 'account', '55555555-5555-5555-5555-555555555555',
                   '{"commitmentId":"cm_race"}'::jsonb, 'race probe')`,
          [WS],
        );
      await insert();
      // The violation ABORTS the enclosing transaction (25P02: every later
      // statement is refused until rollback) - so the collision is staged on a
      // savepoint, proven, and rolled back to keep the transaction usable for
      // the second half of the proof. The sibling tests never hit this because
      // each ends at its first violation; this one has to keep going.
      await c.query("SAVEPOINT dup");
      await assert.rejects(insert, /uidx_agent_action_sweep_open/);
      await c.query("ROLLBACK TO SAVEPOINT dup");

      // A human decides the first; the same commitment may then be raised again.
      await c.query(
        `UPDATE yucer_agent.agent_action
            SET status = 'rejected', decided_by_sub = 'usr_test', decided_at = now()
          WHERE workspace_id = $1 AND payload->>'commitmentId' = 'cm_race'`,
        [WS],
      );
      await insert();

      // And a NULL key never collides - other proposal kinds are unconstrained.
      const nul = () =>
        c.query(
          `INSERT INTO yucer_agent.agent_action
             (workspace_id, action_type, subject_type, subject_id, payload, rationale)
           VALUES ($1, 'chase_overdue_commitment', 'account', '55555555-5555-5555-5555-555555555555',
                   '{}'::jsonb, 'null key probe')`,
          [WS],
        );
      await nul();
      await nul();
    } finally {
      await c.query("ROLLBACK");
    }
  });
});
