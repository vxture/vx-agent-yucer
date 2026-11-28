import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID as id } from "node:crypto";
import { Client } from "pg";
import { emptyContent } from "./plan-model";
import { PrismaSalesPlanStore } from "./plan-prisma-store";
import { PrismaAccountStore } from "../account/prisma-store";
import type { CooperationAssertion } from "../account/lib/cooperation";
import type { PlanActionResult } from "./action-result";
const skip = !process.env.DATABASE_URL;
async function db(run: (c: Client) => Promise<void>) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await run(c);
  } finally {
    await c.end();
  }
}
async function refused(
  c: Client,
  sql: string,
  values: unknown[],
  pattern: RegExp,
) {
  await c.query("SAVEPOINT refused");
  await assert.rejects(c.query(sql, values), pattern);
  await c.query("ROLLBACK TO SAVEPOINT refused");
  await c.query("RELEASE SAVEPOINT refused");
}
async function seed(c: Client) {
  const ws = id(),
    account = id(),
    root = id(),
    revision = id(),
    region = id(),
    action = id(),
    year = new Date().getUTCFullYear();
  await c.query(
    "INSERT INTO yucer_core.account(id,workspace_id,account_no,name) VALUES($1,$2,'ACC-EVIDENCE','Verified account')",
    [account, ws],
  );
  const content = emptyContent(
    year,
    [
      {
        id: region,
        divisionId: id(),
        name: "East",
        code: "E",
        included: true,
        provinces: [],
        reason: "",
        ownerSub: "ops",
      },
    ],
    "CNY",
  );
  content.targets.forEach((t) => (t.target = "1000"));
  content.actions = [
    {
      key: action,
      accountId: account,
      regionId: region,
      targetKey: null,
      objective: "Accept scope",
      ownerSub: "ops",
      due: `${year}-08-01`,
      evidenceRefs: [],
    },
  ];
  content.allocationNote = "Target allocation verified";
  await c.query(
    "INSERT INTO yucer_gtm.sales_plan(id,workspace_id,year) VALUES($1,$2,$3)",
    [root, ws, year],
  );
  await c.query(
    "INSERT INTO yucer_gtm.sales_plan_revision(id,workspace_id,plan_id,content,created_by_sub) VALUES($1,$2,$3,$4,'ops')",
    [revision, ws, root, JSON.stringify(content)],
  );
  await c.query(
    "UPDATE yucer_gtm.sales_plan_revision SET state='sealed',version_no=1,content_hash=$2,sealed_by_sub='ops',sealed_at=now() WHERE id=$1",
    [revision, "a".repeat(64)],
  );
  return { ws, account, root, revision, action, year };
}
test(
  "Postgres: cooperation evidence rejects cross-workspace/future/contradictory states and is append-only",
  { skip },
  async () =>
    db(async (c) => {
      await c.query("BEGIN");
      try {
        const f = await seed(c);
        await c.query("SET LOCAL ROLE yucer_svc");
        const insert =
          "INSERT INTO yucer_core.account_cooperation_history(workspace_id,account_id,state,before_year,evidence,recorded_by,request_key) VALUES($1,$2,'before_year',2020,'Historical ledger','ops',$3)";
        await c.query(insert, [f.ws, f.account, "cooperation-1"]);
        await refused(
          c,
          insert,
          [id(), f.account, "cooperation-2"],
          /cooperation account unavailable/,
        );
        await refused(
          c,
          insert,
          [f.ws, f.account, "cooperation-1"],
          /duplicate key/,
        );
        await refused(
          c,
          "INSERT INTO yucer_core.account_cooperation_history(workspace_id,account_id,state,first_date,evidence,recorded_by,request_key) VALUES($1,$2,'dated',CURRENT_DATE+1,'Future','ops','future-record')",
          [f.ws, f.account],
          /check constraint/,
        );
        await refused(
          c,
          "INSERT INTO yucer_core.account_cooperation_history(workspace_id,account_id,state,evidence,recorded_by,request_key) VALUES($1,$2,'before_year','Missing year','ops','missing-year')",
          [f.ws, f.account],
          /check constraint/,
        );
        await refused(
          c,
          "UPDATE yucer_core.account_cooperation_history SET evidence='rewrite' WHERE workspace_id=$1",
          [f.ws],
          /permission denied/,
        );
        await refused(
          c,
          "DELETE FROM yucer_core.account_cooperation_history WHERE workspace_id=$1",
          [f.ws],
          /permission denied/,
        );
      } finally {
        await c.query("ROLLBACK");
      }
    }),
);
test(
  "Postgres: action evidence binds the exact sealed action/account and cannot rewrite history",
  { skip },
  async () =>
    db(async (c) => {
      await c.query("BEGIN");
      try {
        const f = await seed(c);
        await c.query("SET LOCAL ROLE yucer_svc");
        const insert =
          "INSERT INTO yucer_gtm.plan_action_result(workspace_id,revision_id,action_key,account_id,met,evidence,occurred_at,recorded_by,request_key) VALUES($1,$2,$3,$4,true,'Signed acceptance',CURRENT_DATE,'ops',$5)";
        const args = [f.ws, f.revision, f.action, f.account, "result-1"];
        await c.query(insert, args);
        await refused(
          c,
          insert,
          [id(), ...args.slice(1)],
          /plan action unavailable/,
        );
        await refused(
          c,
          insert,
          [f.ws, f.revision, id(), f.account, "other-action"],
          /plan action unavailable/,
        );
        await refused(c, insert, args, /duplicate key/);
        await refused(
          c,
          "UPDATE yucer_gtm.plan_action_result SET met=false WHERE workspace_id=$1",
          [f.ws],
          /permission denied/,
        );
        await refused(
          c,
          "DELETE FROM yucer_gtm.plan_action_result WHERE workspace_id=$1",
          [f.ws],
          /permission denied/,
        );
      } finally {
        await c.query("ROLLBACK");
      }
    }),
);
test(
  "Prisma: evidence mappings serialize without BigInt and plan failure atomically rolls back verification",
  { skip },
  async () =>
    db(async (c) => {
      const f = await seed(c);
      const accounts = new PrismaAccountStore(),
        plans = new PrismaSalesPlanStore();
      try {
        const history: CooperationAssertion = {
          id: id(),
          accountId: f.account,
          state: "before_year",
          firstDate: null,
          beforeYear: 2020,
          acquisitionOwnerSub: null,
          acquisitionTerritoryId: null,
          evidence: "Verified register",
          recordedAt: new Date().toISOString(),
          recordedBy: "ops",
          requestKey: "history-1",
        };
        const saved = await accounts.appendCooperationHistory(f.ws, history);
        assert.equal(saved.id, history.id);
        assert.doesNotThrow(() => JSON.stringify(saved));
        assert.equal(
          (
            await accounts.appendCooperationHistory(f.ws, {
              ...history,
              id: id(),
            })
          ).id,
          saved.id,
        );
        await assert.rejects(
          accounts.appendCooperationHistory(f.ws, {
            ...history,
            beforeYear: 2019,
          }),
          /request_conflict/,
        );
        assert.deepEqual(await accounts.listCooperationHistory(id()), []);
        assert.equal(
          (await accounts.listCooperationHistory(f.ws))[0]!.state,
          "before_year",
        );
        const result: PlanActionResult = {
          id: id(),
          revisionId: f.revision,
          actionKey: f.action,
          accountId: f.account,
          met: true,
          evidence: "Signed acceptance",
          occurredAt: new Date().toISOString().slice(0, 10),
          recordedAt: new Date().toISOString(),
          recordedBy: "ops",
          requestKey: "result-1",
        };
        await assert.rejects(
          plans.transact(f.ws, f.year, async (_plan, write) => {
            await write.appendActionResult(result);
            throw new Error("abort evidence");
          }),
          /abort evidence/,
        );
        assert.deepEqual(await plans.actionResults(f.ws, f.revision), []);
        const savedResult = await plans.transact(
          f.ws,
          f.year,
          async (_plan, write) => write.appendActionResult(result),
        );
        assert.doesNotThrow(() => JSON.stringify(savedResult));
        assert.equal(
          (
            await plans.transact(f.ws, f.year, async (_plan, write) =>
              write.appendActionResult({ ...result, id: id() }),
            )
          ).id,
          result.id,
        );
        await assert.rejects(
          plans.transact(f.ws, f.year, async (_plan, write) =>
            write.appendActionResult({ ...result, met: false }),
          ),
          /request_conflict/,
        );
        assert.equal(
          (await plans.actionResults(f.ws, f.revision))[0]!.met,
          true,
        );
      } finally {
        // Sealed plans are immutable. Remove only the new test evidence as the local DB owner.
        for (const table of [
          "yucer_gtm.plan_action_result",
          "yucer_core.account_cooperation_history",
        ])
          await c.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [f.ws]);
      }
    }),
);
