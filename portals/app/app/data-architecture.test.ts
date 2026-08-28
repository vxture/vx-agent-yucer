import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ddlTables,
  prismaTables,
} from "../../../scripts/guardrails/check-data-architecture.mjs";

// The repo root, from portals/app/app.
const ROOT = join(import.meta.dirname, "..", "..", "..");

test("ddlTables extracts schema.table pairs", () => {
  const s = ddlTables(
    "CREATE TABLE IF NOT EXISTS vx_provision.app_instance (\n  id UUID\n);\n" +
      "CREATE TABLE IF NOT EXISTS local_usage.raw (id UUID);",
  );
  assert.ok(s.has("vx_provision.app_instance"));
  assert.ok(s.has("local_usage.raw"));
  assert.equal(s.size, 2);
});

test("prismaTables extracts @@schema + @@map pairs", () => {
  const s = prismaTables(
    'model AppInstance {\n  id String @id\n  @@map("app_instance")\n  @@schema("vx_provision")\n}\n',
  );
  assert.ok(s.has("vx_provision.app_instance"));
});

test("drift is detectable (a table only in DDL is not in prisma)", () => {
  const ddl = ddlTables("CREATE TABLE IF NOT EXISTS a.only_in_ddl (id UUID);");
  const prisma = prismaTables('model X {\n  @@map("other")\n  @@schema("a")\n}\n');
  const onlyDdl = [...ddl].filter((t) => !prisma.has(t));
  assert.deepEqual(onlyDdl, ["a.only_in_ddl"]);
});

// --- DROP, which this guard could not see (ADR-022) --------------------------

test("a table created by the baseline and dropped by an increment is gone", () => {
  // The caller concatenates the baseline with every increment in order, so a
  // removal done the way incr/README prescribes - drop it in an increment,
  // never edit the create-once baseline - left the table in this set forever.
  // The first such removal would have been reported as Prisma drift, and the
  // honest response to that report (delete the model) would have made the
  // report worse rather than better.
  const sql = [
    "CREATE TABLE IF NOT EXISTS yucer_delivery.project_task (id UUID);",
    "DROP TABLE IF EXISTS yucer_delivery.project_task;",
  ].join("\n");
  assert.deepEqual([...ddlTables(sql)], []);
});

test("DROP without IF EXISTS counts too, and order decides", () => {
  // Statements are read in file order and the last one wins: a table dropped
  // and later recreated is present. Anything else would make the answer depend
  // on which statement the regex happened to see first.
  assert.deepEqual([...ddlTables("CREATE TABLE IF NOT EXISTS a.b (id UUID);\nDROP TABLE a.b;")], []);
  assert.deepEqual(
    [...ddlTables("CREATE TABLE IF NOT EXISTS a.b (id UUID);\nDROP TABLE a.b;\nCREATE TABLE IF NOT EXISTS a.b (id UUID);")],
    ["a.b"],
  );
});

test("project_task is gone from the real DDL, and from prisma", () => {
  // The concrete case ADR-022 removed. Asserted against the files rather than a
  // fixture, so re-adding the table in either place without the other trips
  // this as well as the lockstep check.
  const ddl = readFileSync(join(ROOT, "deploy/database/ddl/00_baseline.sql"), "utf8");
  assert.equal(/CREATE TABLE IF NOT EXISTS yucer_delivery\.project_task/.test(ddl), false);
  const prisma = readFileSync(join(ROOT, "portals/app/prisma/schema.prisma"), "utf8");
  assert.equal(/model ProjectTask\b/.test(prisma), false);
});
