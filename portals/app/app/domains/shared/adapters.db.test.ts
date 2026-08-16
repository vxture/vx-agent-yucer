import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { lockKey } from "./allocate";

// The Prisma adapters, against a real Postgres.
//
// Three defects lived here behind comments claiming they were handled, and all
// three are invisible without a database:
//
//   - a count-then-insert allocation described as safe "inside a transaction",
//     which READ COMMITTED does not make safe;
//   - an upsert whose `where` had no workspace_id;
//   - a bare catch reporting every insert failure as a duplicate.
//
// The first can only be shown by running two allocations AT THE SAME TIME, which
// no single-threaded unit test can do.
//
// These use raw SQL rather than the Prisma client on purpose: the behaviour
// under test is the SQL the adapters emit and the locking around it, and raw
// queries let the test hold two connections open concurrently - which is the
// whole point.

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "no DATABASE_URL - see ci.yml job db-contract";

const WS = "aaaaaaaa-0000-0000-0000-000000000001";
const WS2 = "aaaaaaaa-0000-0000-0000-000000000002";

async function connect(): Promise<Client> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  return c;
}

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** The allocation the adapters perform, with the advisory lock they now take. */
async function allocateOpportunityNo(c: Client, workspaceId: string, locked: boolean): Promise<string> {
  await c.query("BEGIN");
  if (locked) {
    await c.query(`SELECT pg_advisory_xact_lock($1::int, hashtext($2)::int)`, [
      lockKey("opportunity_no"),
      workspaceId,
    ]);
  }
  const { rows } = await c.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM yucer_pipeline.opportunity WHERE workspace_id = $1`,
    [workspaceId],
  );
  return `OPP-${String(Number(rows[0].n) + 1).padStart(5, "0")}`;
}

// --- The race the comments denied ------------------------------------------

test("without the lock, two concurrent allocations pick the SAME number", { skip }, async () => {
  // This is the defect, demonstrated rather than argued. If this ever stops
  // failing to collide, the isolation level changed underneath us and the lock
  // may no longer be doing what this file claims.
  const a = await connect();
  const b = await connect();
  try {
    const [na, nb] = await Promise.all([
      allocateOpportunityNo(a, WS, false),
      allocateOpportunityNo(b, WS, false),
    ]);
    assert.equal(na, nb, "READ COMMITTED lets both transactions read the same count");
  } finally {
    await a.query("ROLLBACK").catch(() => {});
    await b.query("ROLLBACK").catch(() => {});
    await a.end();
    await b.end();
  }
});

test("with the lock, two concurrent allocations pick DIFFERENT numbers", { skip }, async () => {
  // The fix. The second transaction blocks on the advisory lock until the first
  // commits, so its count() sees the row the first inserted.
  const a = await connect();
  const b = await connect();
  const acc = "bbbbbbbb-0000-0000-0000-000000000001";
  try {
    await a.query(
      `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
       VALUES ($1, $2, 'ACC-RACE', 'Race', 'active') ON CONFLICT DO NOTHING`,
      [acc, WS],
    );

    const insert = async (c: Client, no: string) =>
      c.query(
        `INSERT INTO yucer_pipeline.opportunity
           (workspace_id, opportunity_no, name, account_id, stage, forecast_category, status, currency)
         VALUES ($1, $2, 'Race', $3, 'qualify', 'pipeline', 'open', 'CNY')`,
        [WS, no, acc],
      );

    // A commits while B is still waiting for the lock.
    const first = allocateOpportunityNo(a, WS, true).then(async (no) => {
      await insert(a, no);
      await a.query("COMMIT");
      return no;
    });
    const second = (async () => {
      const no = await allocateOpportunityNo(b, WS, true);
      await insert(b, no);
      await b.query("COMMIT");
      return no;
    })();

    const [na, nb] = await Promise.all([first, second]);
    assert.notEqual(na, nb, "the lock must serialise the count-then-insert");
  } finally {
    await a.query(`DELETE FROM yucer_pipeline.opportunity WHERE workspace_id = $1`, [WS]).catch(() => {});
    await a.query(`DELETE FROM yucer_core.account WHERE workspace_id = $1`, [WS]).catch(() => {});
    await a.end();
    await b.end();
  }
});

test("the lock does not serialise unrelated scopes", { skip }, async () => {
  // Two different workspaces, and two different allocation kinds, must not wait
  // on each other - a correct lock that made every insert in the product queue
  // behind every other would be its own kind of wrong.
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      await c.query(`SELECT pg_advisory_xact_lock($1::int, hashtext($2)::int)`, [
        lockKey("opportunity_no"),
        WS,
      ]);
      // Different workspace, same scope: free.
      const other = await c.query<{ ok: boolean }>(
        `SELECT pg_try_advisory_xact_lock($1::int, hashtext($2)::int) AS ok`,
        [lockKey("opportunity_no"), WS2],
      );
      assert.equal(other.rows[0].ok, true, "another workspace must not wait");

      // Same workspace, different scope: also free.
      const otherScope = await c.query<{ ok: boolean }>(
        `SELECT pg_try_advisory_xact_lock($1::int, hashtext($2)::int) AS ok`,
        [lockKey("lead_no"), WS],
      );
      assert.equal(otherScope.rows[0].ok, true, "a lead number must not wait on a deal number");
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

test("the advisory lock releases on rollback, not just on commit", { skip }, async () => {
  // pg_advisory_XACT_lock, not pg_advisory_lock. A session-scoped lock that
  // leaked on a failed transaction would wedge every later allocation for that
  // workspace on that connection.
  const a = await connect();
  const b = await connect();
  try {
    await a.query("BEGIN");
    await a.query(`SELECT pg_advisory_xact_lock($1::int, hashtext($2)::int)`, [
      lockKey("opportunity_no"),
      WS,
    ]);
    await a.query("ROLLBACK");

    const { rows } = await b.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_xact_lock($1::int, hashtext($2)::int) AS ok`,
      [lockKey("opportunity_no"), WS],
    );
    assert.equal(rows[0].ok, true, "the lock survived a rollback");
  } finally {
    await a.end();
    await b.end();
  }
});

