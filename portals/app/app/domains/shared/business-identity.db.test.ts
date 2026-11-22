import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { PrismaCatalogStore } from "../catalog/prisma-store";
import { BusinessCodeCollision, nextBusinessCode, saveBusinessRecord } from "./business-code";

const skip = process.env.DATABASE_URL ? false : "no DATABASE_URL";

test("number conflicts remain business errors across module boundaries", async () => {
  const conflict = await saveBusinessRecord("PRD", [], { editId: "existing" }, async () => {
    throw Object.assign(new Error(), { code: "business_number_conflict" });
  });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.violations[0]?.code, "number_taken");
  const missing = await saveBusinessRecord("PRD", [], { editId: "removed" }, async () => {
    throw Object.assign(new Error(), { code: "business_record_missing" });
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.violations[0]?.code, "not_found");
});

test(
  "foreign keys between product records use UUID columns",
  { skip },
  async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      const { rows } = await db.query(`
      SELECT c.conname, a.attname, n.nspname AS schema,
             format_type(a.atttypid, a.atttypmod) AS type,
             first_col.atttypid = 'uuid'::regtype AS uuid_identity,
             referenced.attname AS referenced_column
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_class target ON target.oid = c.confrelid
      JOIN pg_namespace tn ON tn.oid = target.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
      JOIN pg_attribute first_col ON first_col.attrelid = t.oid AND first_col.attnum = c.conkey[1]
      JOIN pg_attribute referenced ON referenced.attrelid = target.oid
        AND referenced.attnum = c.confkey[array_position(c.conkey, a.attnum)]
      WHERE c.contype = 'f' AND left(n.nspname, 6) = 'yucer_'
        AND left(tn.nspname, 6) = 'yucer_' AND a.atttypid <> 'uuid'::regtype
    `);
      // Composite task FKs identify records by UUID first. These exact extra
      // columns enforce OIDC ownership and legacy/task isolation; they are not
      // business identifiers. No arbitrary string/code relationship is allowed.
      const scopeGuards = new Set([
        "agent_execution_step_draft_fk:actor_sub:actor_sub",
        "agent_execution_grant_task_fk:actor_sub:actor_sub",
        "agent_execution_receipt_grant_fk:actor_sub:actor_sub",
        "agent_execution_receipt_step_fk:actor_sub:actor_sub",
        "agent_task_session_fk:actor_sub:actor_sub",
        "agent_task_session_fk:session_kind:kind",
        "agent_task_reference_owner_fk:actor_sub:actor_sub",
        "agent_task_legacy_owner_fk:actor_sub:actor_sub",
        "agent_task_legacy_session_fk:actor_sub:actor_sub",
        "agent_task_legacy_session_fk:session_kind:kind",
        "agent_task_draft_owner_fk:actor_sub:actor_sub",
        "agent_task_checkpoint_owner_fk:actor_sub:actor_sub",
        "agent_task_turn_owner_fk:actor_sub:actor_sub",
        // The UUID still identifies each source. These extra components bind
        // its private owner and immutable revision, not a human-facing code.
        "agent_private_memory_task:actor_sub:actor_sub",
        "agent_private_memory_revision_owner:actor_sub:actor_sub",
        "agent_task_memory_task:actor_sub:actor_sub",
        "agent_task_memory_source:actor_sub:actor_sub",
        "agent_task_memory_source:memory_revision:revision",
        "agent_task_knowledge_task:actor_sub:actor_sub",
        "agent_judgement_topic_task:actor_sub:actor_sub",
        "agent_task_knowledge_source:knowledge_revision:revision",
      ]);
      assert.deepEqual(
        rows.filter(
          (r) =>
            !(
              r.schema === "yucer_agent" &&
              r.uuid_identity &&
              scopeGuards.has(
                `${r.conname}:${r.attname}:${r.referenced_column}`,
              )
            ),
        ),
        [],
      );
    } finally {
      await db.end();
    }
  },
);

