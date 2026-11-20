import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryAccountStore, type AccountRecord, type ContactRecord, type OpportunityContactRecord } from "../account/store";
import { InMemoryPipelineStore, type OpportunityRecord } from "../pipeline/store";
import { InMemorySalesPlanStore } from "./plan-store";
import { scopePipelineStore } from "../../authz/scoped-stores";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { readFocusCoverage } from "./focus-coverage";
import { focusNeedsAttention } from "./focus-attention";
import type { FocusContext } from "./focus-read";
import type { FocusRow } from "./focus-model";

function fixture() {
  const accounts = new InMemoryAccountStore(), pipeline = new InMemoryPipelineStore();
  accounts.seed({ accounts: ["a", "b"].map(id => ({ id, workspaceId: "ws", name: id, ownerSub: "rep" } as AccountRecord)) });
  const ctx: FocusContext = { store: new InMemorySalesPlanStore(), scope: { kind: "workspace" }, workspaceId: "ws", sub: "ops", accounts, pipeline, holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) }, entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", tier: "enterprise" } };
  const rows: FocusRow[] = ["a", "b"].map(id => ({ id, name: id, accountNo: id, tier: "key", ownerSub: "rep", regions: [], actions: [], contributions: [], unallocated: [], revenue: [{ currency: "CNY", amount: "100.00" }], coverage: { state: "unavailable" } }));
  const deal = (id: string, accountId = "a", status = "open", workspaceId = "ws") => ({ id, accountId, status, workspaceId, name: id, expectedCloseAt: new Date("2028-01-01") } as OpportunityRecord);
  const person = (id: string, status = "active", accountId = "a") => ({ id, accountId, status, workspaceId: "ws", name: `Private ${id}` } as ContactRecord);
  const link = (personId: string, buyingRole: OpportunityContactRecord["buyingRole"], opportunityId = "d1") => ({ workspaceId: "ws", opportunityId, personId, buyingRole, influence: null, stance: null } as OpportunityContactRecord);
  const seedComplete = () => {
    pipeline.seed([deal("d1")]);
    accounts.seed({ contacts: [person("eb"), person("tb"), person("coach")], opportunityContacts: [link("eb", "economic"), link("tb", "technical"), link("coach", "coach")], relations: [{ workspaceId: "ws", accountId: "a", fromContactId: "eb", toContactId: "coach", relationType: "allied_with" }] });
  };
  return { ctx, rows, accounts, pipeline, deal, person, link, seedComplete };
}

