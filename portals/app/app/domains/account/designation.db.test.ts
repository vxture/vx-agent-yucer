import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { PrismaAccountStore } from "./prisma-store";

// Persistence failures must roll back the customer/level and the plan together.
const skip = process.env.DATABASE_URL ? false : "no DATABASE_URL - see ci.yml db-contract";
const WS = "7accede0-0000-0000-0000-000000000001";
const basics = { name: "Strategic create contract", region: null, province: null, industryId: null, segmentCode: null,
  customerTypeId: null, customerSizeId: null, customerNatureId: null, creditCode: null, website: null, employeeCount: null, ownerSub: "sales_owner" };
const plan = { period: "Y2026", targetAmount: 120000, contactCadenceDays: 14, execCadenceDays: 60,
  ownerSub: "sales_owner", presalesSub: "presales", deliverySub: "delivery", status: "active" as const };

async function database(run: (pg: Client, store: PrismaAccountStore) => Promise<void>) {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const cleanup = async () => {
    await pg.query("DELETE FROM yucer_core.account_plan WHERE workspace_id = $1", [WS]);
    await pg.query("DELETE FROM yucer_core.account WHERE workspace_id = $1", [WS]);
    await pg.query("DELETE FROM yucer_core.importance_level WHERE workspace_id = $1", [WS]);
  };
  try {
    await cleanup();
    await run(pg, new PrismaAccountStore());
  } finally {
    await cleanup();
    await pg.end();
  }
}

test("strategic creation and linking persist the plan and both level representations", { skip }, async () => {
  await database(async (pg, store) => {
    const level = await store.createImportanceLevel(WS, { subject: "account", levelCode: "strategic", name: "Strategic", description: null, rank: 1, isDefault: false, sortOrder: 0 });
    const created = await store.createAccount(WS, { ...basics, tier: "strategic", plan });
    let rows = (await pg.query("SELECT tier, tier_level_id FROM yucer_core.account WHERE workspace_id = $1 AND id = $2", [WS, created.id])).rows;
    assert.equal(rows[0].tier, "strategic");
    assert.equal(rows[0].tier_level_id, level.id);
    const rawPlan = (await pg.query("SELECT target_amount, contact_cadence_days, exec_cadence_days, owner_sub FROM yucer_core.account_plan WHERE workspace_id = $1 AND account_id = $2", [WS, created.id])).rows[0];
    assert.equal(Number(rawPlan.target_amount), 120000);
    assert.equal(rawPlan.contact_cadence_days, 14);
    assert.equal(rawPlan.exec_cadence_days, 60);
    assert.equal(rawPlan.owner_sub, "sales_owner");
    const existing = await store.createAccount(WS, basics);
    assert.equal(await store.saveAccountDesignation(WS, existing.id, "strategic", plan), true);
    rows = (await pg.query("SELECT tier, tier_level_id, owner_sub FROM yucer_core.account WHERE workspace_id = $1 AND id = $2", [WS, existing.id])).rows;
    assert.equal(rows[0].tier, "strategic");
    assert.equal(rows[0].tier_level_id, level.id);
    assert.equal(rows[0].owner_sub, "sales_owner");
    assert.equal(await store.saveAccountDesignation("7accede0-0000-0000-0000-000000000002", existing.id, "strategic", plan), false);
  });
});

test("a database failure in the plan rolls back creation and a later designation", { skip }, async () => {
  await database(async (pg, store) => {
    // A numeric overflow reaches Postgres after the customer write has run.
    const invalid = { ...plan, targetAmount: 1e30 };
    await assert.rejects(store.createAccount(WS, { ...basics, tier: "strategic", plan: invalid }));
    assert.equal(Number((await pg.query("SELECT count(*) FROM yucer_core.account WHERE workspace_id = $1", [WS])).rows[0].count), 0);
    const ordinary = await store.createAccount(WS, basics);
    await assert.rejects(store.saveAccountDesignation(WS, ordinary.id, "strategic", invalid));
    assert.equal((await pg.query("SELECT tier FROM yucer_core.account WHERE id = $1", [ordinary.id])).rows[0].tier, "standard");
    assert.equal(Number((await pg.query("SELECT count(*) FROM yucer_core.account_plan WHERE workspace_id = $1", [WS])).rows[0].count), 0);
  });
});