test("concurrent automatic catalogue numbers do not overwrite; renumbering keeps UUID-based relations", { skip }, async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const workspaceId = randomUUID();
  const store = new PrismaCatalogStore();
  try {
    const unit = await store.upsertProductUnit(workspaceId, { unitCode: "set", name: "Set" });
    const status = await store.upsertStatusConfig(workspaceId, { statusCode: "active", name: "Active", description: null });
    const value = { unitId: unit.id, statusId: status.id, typeId: null };
    const create = (name: string) => saveBusinessRecord("PRD", [], "create", productCode =>
      store.upsertProduct(workspaceId, { ...value, productCode: productCode!, name }, "create"));
    const [one, two] = await Promise.all([create("First"), create("Second")]);
    assert.ok(one.ok && two.ok);
    assert.notEqual(one.value.productCode, two.value.productCode);
    assert.notEqual(one.value.id, two.value.id);
    const market = randomUUID();
    await db.query("INSERT INTO yucer_gtm.market_segment (id,workspace_id,segment_code,name) VALUES ($1,$2,'M1','Market')", [market, workspaceId]);
    await db.query("INSERT INTO yucer_gtm.market_segment_product VALUES ($1,$2,$3)", [workspaceId, market, one.value.id]);

    const renamed = await store.upsertProduct(workspaceId, { ...value, productCode: "CUSTOM-001", name: one.value.name }, { editId: one.value.id });
    assert.equal(renamed.id, one.value.id);
    assert.equal(renamed.productCode, "CUSTOM-001");
    assert.deepEqual((await db.query("SELECT product_id FROM yucer_gtm.market_segment_product WHERE segment_id=$1", [market])).rows, [{ product_id: one.value.id }]);
    await assert.rejects(store.upsertProduct(workspaceId, { ...value, productCode: two.value.productCode, name: "Must not overwrite" }, { editId: one.value.id }), BusinessCodeCollision);
    assert.equal((await store.listProducts(workspaceId)).find(row => row.id === two.value.id)?.name, "Second");
  } finally {
    await db.query("DELETE FROM yucer_gtm.market_segment WHERE workspace_id=$1", [workspaceId]);
    for (const table of ["product", "product_status", "product_unit"])
      await db.query(`DELETE FROM yucer_catalog.${table} WHERE workspace_id=$1`, [workspaceId]);
    await db.end();
  }
});

test("business dates follow Shanghai midnight and only consume sequence numbers for that kind and date", () => {
  const now = new Date("2026-11-17T17:00:00Z");
  assert.equal(nextBusinessCode("MKT", ["MKT-20261117-010", "SOL-20261118-005", "MKT-20261118-002"], now), "MKT-20261118-003");
});

test("customer market and sales region UUIDs reject cross-workspace writes and preserve names on reads", { skip }, async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const ws = randomUUID(), other = randomUUID(), id = randomUUID();
  const market = randomUUID(), foreign = randomUUID(), region = randomUUID();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL ROLE yucer_svc");
    await db.query("INSERT INTO yucer_gtm.market_segment (id,workspace_id,segment_code,name) VALUES ($1,$2,'M1','Market'),($3,$4,'M1','Other')", [market, ws, foreign, other]);
    await db.query("INSERT INTO yucer_core.market_division (id,workspace_id,division_code,name) VALUES ($1,$2,'CHINA-EAST','East')", [region, ws]);
    await db.query("INSERT INTO yucer_core.account (id,workspace_id,account_no,name,segment_code,region) VALUES ($1,$2,'A1','Customer','M1','East')", [id, ws]);
    const read = () => db.query("SELECT a.segment_id,a.region_id,d.name FROM yucer_core.account a LEFT JOIN yucer_core.market_division d ON d.workspace_id=a.workspace_id AND d.id=a.region_id WHERE a.id=$1", [id]);
    assert.deepEqual((await read()).rows, [{ segment_id: market, region_id: region, name: "East" }]);
    await db.query("UPDATE yucer_core.market_division SET name='East Coast' WHERE id=$1", [region]);
    assert.deepEqual((await read()).rows, [{ segment_id: market, region_id: region, name: "East Coast" }]);
    await db.query("SAVEPOINT before_foreign");
    await assert.rejects(db.query("UPDATE yucer_core.account SET segment_id=$1 WHERE id=$2", [foreign, id]), /fk_account_market_segment/);
    await db.query("ROLLBACK TO SAVEPOINT before_foreign");
    await db.query("UPDATE yucer_core.account SET segment_id=NULL,region_id=NULL WHERE id=$1", [id]);
    assert.deepEqual((await db.query("SELECT segment_id,segment_code,region_id,region FROM yucer_core.account WHERE id=$1", [id])).rows, [{ segment_id: null, segment_code: null, region_id: null, region: null }]);
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
});