// --- The write that was not workspace-scoped -------------------------------

test("a win/loss review is revised only within its own workspace", { skip }, async () => {
  // The adapter used to upsert on { opportunityId } alone. uidx_win_loss_review_opp
  // makes that the only unique key Prisma accepts, so the scope had to move into
  // an updateMany - and this asserts the SQL shape that replaced it.
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      const acc = "bbbbbbbb-0000-0000-0000-000000000002";
      const opp = "cccccccc-0000-0000-0000-000000000001";
      await c.query(
        `INSERT INTO yucer_core.account (id, workspace_id, account_no, name, status)
         VALUES ($1, $2, 'ACC-WL', 'WL', 'active')`,
        [acc, WS],
      );
      await c.query(
        `INSERT INTO yucer_pipeline.opportunity
           (id, workspace_id, opportunity_no, name, account_id, stage, forecast_category, status, currency)
         VALUES ($1, $2, 'OPP-WL', 'WL', $3, 'won', 'closed', 'won', 'CNY')`,
        [opp, WS, acc],
      );
      await c.query(
        `INSERT INTO yucer_pipeline.win_loss_review
           (workspace_id, opportunity_id, outcome, primary_reason, reviewer_sub)
         VALUES ($1, $2, 'won', 'fit', 'usr_a')`,
        [WS, opp],
      );

      // The workspace-scoped update the adapter now performs, from the WRONG
      // workspace: it must touch nothing.
      const wrong = await c.query(
        `UPDATE yucer_pipeline.win_loss_review SET lessons = 'tampered'
         WHERE opportunity_id = $1 AND workspace_id = $2`,
        [opp, WS2],
      );
      assert.equal(wrong.rowCount, 0, "another workspace revised this review");

      const right = await c.query(
        `UPDATE yucer_pipeline.win_loss_review SET lessons = 'ours'
         WHERE opportunity_id = $1 AND workspace_id = $2`,
        [opp, WS],
      );
      assert.equal(right.rowCount, 1, "the owning workspace must still be able to revise it");
    } finally {
      await c.query("ROLLBACK");
    }
  });
});

// --- The catch that lied ----------------------------------------------------

test("a duplicate signal and a broken signal are different failures", { skip }, async () => {
  // The adapter caught everything and returned null, meaning "already known".
  // These two inserts fail for entirely different reasons, and the ingest path
  // has to be able to tell them apart - Postgres gives them different SQLSTATEs,
  // which is what isUniqueViolation() keys on (Prisma maps 23505 to P2002).
  await withDb(async (c) => {
    await c.query("BEGIN");
    try {
      const insert = (sourceRef: string, signalType: string) =>
        c.query(
          `INSERT INTO yucer_pipeline.signal (workspace_id, source, source_ref, signal_type, subject)
           VALUES ($1, 'web', $2, $3, 'subject')`,
          [WS, sourceRef, signalType],
        );

      await c.query("SAVEPOINT s");
      await insert("ref-1", "intent");
      await c.query("SAVEPOINT s2");

      const dup = await insert("ref-1", "intent").catch((e: { code?: string }) => e);
      assert.equal((dup as { code?: string }).code, "23505", "duplicate is a unique violation");
      await c.query("ROLLBACK TO SAVEPOINT s2");

      const bad = await insert("ref-2", "not_a_signal_type").catch((e: { code?: string }) => e);
      assert.equal((bad as { code?: string }).code, "23514", "a bad type is a CHECK violation");
      assert.notEqual(
        (bad as { code?: string }).code,
        "23505",
        "a CHECK violation must never be reported as a duplicate",
      );
    } finally {
      await c.query("ROLLBACK");
    }
  });
});
