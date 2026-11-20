import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryAccountStore, type AccountRecord, type ContactRecord } from "../account/store";
import { InMemoryPipelineStore, type OpportunityRecord } from "../pipeline/store";
import { InMemorySalesPlanStore } from "./plan-store";
import { readFocusContacts } from "./focus-contacts";
import { readFocusCoverage } from "./focus-coverage";
import type { FocusContext } from "./focus-read";
import type { FocusRow } from "./focus-model";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";

function fixture() {
  const accounts = new InMemoryAccountStore(), pipeline = new InMemoryPipelineStore();
  accounts.seed({ accounts: ["a", "b", "c"].map(id => ({ id, workspaceId: "ws", name: id } as AccountRecord)), contacts: ["first", "second"].map(id => ({ id, name: id, workspaceId: "ws", accountId: "a", status: "active", mobile: "private", sortOrder: 0 } as ContactRecord)) });
  const ctx: FocusContext = { workspaceId: "ws", sub: "ops", store: new InMemorySalesPlanStore(), accounts, pipeline, scope: { kind: "workspace" }, holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) }, entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", tier: "enterprise" } };
  const rows: FocusRow[] = ["a", "b", "c"].map(id => ({ id, name: id, accountNo: id, tier: "key", ownerSub: null, regions: [], actions: [], contributions: [], unallocated: [], revenue: [], coverage: { state: "unavailable" }, contacts: { state: "unavailable" } }));
  return { ctx, accounts, pipeline, rows };
}
test("focus sends lead identity and count only, and reuses server-only contacts in coverage", async () => {
  const { ctx, accounts, rows, pipeline } = fixture();
  pipeline.seed([{ id: "d", name: "d", workspaceId: "ws", accountId: "a", status: "open" } as OpportunityRecord]);
  let reads = 0; const read = accounts.listContacts.bind(accounts);
  accounts.listContacts = async (...args) => { reads++; return read(...args); };
  const cache = await readFocusContacts(ctx, rows);
  await readFocusCoverage(ctx, rows, cache);
  assert.equal(reads, 3); assert.equal(rows[0].contacts.state, "ready");
  if (rows[0].contacts.state === "ready") { assert.equal(rows[0].contacts.total, 2); assert.equal(rows[0].contacts.first?.name, "first"); }
  const json = JSON.stringify(rows); assert.equal(json.includes("private"), false); assert.equal(json.includes("second"), false);
});
test("empty, failed and denied contact sources do not masquerade as one another", async () => {
  const { ctx, accounts, rows } = fixture(); const read = accounts.listContacts.bind(accounts);
  accounts.listContacts = async (ws, id) => { if (id === "c") throw new Error("offline"); return read(ws, id); };
  const cache = await readFocusContacts(ctx, rows);
  assert.deepEqual(rows[1].contacts, { state: "ready", first: null, total: 0 });
  assert.deepEqual(rows[2].contacts, { state: "unavailable" }); assert.equal(cache.has("c"), false);
  const denied = fixture(); denied.ctx.holder = { permissions: new Set() };
  await readFocusContacts(denied.ctx, denied.rows);
  assert.ok(denied.rows.every(row => row.contacts.state === "unavailable"));
});
test("contact count remains readable at base customer tier with graph entitlement unavailable", async () => {
  const { ctx, rows } = fixture(); ctx.entitlement = { ...ctx.entitlement, tier: "starter" };
  const cache = await readFocusContacts(ctx, rows); await readFocusCoverage(ctx, rows, cache);
  assert.equal(rows[0].contacts.state, "ready"); assert.equal(rows[0].coverage.state, "denied");
});
