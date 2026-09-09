import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryAccountStore, type AccountRecord } from "./store";
import {
  DEFAULT_INDUSTRIES,
  planIndustry,
  planIndustryRemoval,
  resolveIndustry,
} from "./lib/industry-vocab";
import {
  fillAccountField,
  industryUsage,
  listIndustries,
  moveIndustry,
  removeIndustry,
  upsertIndustry,
  type AccountContext,
} from "./service";

// 行业分类 - incr/0040, the rules and the five verbs.
//
// The database half (the foreign key, the RESTRICT, the unique index, the
// grant) is proved in industry.db.test.ts against a real Postgres. This file
// is the half that is a decision rather than a constraint: what the product
// refuses, and what it seeds when a workspace has never touched the list.

const WS = "ws_ind";

function ctx(
  role: RoleCode,
  store = new InMemoryAccountStore(),
  tier: Entitlement["tier"] = "pro",
): AccountContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

function account(over: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: "acc_1",
    workspaceId: WS,
    accountNo: "ACC-1",
    name: "Acme",
    industryId: null,
    industry: null,
    region: null,
    province: null,
    segmentCode: null,
    ownerSub: "usr_me",
    healthScore: null,
    status: "active",
    tier: "standard",
    creditCode: null,
    website: null,
    employeeCount: null,
    parentId: null,
    ...over,
  };
}

// --- The rules --------------------------------------------------------------

test("an industry needs both a code and a name", () => {
  assert.equal(planIndustry({ industryCode: " ", name: "制造" }).ok, false);
  assert.equal(planIndustry({ industryCode: "manufacturing", name: "  " }).ok, false);
  const ok = planIndustry({ industryCode: " manufacturing ", name: " 制造 " });
  assert.deepEqual(unwrap(ok), { industryCode: "manufacturing", name: "制造" });
});

test("an industry customers are filed under is not deletable, and an empty one is", () => {
  const refused = planIndustryRemoval(3);
  assert.equal(refused.ok === false && refused.violations[0].code, "industry_in_use");
  assert.equal(planIndustryRemoval(0).ok, true);
});

test("a written value resolves by name or by code, and by nothing else", () => {
  const rows = [{ id: "i1", industryCode: "manufacturing", name: "制造" }];
  // A person picks the name; the copilot proposes free text a model produced;
  // an import carries the code. All three have to land on the one row.
  assert.equal(resolveIndustry(rows, "制造")?.id, "i1");
  assert.equal(resolveIndustry(rows, "manufacturing")?.id, "i1");
  assert.equal(resolveIndustry(rows, " MANUFACTURING ")?.id, "i1");
  // And a near miss is a miss: 制造业 is exactly the value that used to become
  // a second industry nobody chose.
  assert.equal(resolveIndustry(rows, "制造业"), null);
  assert.equal(resolveIndustry(rows, "   "), null);
});

// --- The verbs --------------------------------------------------------------

test("a workspace that has never touched the list gets the shipped thirteen", async () => {
  const store = new InMemoryAccountStore();
  const rows = unwrap(await listIndustries(ctx("sales_rep", store)));
  assert.deepEqual(
    rows.map((r) => r.industryCode),
    DEFAULT_INDUSTRIES.map((d) => d.industryCode),
  );
  // Once, not on every read: a second call must not seed a second set.
  assert.equal(unwrap(await listIndustries(ctx("sales_rep", store))).length, rows.length);
});

test("a deletion sticks, and an emptied list is refilled rather than left blank", async () => {
  const store = new InMemoryAccountStore();
  const c = ctx("sales_rep", store);
  const seeded = unwrap(await listIndustries(c));

  // ONE DELETION STICKS. This is the part that matters day to day: a workspace
  // that does not sell to government removes that row and it stays removed,
  // however many times the page is opened.
  await removeIndustry(c, { industryId: seeded.find((r) => r.industryCode === "government")!.id });
  const after = unwrap(await listIndustries(c));
  assert.equal(after.length, seeded.length - 1);
  assert.equal(after.some((r) => r.industryCode === "government"), false);

  // EMPTYING IT ENTIRELY DOES NOT STICK, and that is the honest reading of the
  // branch rather than a claim about intent: with no rows there is nothing to
  // file a customer under, so the shipped set comes back.
  for (const r of after) await removeIndustry(c, { industryId: r.id });
  assert.equal((await store.listIndustries(WS)).length, 0, "the store really is empty");
  assert.equal(unwrap(await listIndustries(c)).length, DEFAULT_INDUSTRIES.length);
});

