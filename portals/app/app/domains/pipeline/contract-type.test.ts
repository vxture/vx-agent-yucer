import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryCatalogStore, type CatalogStore } from "../catalog/store";
import { InMemoryPipelineStore, type ContractTypeRecord } from "./store";
import { planContractType, planContractTypeRemoval } from "./lib/contract-type-vocab";
import { suggestContractType } from "./lib/opportunity";
import {
  contractTypeUsage,
  createOpportunity,
  listContractTypes,
  moveContractType,
  removeContractType,
  updateCommercialTerms,
  upsertContractType,
  type PipelineContext,
} from "./service";

// 签约类型 - incr/0067, one of the two axes 商机类型 split into.
//
// The database half (the uuid FK, the ON DELETE RESTRICT, the column grant) is
// proved in contract-type.db.test.ts against a real Postgres. This file is the
// half that is a decision: what the product refuses, who may see and who may
// edit the catalog, and - the part that is new with the split - what a deal
// gets classified as when nobody says.

const WS = "ws_contracttype";

function ctx(
  role: RoleCode,
  tier: Entitlement["tier"],
  store = new InMemoryPipelineStore(),
): PipelineContext & { catalog: CatalogStore } {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
    catalog: new InMemoryCatalogStore(),
  };
}

function row(over: Partial<ContractTypeRecord> = {}): ContractTypeRecord {
  return {
    id: "ctp_1",
    workspaceId: WS,
    contractTypeCode: "new_logo",
    name: "新签",
    sortOrder: 1,
    ...over,
  };
}

