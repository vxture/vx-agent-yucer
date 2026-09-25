import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryAccountStore } from "./store";
import { importanceScheme } from "./service";
import { opportunityLevelOf, priorityOf } from "./lib/importance";
import { DEFAULT_IMPORTANCE_LEVELS, DEFAULT_PRIORITY_MATRIX } from "./lib/importance-vocab";
import { InMemoryPipelineStore, type OpportunityRecord } from "../pipeline/store";
import { setOpportunityImportance } from "../pipeline/service";

// 重要度与优先级 (incr/0090) - the service half: the scheme seeds itself on
// first contact exactly as the increment seeds existing workspaces, and a
// deal's level is a gated, recorded statement drawn from the deal axis only.
// The database half (FKs, unique keys, grants) is importance.db.test.ts.

const WS = "ws_importance";

const base = (role: RoleCode, tier: Entitlement["tier"] = "free") => ({
  workspaceId: WS,
  sub: "usr_me",
  holder: { permissions: new Set(permissionsForRoles([role])) },
  entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
});

const deal = (over: Partial<OpportunityRecord> = {}): OpportunityRecord => ({
  id: "opp_1", workspaceId: WS, opportunityNo: "OPP-1", name: "Deal", accountId: "acc_1",
  planId: null, campaignId: null, territoryId: null, ownerSub: "usr_rep", requirement: "req",
  sourceProjectId: null, contractTypeId: null, businessFormId: null, stage: "qualify",
  forecastCategory: "pipeline", amount: money(1), probability: 10, expectedCloseAt: null,
  closedAt: null, status: "open", currency: "CNY", createdAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
} as OpportunityRecord);

test("an empty workspace's scheme seeds both axes and the nine cells, once", async () => {
  const store = new InMemoryAccountStore();
  const s = unwrap(await importanceScheme({ ...base("sales_rep"), store }));
  assert.equal(s.account.length + s.opportunity.length, DEFAULT_IMPORTANCE_LEVELS.length);
  assert.equal(s.rules.length, DEFAULT_PRIORITY_MATRIX.length);
  assert.deepEqual(s.opportunity.map((l) => l.rank), [1, 2, 3], "ordered by rank");
  const again = unwrap(await importanceScheme({ ...base("sales_rep"), store }));
  assert.equal(again.rules.length, s.rules.length, "a second read does not seed twice");
  // Every seeded cell resolves; the most pressing corner is P1.
  assert.equal(priorityOf(s.account[0]!, s.opportunity[0]!, s.rules), 1);
});

test("a new deal reads as the axis default until someone sets it", async () => {
  const s = unwrap(await importanceScheme({ ...base("sales_rep"), store: new InMemoryAccountStore() }));
  assert.equal(opportunityLevelOf({ importanceLevelId: null }, s.opportunity)?.isDefault, true);
});

test("setting importance records the level, who and when", async () => {
  const s = unwrap(await importanceScheme({ ...base("sales_rep"), store: new InMemoryAccountStore() }));
  const store = new InMemoryPipelineStore();
  store.seed([deal()]);
  const at = new Date("2026-09-25T08:00:00Z");
  const top = s.opportunity[0]!;
  unwrap(await setOpportunityImportance({ ...base("sales_rep"), store }, "opp_1", top.id, new Set(s.opportunity.map((l) => l.id)), at));
  const after = await store.getOpportunity(WS, "opp_1");
  assert.equal(after?.importanceLevelId, top.id);
  assert.equal(after?.importanceBySub, "usr_me");
  assert.equal(after?.importanceAt?.toISOString(), at.toISOString());
});

test("a level from the customer axis, or from nowhere, is refused", async () => {
  const s = unwrap(await importanceScheme({ ...base("sales_rep"), store: new InMemoryAccountStore() }));
  const store = new InMemoryPipelineStore();
  store.seed([deal()]);
  const allowed = new Set(s.opportunity.map((l) => l.id));
  const r = await setOpportunityImportance({ ...base("sales_rep"), store }, "opp_1", s.account[0]!.id, allowed);
  assert.equal(r.ok === false && r.violations[0]!.code, "importance_level_unknown");
  const gone = await setOpportunityImportance({ ...base("sales_rep"), store }, "opp_x", s.opportunity[0]!.id, allowed);
  assert.equal(gone.ok === false && gone.violations[0]!.code, "not_found");
});

test("a viewer cannot set importance", async () => {
  const s = unwrap(await importanceScheme({ ...base("sales_rep"), store: new InMemoryAccountStore() }));
  const store = new InMemoryPipelineStore();
  store.seed([deal()]);
  const r = await setOpportunityImportance({ ...base("viewer"), store }, "opp_1", s.opportunity[0]!.id, new Set(s.opportunity.map((l) => l.id)));
  assert.equal(r.ok, false);
  assert.equal((await store.getOpportunity(WS, "opp_1"))?.importanceLevelId ?? null, null);
});