test("complete buying committee counts required roles and reachable chains, projecting totals only", async () => {
  const { ctx, rows, seedComplete } = fixture(); seedComplete();
  await readFocusCoverage(ctx, rows);
  assert.deepEqual(rows[0].coverage, { state: "ready", keyPeople: 3, coveredRoles: 3, requiredRoles: 3, chains: 1, totalChains: 1, completeChains: 1, unreachableChains: 0 });
  assert.equal(focusNeedsAttention(rows[0]), false);
  assert.equal(JSON.stringify(rows).includes("Private"), false);
});
test("contacts alone, empty opportunities and no opportunities are explicit business gaps", async () => {
  const { ctx, rows, accounts, pipeline, person, deal } = fixture();
  pipeline.seed([deal("d1")]); accounts.seed({ contacts: [person("eb"), person("tb")] });
  await readFocusCoverage(ctx, rows);
  assert.deepEqual(rows[0].coverage, { state: "ready", keyPeople: 0, coveredRoles: 0, requiredRoles: 3, chains: 0, totalChains: 1, completeChains: 0, unreachableChains: 0 });
  assert.deepEqual(rows[1].coverage, { state: "ready", keyPeople: 0, coveredRoles: 0, requiredRoles: 0, chains: 0, totalChains: 0, completeChains: 0, unreachableChains: 0 });
  assert.ok(rows.every(focusNeedsAttention));
});
test("per-deal roles cannot form fictional complete coverage; people deduplicate across deals", async () => {
  const { ctx, rows, accounts, pipeline, person, deal, link } = fixture();
  pipeline.seed([deal("d1"), deal("d2"), deal("empty")]);
  accounts.seed({ contacts: [person("eb"), person("tb"), person("coach")], opportunityContacts: [link("eb", "economic"), link("eb", "economic", "d2"), link("tb", "technical", "d2"), link("coach", "coach", "d2")] });
  await readFocusCoverage(ctx, rows);
  assert.deepEqual(rows[0].coverage, { state: "ready", keyPeople: 3, coveredRoles: 4, requiredRoles: 9, chains: 2, totalChains: 3, completeChains: 0, unreachableChains: 2 });
  assert.ok(focusNeedsAttention(rows[0]));
});
test("inactive or cross-customer people cannot cover roles, and opposed edges do not reach the buyer", async () => {
  const { ctx, rows, accounts, pipeline, person, deal, link } = fixture();
  pipeline.seed([deal("d1")]);
  accounts.seed({ contacts: [person("gone", "departed"), person("foreign", "active", "b"), person("eb"), person("coach")], opportunityContacts: [link("gone", "technical"), link("foreign", "technical"), link("eb", "economic"), link("coach", "coach")], relations: [{ workspaceId: "ws", accountId: "a", fromContactId: "eb", toContactId: "coach", relationType: "opposed_to" }] });
  await readFocusCoverage(ctx, rows);
  assert.equal(rows[0].coverage.state, "ready");
  if (rows[0].coverage.state === "ready") {
    assert.equal(rows[0].coverage.coveredRoles, 2); assert.equal(rows[0].coverage.keyPeople, 2);
    assert.equal(rows[0].coverage.completeChains, 0); assert.equal(rows[0].coverage.unreachableChains, 1);
  }
});
test("permission or graph entitlement denial never reads sources or claims uncovered", async () => {
  const { ctx, rows } = fixture();
  const perms = new Set(ctx.holder.permissions); perms.delete("pipeline.read");
  ctx.pipeline!.listOpportunities = async () => { throw new Error("must not read"); };
  await readFocusCoverage({ ...ctx, holder: { permissions: perms } }, rows);
  assert.ok(rows.every(row => row.coverage.state === "denied" && !focusNeedsAttention(row)));
  await readFocusCoverage({ ...ctx, entitlement: { ...ctx.entitlement, tier: "starter" } }, rows);
  assert.ok(rows.every(row => row.coverage.state === "denied"));
});
test("pipeline or graph failures stay unavailable, and a failed customer does not erase others", async () => {
  const first = fixture();
  first.pipeline.listOpportunities = async () => { throw new Error("offline"); };
  await readFocusCoverage(first.ctx, first.rows); assert.ok(first.rows.every(row => row.coverage.state === "unavailable"));
  const { ctx, rows, accounts, pipeline, deal } = fixture();
  pipeline.seed([deal("d1"), deal("d2", "b")]);
  const original = accounts.listContacts.bind(accounts);
  accounts.listContacts = async (ws, id) => { if (id === "a") throw new Error("graph unavailable"); return original(ws, id); };
  await readFocusCoverage(ctx, rows);
  assert.equal(rows[0].coverage.state, "unavailable"); assert.equal(rows[1].coverage.state, "ready");
});
test("links batch once for visible customers and authorized open opportunities only", async () => {
  const { ctx, rows, accounts, pipeline, deal, seedComplete } = fixture(); seedComplete();
  pipeline.seed([deal("closed", "a", "won"), deal("hidden", "hidden"), deal("foreign", "a", "open", "other")]);
  let count = 0; let requested: readonly string[] = []; const read = accounts.listOpportunityContactsFor.bind(accounts);
  accounts.listOpportunityContactsFor = async (ws, ids) => { count++; requested = ids; return read(ws, ids); };
  await readFocusCoverage(ctx, rows);
  assert.equal(count, 1); assert.deepEqual(requested, ["d1"]); assert.equal(rows[0].coverage.state, "ready");
});
test("missing targets draw attention while explicit zero is defined; unavailable coverage is not a false gap", () => {
  const { rows } = fixture(); const row = rows[0];
  assert.equal(focusNeedsAttention(row), false);
  row.revenue = []; assert.equal(focusNeedsAttention(row), true);
  row.revenue = [{ currency: "CNY", amount: "0.00" }]; assert.equal(focusNeedsAttention(row), false);
});

test("own-scope pipeline excludes another seller's committee even at the same visible customer", async () => {
  const { ctx, rows, accounts, pipeline, deal, person, link } = fixture();
  pipeline.seed([{ ...deal("mine"), ownerSub: "rep" }, { ...deal("private"), ownerSub: "other" }]);
  accounts.seed({ contacts: [person("eb")], opportunityContacts: [link("eb", "economic", "private")] });
  let requested: readonly string[] = []; const read = accounts.listOpportunityContactsFor.bind(accounts);
  accounts.listOpportunityContactsFor = async (ws, ids) => { requested = ids; return read(ws, ids); };
  ctx.pipeline = scopePipelineStore(pipeline, { kind: "own", sub: "rep", accountIds: [] });
  await readFocusCoverage(ctx, rows);
  assert.deepEqual(requested, ["mine"]);
  assert.equal(rows[0].coverage.state, "ready");
  if (rows[0].coverage.state === "ready") {
    assert.equal(rows[0].coverage.totalChains, 1); assert.equal(rows[0].coverage.keyPeople, 0);
  }
});
test("failed role-link source does not erase known no-opportunity gaps", async () => {
  const { ctx, rows, pipeline, accounts, deal } = fixture(); pipeline.seed([deal("d1")]);
  accounts.listOpportunityContactsFor = async () => { throw new Error("links offline"); };
  await readFocusCoverage(ctx, rows);
  assert.equal(rows[0].coverage.state, "unavailable"); assert.equal(rows[1].coverage.state, "ready");
});

test("relationship reads use at most six workers and finish all visible customers", async () => {
  const { ctx, rows, pipeline, deal, accounts } = fixture();
  const batch = Array.from({ length: 20 }, (_, index) => ({ ...rows[0], id: `customer-${index}` }));
  accounts.seed({ accounts: batch.map(row => ({ id: row.id, workspaceId: "ws", name: row.id } as AccountRecord)) });
  pipeline.seed(batch.map(row => deal(`deal-${row.id}`, row.id)));
  let active = 0, maximum = 0, finished = 0;
  accounts.listContacts = async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--; finished++; return [];
  };
  await readFocusCoverage(ctx, batch);
  assert.equal(finished, 20); assert.equal(maximum, 6);
  assert.ok(batch.every(row => row.coverage.state === "ready"));
});