const deal = (over: Record<string, unknown> = {}) => ({
  id: "opp_1", workspaceId: WS, opportunityNo: "OPP-1", name: "Deal", accountId: "acc_1",
  planId: null, campaignId: null, territoryId: null, ownerSub: "usr_rep", requirement: "req",
  sourceProjectId: null, contractTypeId: null, businessFormId: null, stage: "qualify",
  forecastCategory: "pipeline", amount: money(1), probability: 10, expectedCloseAt: null,
  closedAt: null, status: "open", currency: "CNY", createdAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

// --- The rules ----------------------------------------------------------------

test("a contract type needs a code and a name", () => {
  const noCode = planContractType({ contractTypeCode: "  ", name: "新签" });
  assert.equal(noCode.ok === false && noCode.violations[0].code, "code_required");
  const noName = planContractType({ contractTypeCode: "new_logo", name: " " });
  assert.equal(noName.ok === false && noName.violations[0].code, "name_required");
});

test("a valid draft trims both fields", () => {
  const r = planContractType({ contractTypeCode: " new_logo ", name: " 新签 " });
  assert.equal(r.ok && r.value.contractTypeCode, "new_logo");
  assert.equal(r.ok && r.value.name, "新签");
});

test("a type with opportunities filed under it cannot be removed", () => {
  const r = planContractTypeRemoval(3);
  assert.equal(r.ok === false && r.violations[0].code, "contract_type_in_use");
});

test("an unused type may always be removed - there is no last-one restriction", () => {
  assert.ok(planContractTypeRemoval(0).ok);
});

// --- suggestContractType: what a new deal is, when nobody said ------------------

test("a deal derived from a delivered project is a renewal, whatever the account's history", () => {
  // THE FIX FOR THE SILENT GAP: /renewal opened a deal whose renewal-ness was
  // recorded only in sourceProjectId, and a rep had to tag it a second time.
  assert.equal(
    suggestContractType({ fromRenewal: true, accountHasPriorWin: false }),
    "renewal",
  );
  assert.equal(
    suggestContractType({ fromRenewal: true, accountHasPriorWin: true }),
    "renewal",
  );
});

test("an account nobody has won before is new business; one already won is expansion", () => {
  assert.equal(suggestContractType({ fromRenewal: false, accountHasPriorWin: false }), "new_logo");
  assert.equal(suggestContractType({ fromRenewal: false, accountHasPriorWin: true }), "expansion");
});

// --- listContractTypes: gate and first-contact seeding --------------------------

test("viewing the catalog resolves to pipeline.read", async () => {
  assert.ok((await listContractTypes(ctx("sales_rep", "free"))).ok);
});

test("a holder with no permissions at all cannot view the catalog", async () => {
  const bare: PipelineContext & { catalog: CatalogStore } = {
    ...ctx("sales_rep", "free"),
    holder: { permissions: new Set() },
  };
  assert.equal((await listContractTypes(bare)).ok, false);
});

test("an empty workspace reads back the shipped three, seeded on first contact", async () => {
  const store = new InMemoryPipelineStore();
  const r = unwrap(await listContractTypes(ctx("sales_manager", "enterprise", store)));
  assert.deepEqual(
    r.map((c) => c.contractTypeCode),
    ["new_logo", "renewal", "expansion"],
  );
  assert.equal(unwrap(await listContractTypes(ctx("sales_manager", "enterprise", store))).length, 3);
});

test("a workspace that already has types keeps them - seeding never overwrites", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([], { contractTypes: [row({ contractTypeCode: "custom", name: "自定义" })] });
  const r = unwrap(await listContractTypes(ctx("sales_manager", "enterprise", store)));
  assert.deepEqual(r.map((c) => c.contractTypeCode), ["custom"]);
});

// --- the write verbs ------------------------------------------------------------

test("editing the catalog rides /admin/opportunity's own permission, held including by sales_rep", async () => {
  const store = new InMemoryPipelineStore();
  const allowed = await upsertContractType(ctx("sales_rep", "enterprise", store), {
    code: "new_logo",
    name: "新签",
  });
  assert.ok(allowed.ok);
});

test("a viewer may not write", async () => {
  const denied = await upsertContractType(ctx("viewer", "enterprise"), {
    code: "new_logo",
    name: "新签",
  });
  assert.equal(denied.ok, false);
});

test("an invalid draft is refused before it reaches the store", async () => {
  const r = await upsertContractType(ctx("sales_manager", "enterprise"), { code: "  ", name: "新签" });
  assert.equal(r.ok === false && r.violations[0].code, "code_required");
});

test("reordering the catalog needs the same permission", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([], {
    contractTypes: [
      row({ id: "c1", contractTypeCode: "a", sortOrder: 1 }),
      row({ id: "c2", contractTypeCode: "b", sortOrder: 2 }),
    ],
  });
  const denied = await moveContractType(ctx("viewer", "enterprise", store), {
    contractTypeId: "c2",
    direction: "up",
  });
  assert.equal(denied.ok, false);

  const moved = await moveContractType(ctx("sales_manager", "enterprise", store), {
    contractTypeId: "c2",
    direction: "up",
  });
  assert.ok(moved.ok);
  const after = unwrap(await listContractTypes(ctx("sales_manager", "enterprise", store)));
  assert.deepEqual(after.map((c) => c.contractTypeCode), ["b", "a"]);
});

test("removing a type in use is refused, through the store's own count", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([deal({ contractTypeId: "c1" }) as never], { contractTypes: [row({ id: "c1" })] });
  const r = await removeContractType(ctx("sales_manager", "enterprise", store), {
    contractTypeId: "c1",
  });
  assert.equal(r.ok === false && r.violations[0].code, "contract_type_in_use");
});

test("removing an unused type succeeds and a second read no longer shows it", async () => {
  // Two rows seeded, not one - removing down to a genuinely empty list would
  // trigger the first-contact reseeding and this test would be asserting
  // against the shipped three instead of an empty catalog.
  const store = new InMemoryPipelineStore();
  store.seed([], {
    contractTypes: [
      row({ id: "c1" }),
      row({ id: "c2", contractTypeCode: "renewal", name: "续签", sortOrder: 2 }),
    ],
  });
  const managerCtx = ctx("sales_manager", "enterprise", store);
  assert.ok((await removeContractType(managerCtx, { contractTypeId: "c1" })).ok);
  const after = unwrap(await listContractTypes(managerCtx));
  assert.deepEqual(after.map((c) => c.contractTypeCode), ["renewal"]);
});