test("renaming keeps the anchor, and the count comes from the customers", async () => {
  const store = new InMemoryAccountStore();
  const c = ctx("sales_rep", store);
  const made = unwrap(await upsertIndustry(c, { industryCode: "manufacturing", name: "制造" }));
  const renamed = unwrap(await upsertIndustry(c, { industryCode: "manufacturing", name: "先进制造" }));
  assert.equal(renamed.id, made.id, "an existing code renames rather than re-keying");
  assert.equal(renamed.name, "先进制造");

  store.seed({ accounts: [account({ industryId: made.id })] });
  assert.equal(unwrap(await industryUsage(c))[made.id], 1);
  const refused = await removeIndustry(c, { industryId: made.id });
  assert.equal(refused.ok === false && refused.violations[0].code, "industry_in_use");
});

test("the customer reads the industry as the vocabulary currently spells it", async () => {
  const store = new InMemoryAccountStore();
  const c = ctx("sales_rep", store);
  const made = unwrap(await upsertIndustry(c, { industryCode: "manufacturing", name: "制造" }));
  store.seed({ accounts: [account({ industryId: made.id })] });

  assert.equal((await store.getAccount(WS, "acc_1"))?.industry, "制造");
  await upsertIndustry(c, { industryCode: "manufacturing", name: "先进制造" });
  // THE POINT OF THE JOIN: one rename, and every customer filed under it reads
  // the new name. Under the old free-text column this was a data migration.
  assert.equal((await store.getAccount(WS, "acc_1"))?.industry, "先进制造");
});

test("moving reorders the list the pickers offer", async () => {
  const store = new InMemoryAccountStore();
  const c = ctx("sales_rep", store);
  const before = unwrap(await listIndustries(c));
  assert.equal(unwrap(await moveIndustry(c, { industryId: before[1]!.id, direction: "up" })), true);
  const after = unwrap(await listIndustries(c));
  assert.deepEqual(
    [after[0]!.industryCode, after[1]!.industryCode],
    [before[1]!.industryCode, before[0]!.industryCode],
  );
  const edge = await moveIndustry(c, { industryId: after[0]!.id, direction: "up" });
  assert.equal(edge.ok === false && edge.violations[0].code, "move_at_edge");
});

test("configuring the list is a write, and reading it is not", async () => {
  const store = new InMemoryAccountStore();
  // A viewer holds account.view and not account.upsert: they see what
  // customers are filed under, and do not decide it.
  assert.equal((await listIndustries(ctx("viewer", store))).ok, true);
  const r = await upsertIndustry(ctx("viewer", store), { industryCode: "x", name: "X" });
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

test("a model's industry is refused unless the workspace has that industry", async () => {
  const store = new InMemoryAccountStore();
  const c = ctx("sales_rep", store);
  store.seed({ accounts: [account()] });
  const vocab = unwrap(await listIndustries(c));
  const manufacturing = vocab.find((r) => r.industryCode === "manufacturing")!;

  const filled = unwrap(await fillAccountField(c, "acc_1", "industry", "制造"));
  assert.equal(filled.value, "制造");
  assert.equal((await store.getAccount(WS, "acc_1"))?.industryId, manufacturing.id);

  /* THE REFUSAL THIS INCREMENT EXISTS FOR. ask-complete-action's own warning
     says a guessed industry decides the segment and then the playbook; before
     0040 an invented value simply became a new industry, and nothing said so. */
  const invented = await fillAccountField(c, "acc_1", "industry", "元宇宙");
  assert.equal(invented.ok === false && invented.violations[0].code, "industry_unknown");
  assert.equal((await store.getAccount(WS, "acc_1"))?.industryId, manufacturing.id, "unchanged");
});
