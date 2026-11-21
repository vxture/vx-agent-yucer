import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { emptyContent } from "./plan-model";
import { defaultNewLogoEstimate } from "./new-logo-estimate";
const skip = !process.env.DATABASE_URL;
test("Postgres: new-customer assumptions persist, reject forged auto totals and retain manual overrides", { skip }, async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); await c.query("BEGIN");
  try {
    const ws = randomUUID(), plan = randomUUID(), revision = randomUUID();
    const content = emptyContent(2028, [], "CNY"); content.releaseScope = "company";
    Object.assign(content.targets[0], { floor: "600000", target: "1000000", stretch: "1200000" });
    content.targets.push({ ...content.targets[0]!, key: randomUUID(), metric: "new_logo", currency: null, floor: "3", target: "5", stretch: "6", newLogoEstimate: defaultNewLogoEstimate("CNY") });
    await c.query("INSERT INTO yucer_gtm.sales_plan(id,workspace_id,year) VALUES($1,$2,2028)", [plan, ws]);
    await c.query("SET LOCAL ROLE yucer_svc");
    await c.query("INSERT INTO yucer_gtm.sales_plan_revision(id,workspace_id,plan_id,content,created_by_sub) VALUES($1,$2,$3,$4,'owner')", [revision, ws, plan, JSON.stringify(content)]);
    const refused = async (value: unknown, pattern: RegExp) => {
      await c.query("SAVEPOINT estimate_test");
      await assert.rejects(c.query("UPDATE yucer_gtm.sales_plan_revision SET content=$2 WHERE id=$1", [revision, JSON.stringify(value)]), pattern);
      await c.query("ROLLBACK TO SAVEPOINT estimate_test"); await c.query("RELEASE SAVEPOINT estimate_test");
    };
    for (const value of ["0", "-1", "0.001"]) { const invalid = structuredClone(content); invalid.targets[1]!.newLogoEstimate!.firstOrderAmount = value; await refused(invalid, /invalid_new_logo_estimate/); }
    const forged = structuredClone(content); forged.targets[1]!.target = "6"; await refused(forged, /new_logo_basis_mismatch/);
    const mismatch = structuredClone(content); mismatch.targets[1]!.newLogoEstimate!.currency = "USD"; await refused(mismatch, /new_logo_basis_mismatch/);
    content.targets[1]!.newLogoEstimate!.automatic = false; content.targets[1]!.target = "4";
    await c.query("UPDATE yucer_gtm.sales_plan_revision SET content=$2 WHERE id=$1", [revision, JSON.stringify(content)]);
    const stored = (await c.query("SELECT content FROM yucer_gtm.sales_plan_revision WHERE id=$1", [revision])).rows[0].content;
    assert.equal(stored.targets[1].target, "4"); assert.equal(stored.targets[1].newLogoEstimate.automatic, false);
    delete content.targets[1]!.newLogoEstimate;
    await c.query("UPDATE yucer_gtm.sales_plan_revision SET content=$2 WHERE id=$1", [revision, JSON.stringify(content)]);
  } finally { await c.query("ROLLBACK"); await c.end(); }
});