test("usage counts opportunities per type, by id", async () => {
  const store = new InMemoryPipelineStore();
  store.seed(
    [
      deal({ id: "opp_1", contractTypeId: "c1" }) as never,
      deal({ id: "opp_2", opportunityNo: "OPP-2", contractTypeId: null }) as never,
    ],
    {
      contractTypes: [
        row({ id: "c1" }),
        row({ id: "c2", contractTypeCode: "renewal", name: "续签", sortOrder: 2 }),
      ],
    },
  );
  const usage = unwrap(await contractTypeUsage(ctx("sales_manager", "enterprise", store)));
  assert.equal(usage.c1, 1);
  assert.equal(usage.c2, 0);
});

// --- createOpportunity: the default, and the caller who overrules it -------------

test("a deal for an account with no wins is created as 新签, without anybody choosing", async () => {
  const store = new InMemoryPipelineStore();
  const created = unwrap(
    await createOpportunity(ctx("sales_rep", "free", store), {
      name: "First deal",
      accountId: "acc_new",
      territoryId: null,
      ownerSub: "usr_rep",
      requirement: "req",
      amount: null,
      expectedCloseAt: null,
    }),
  );
  const types = unwrap(await listContractTypes(ctx("sales_rep", "free", store)));
  const newLogo = types.find((t) => t.contractTypeCode === "new_logo")!;
  assert.equal(created.contractTypeId, newLogo.id);
});

test("a deal for an account already won is created as 增购", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([deal({ id: "opp_won", accountId: "acc_1", status: "won" }) as never]);
  const created = unwrap(
    await createOpportunity(ctx("sales_rep", "free", store), {
      name: "Second deal",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: "usr_rep",
      requirement: "req",
      amount: null,
      expectedCloseAt: null,
    }),
  );
  const types = unwrap(await listContractTypes(ctx("sales_rep", "free", store)));
  assert.equal(created.contractTypeId, types.find((t) => t.contractTypeCode === "expansion")!.id);
});

test("a deal derived from a project is created as 续签 - the renewal queue no longer needs a second tag", async () => {
  const store = new InMemoryPipelineStore();
  const created = unwrap(
    await createOpportunity(ctx("sales_rep", "free", store), {
      name: "Renewal deal",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: "usr_rep",
      requirement: "req",
      amount: null,
      expectedCloseAt: null,
      sourceProjectId: "prj_1",
    }),
  );
  const types = unwrap(await listContractTypes(ctx("sales_rep", "free", store)));
  assert.equal(created.contractTypeId, types.find((t) => t.contractTypeCode === "renewal")!.id);
});

test("a caller who names a type keeps it, including one who names null", async () => {
  // The default fills an ABSENT field. It does not overrule an answer, and
  // "no type" is an answer.
  const store = new InMemoryPipelineStore();
  const explicit = unwrap(
    await createOpportunity(ctx("sales_rep", "free", store), {
      name: "Explicit deal",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: "usr_rep",
      requirement: "req",
      amount: null,
      expectedCloseAt: null,
      contractTypeId: "ctp_chosen",
    }),
  );
  assert.equal(explicit.contractTypeId, "ctp_chosen");

  const blank = unwrap(
    await createOpportunity(ctx("sales_rep", "free", store), {
      name: "Deliberately unclassified",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: "usr_rep",
      requirement: "req",
      amount: null,
      expectedCloseAt: null,
      contractTypeId: null,
    }),
  );
  assert.equal(blank.contractTypeId, null);
});

test("a deal's type may be changed after creation, through updateCommercialTerms", async () => {
  const store = new InMemoryPipelineStore();
  const created = unwrap(
    await createOpportunity(ctx("sales_rep", "free", store), {
      name: "Deal",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: "usr_rep",
      requirement: "req",
      amount: null,
      expectedCloseAt: null,
      contractTypeId: null,
    }),
  );
  const updated = unwrap(
    await updateCommercialTerms(ctx("sales_rep", "free", store), created.id, {
      contractTypeId: "ctp_renewal",
    }),
  );
  assert.equal(updated.contractTypeId, "ctp_renewal");
});
