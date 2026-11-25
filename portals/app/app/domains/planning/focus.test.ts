import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryAccountStore, type AccountRecord } from "../account/store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { InMemorySalesPlanStore } from "./plan-store";
import { emptyContent, validateContent, type PlanContent, type SalesPlan } from "./plan-model";
import { listFocusPlanningYears, readFocusWorkspace, readFocusDetail, type FocusContext } from "./focus-read";
import { applyFocusChange } from "./focus-change";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { readFocusDraft } from "./focus-assist";
const at = "2026-07-01T00:00:00.000Z";
function fixture() {
  const regions = ["east", "west"].map(id => ({ id, divisionId: id, name: id, code: id, provinces: [], included: true, reason: "", ownerSub: "boss" }));
  const content = emptyContent(2026, regions, "CNY"); content.releaseScope = "regions";
  const east = content.targets.find(t => t.scope === "territory:east" && t.period === "Y2026")!;
  const west = content.targets.find(t => t.scope === "territory:west" && t.period === "Y2026")!;
  content.budgets = [{ key: "b", accountId: "a", name: "Ordinary", tier: "standard", period: "Y2026", metric: "revenue", currency: "CNY", amount: "100.00", sourcePlanId: null, sourceReadAt: at, note: "Whole account budget" }];
  content.contributions = [{ key: "ce", budgetKey: "b", targetKey: east.key, regionId: "east", responsibility: "primary", amount: "30.10" }, { key: "cw", budgetKey: "b", targetKey: west.key, regionId: "west", responsibility: "support", amount: "20.20" }];
  content.actions = [{ key: "ae", accountId: "a", regionId: "east", targetKey: null, objective: "Validate procurement", ownerSub: "rep", due: "2026-07-10", evidenceRefs: [] }, { key: "aw", accountId: "a", regionId: "west", targetKey: null, objective: "Restricted west action", ownerSub: "other", due: "2026-07-20", evidenceRefs: ["private-reference"] }, { key: "ac", accountId: "c", regionId: "east", targetKey: null, objective: "Action-only client", ownerSub: "rep", due: "2026-07-30", evidenceRefs: [] }];
  const store = new InMemorySalesPlanStore(), accounts = new InMemoryAccountStore();
  accounts.seed({ accounts: ["a", "b", "c"].map(id => ({ id, workspaceId: "ws", name: id === "a" ? "Ordinary" : id, accountNo: id, tier: id === "b" ? "strategic" : "standard", ownerSub: "rep" } as AccountRecord)) });
  const revision = { id: "r1", state: "sealed" as const, editToken: 2, version: 1, baseId: null, restoresId: null, content, contentHash: "hash", reason: "", createdBy: "ops", createdAt: at, sealedBy: "ops", sealedAt: at };
  const plan: SalesPlan = { id: "plan", workspaceId: "ws", year: 2026, revisions: [revision, { ...revision, id: "draft", state: "draft", editToken: 5, version: null, baseId: "r1", content: { ...structuredClone(content), assumptions: "private company assumptions" } }], events: [{ id: "e1", no: 1, kind: "release", revisionId: "r1", relatedId: null, period: null, at, effectiveAt: at, actor: "ops", reason: "", requestKey: "release1", requestHash: "hash" }], legacy: [] };
  store.seed([plan]);
  const ctx: FocusContext = { workspaceId: "ws", sub: "ops", store, accounts, pipeline: new InMemoryPipelineStore(), scope: { kind: "workspace" }, holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) }, entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "yucer", tier: "enterprise" }, now: () => new Date(at), members: async () => [{ sub: "rep", name: "Rep" }] };
  let seq = 0;
  const apply = (change: Parameters<typeof applyFocusChange>[1], locked: string[] = []) => applyFocusChange(content, change, [{ id: "a", name: "Ordinary", tier: "standard" }, { id: "b", name: "Strategic", tier: "strategic" }], locked, () => `key${++seq}`, at);
  return { ctx, content, apply, plan, east, west };
}
test("published focus comes from UUID contributions/actions, never customer tier; cross-region annual totals count once", async () => {
  const { ctx } = fixture();
  const w = await readFocusWorkspace(ctx, { year: 2026 });
  assert.deepEqual(w.rows.map(r => r.id).sort(), ["a", "c"]); assert.equal(w.revision?.id, "r1");
  assert.deepEqual(w.rows.find(r => r.id === "a")!.revenue, [{ currency: "CNY", amount: "50.30" }]);
  assert.equal(w.rows.find(r => r.id === "c")!.revenue.length, 0); assert.equal(w.rows.find(r => r.id === "c")!.contributions.length, 0);
  assert.equal(JSON.stringify(w).includes("private company assumptions"), false);
});
test("quarter selection does not add annual budgets and future or abandoned drafts never become default", async () => {
  const { ctx } = fixture();
  const w = await readFocusWorkspace(ctx, { year: 2026, period: "2026Q3" });
  assert.equal(w.rows.length, 2); assert.equal(w.rows.find(r => r.id === "a")!.revenue.length, 0);
  const draft = await readFocusWorkspace(ctx, { year: 2026, revisionId: "draft" });
  assert.equal(draft.revision?.draft, true); assert.equal(draft.editToken, 5);
  await assert.rejects(readFocusWorkspace(ctx, { year: 2026, revisionId: "foreign" }));
});
test("region scope strips other-region actions, whole budgets, regional targets and candidates before serialization", async () => {
  const { ctx } = fixture();
  ctx.scope = { kind: "territory", territoryIds: ["east"], accountIds: ["a", "c"], ownerSubs: [], unplacedAccountIds: [] };
  const w = await readFocusWorkspace(ctx, { year: 2026 });
  const serialized = JSON.stringify(w);
  assert.equal(serialized.includes("Restricted west action"), false); assert.equal(serialized.includes("Whole account budget"), false);
  assert.equal(w.rows.find(r => r.id === "a")!.contributions[0].budget.amount, null); assert.equal("target" in w.rows.find(r => r.id === "a")!.contributions[0].target, false);
  assert.deepEqual(w.rows.find(r => r.id === "a")!.revenue, [{ currency: "CNY", amount: "30.10" }]); assert.equal(w.candidates.length, 0); assert.equal(w.canEdit, false);
  await assert.rejects(readFocusWorkspace(ctx, { year: 2026, regionId: "west" }));
});
test("own scope uses explicit action owner, omits regional team and other owner identities", async () => {
  const { ctx } = fixture(); ctx.sub = "rep"; ctx.scope = { kind: "own", sub: "rep", accountIds: ["a", "c"] };
  const detail = await readFocusDetail(ctx, { year: 2026, accountId: "a" });
  assert.deepEqual(detail.row.actions.map(a => a.key), ["ae"]); assert.deepEqual(detail.row.regions.map(r => r.id), ["east"]);
  assert.ok(detail.regionTeams.every(r => !r.allocations.length)); assert.equal(detail.workspace.members.length, 0);
});
test("source, planning, tier, workspace and version gates cannot be bypassed by URL", async () => {
  const { ctx } = fixture();
  for (const permission of ["planning.read", "account.read"]) {
    const permissions = new Set(ctx.holder.permissions); permissions.delete(permission as never);
    await assert.rejects(readFocusWorkspace({ ...ctx, holder: { permissions } }, { year: 2026 }));
  }
  assert.equal((await readFocusWorkspace({ ...ctx, workspaceId: "other" }, { year: 2026 })).revision, null);
  await assert.rejects(readFocusWorkspace({ ...ctx, scope: { kind: "own", sub: "ops", accountIds: [] } }, { year: 2026, revisionId: "draft" }));
  await assert.rejects(readFocusWorkspace(ctx, { year: 2026, period: "2027Q1" }));
});
test("action-first enrollment creates no zero budget or customer designation, and input remains immutable", () => {
  const { content, apply } = fixture(), before = structuredClone(content);
  const next = apply({ kind: "add", accountIds: ["b", "b"], regionId: "east", objective: "Confirm needs", ownerSub: "rep", due: "2026-08-01" });
  assert.equal(next.actions.filter(a => a.accountId === "b").length, 1); assert.equal(next.budgets.length, content.budgets.length); assert.deepEqual(content, before); validateContent(next, false);
});
test("remove only the selected customer/region draft arrangements; retain other region and shared budget", () => {
  const { apply } = fixture(); const next = apply({ kind: "remove", accountId: "a", regionId: "east", period: "Y2026" });
  assert.deepEqual(next.contributions.map(c => c.regionId), ["west"]); assert.ok(next.actions.some(a => a.accountId === "c")); assert.ok(next.actions.some(a => a.key === "aw")); assert.equal(next.budgets.length, 1);
});
test("locked quarter cannot be removed, moved or edited through customer view", () => {
  const { apply } = fixture();
  assert.throws(() => apply({ kind: "remove", accountId: "a", regionId: "east", period: "Y2026" }, ["2026Q3"]));
  assert.throws(() => apply({ kind: "action", key: "ae", accountId: "a", regionId: "east", objective: "Move out", ownerSub: "rep", due: "2026-10-01" }, ["2026Q3"]));
});
test("new contribution reuses shared budget, preserves other arrangements and enforces exact total budget", () => {
  const { apply, east } = fixture();
  const next = apply({ kind: "contribution", accountId: "a", regionId: "east", targetKey: east.key, budget: "100.00", amount: "40.00", note: "basis", responsibility: "primary", key: "ce" });
  assert.equal(next.budgets.length, 1); assert.equal(next.contributions.find(c => c.key === "cw")!.amount, "20.20"); validateContent(next, false);
  const over = apply({ kind: "contribution", accountId: "a", regionId: "east", targetKey: east.key, budget: "10", amount: "40", note: "basis", responsibility: "primary", key: "ce" });
  assert.throws(() => validateContent(over, false));
});
test("assistant parses only visible form fields and rejects invented IDs, invalid dates and negative amounts", () => {
  assert.ok(readFocusDraft('{"fields":{"objective":"Review scope","due":"2026-08-01","budget":"100","amount":"30"}}'));
  for (const fields of [{ accountId: "other" }, { due: "2026-02-31" }, { amount: "-1" }, { amount: "1e3" }, { objective: "x".repeat(1001) }]) assert.equal(readFocusDraft(JSON.stringify({ fields })), null);
  assert.equal(readFocusDraft("Saved successfully"), null);
});
test("quarter removal keeps other periods and the annual contribution intact", () => {
  const { apply } = fixture();
  const next = apply({ kind: "remove", accountId: "a", regionId: "east", period: "2026Q3" });
  assert.equal(next.actions.some(a => a.key === "ae"), false);
  assert.equal(next.actions.some(a => a.key === "aw"), true);
  assert.equal(next.contributions.length, 2);
  assert.equal(next.budgets.length, 1);
});
test("draft detail refuses mixing a changed team snapshot into the prior projection", async () => {
  const { ctx } = fixture(), read = ctx.store.read.bind(ctx.store); let calls = 0;
  ctx.store.read = async (...args) => { const p = await read(...args); if (++calls === 2 && p) p.revisions.find(r => r.id === "draft")!.editToken++; return p; };
  await assert.rejects(readFocusDetail(ctx, { year: 2026, revisionId: "draft", accountId: "a" }), /draft_conflict/);
});
test("moving an action clears an incompatible optional target link without changing evidence", () => {
  const { content, east } = fixture();
  content.actions[0].targetKey = east.key; content.actions[0].evidenceRefs = ["evidence"];
  const next = applyFocusChange(content, { kind: "action", key: "ae", accountId: "a", regionId: "west", objective: "Review in west", ownerSub: "rep", due: "2026-08-01" }, [{ id: "a", name: "Ordinary", tier: "standard" }], [], () => "key", at);
  assert.equal(next.actions[0].targetKey, null); assert.deepEqual(next.actions[0].evidenceRefs, ["evidence"]); validateContent(next, false);
});

test("launcher focus projection keeps the roster scope without loading contact details", async () => {
  const { ctx } = fixture();
  let contactReads = 0;
  ctx.accounts.listContacts = async () => { contactReads++; return []; };
  const roster = await readFocusWorkspace(ctx, { year: 2026 }, { includeContactDetails: false });
  assert.deepEqual(roster.rows.map(r => r.id).sort(), ["a", "c"]);
  assert.equal(contactReads, 0);
  assert.ok(roster.rows.every(r => r.contacts.state === "unavailable"));
});

test("year discovery exposes only years with visible published work, and never foreign workspaces", async () => {
  const { ctx } = fixture();
  assert.deepEqual(await listFocusPlanningYears(ctx), [{ year: 2026, published: true, draft: true }]);
  assert.deepEqual(await listFocusPlanningYears({ ...ctx, workspaceId: "other" }), []);
  assert.deepEqual(await listFocusPlanningYears({ ...ctx, scope: { kind: "own", sub: "nobody", accountIds: [] } }), []);
  assert.deepEqual(await listFocusPlanningYears({ ...ctx, sub: "rep", scope: { kind: "own", sub: "rep", accountIds: ["a", "c"] } }), [{ year: 2026, published: true, draft: false }]);
});
