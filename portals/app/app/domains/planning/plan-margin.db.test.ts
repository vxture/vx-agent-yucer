import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { emptyContent } from "./plan-model";
const skip = !process.env.DATABASE_URL;
test("Postgres: explicit margin rates use baseline revenue, reject forged amounts and retain rates at zero revenue", { skip }, async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); await c.query("BEGIN");
  try {
    const ws = randomUUID(), plan = randomUUID(), revision = randomUUID();
    const content = emptyContent(2028, [], "CNY"); content.releaseScope = "company";
    Object.assign(content.targets[0], { floor: "600", target: "1000", stretch: "1200" });
    content.targets.push({ ...content.targets[0]!, key: randomUUID(), metric: "margin", floor: "300", target: "400", stretch: "500", marginRates: { floor: "30", target: "40", stretch: "50" } });
    await c.query("INSERT INTO yucer_gtm.sales_plan(id,workspace_id,year) VALUES($1,$2,2028)", [plan, ws]);
    await c.query("SET LOCAL ROLE yucer_svc");
    await c.query("INSERT INTO yucer_gtm.sales_plan_revision(id,workspace_id,plan_id,content,created_by_sub) VALUES($1,$2,$3,$4,'owner')", [revision, ws, plan, JSON.stringify(content)]);
    const refused = async (value: unknown, pattern: RegExp) => {
      await c.query("SAVEPOINT rate_test");
      await assert.rejects(c.query("UPDATE yucer_gtm.sales_plan_revision SET content=$2 WHERE id=$1", [revision, JSON.stringify(value)]), pattern);
      await c.query("ROLLBACK TO SAVEPOINT rate_test"); await c.query("RELEASE SAVEPOINT rate_test");
    };
    const forged = structuredClone(content); forged.targets[1]!.target = "401";
    await refused(forged, /margin_rate_mismatch/);
    const invalid = structuredClone(content); invalid.targets[1]!.marginRates!.target = "101";
    await refused(invalid, /invalid_margin_rate/);
    for (const line of content.targets) Object.assign(line, { floor: "0", target: "0", stretch: "0" });
    await c.query("UPDATE yucer_gtm.sales_plan_revision SET content=$2 WHERE id=$1", [revision, JSON.stringify(content)]);
    const stored = (await c.query("SELECT content FROM yucer_gtm.sales_plan_revision WHERE id=$1", [revision])).rows[0].content;
    assert.deepEqual(stored.targets[1].marginRates, { floor: "30", target: "40", stretch: "50" });
    delete content.targets[1]!.marginRates; // Legacy amount-only documents retain their meaning.
    await c.query("UPDATE yucer_gtm.sales_plan_revision SET content=$2 WHERE id=$1", [revision, JSON.stringify(content)]);
  } finally { await c.query("ROLLBACK"); await c.end(); }
});
