import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryCatalogStore, type CatalogStore } from "../catalog/store";
import { InMemoryPipelineStore, type DealTypeRecord } from "./store";
import { planDealType, planDealTypeRemoval, planDealTypeStallOverride } from "./lib/deal-type-vocab";
import {
  createOpportunity,
  dealTypeUsage,
  listDealTypes,
  moveDealType,
  removeDealType,
  updateCommercialTerms,
  upsertDealType,
  type PipelineContext,
} from "./service";

// 商机类型 - incr/0060-0061, the vocabulary rules and the five service verbs.
//
// The database half (the composite... actually a plain uuid FK - the CHECK-
// free shape, the ON DELETE RESTRICT, the column grant) is proved in
// deal-type.db.test.ts against a real Postgres. This file is the half that is
// a decision: what the product refuses, who may see and who may edit the
// catalog, and that a deal's type can be set at creation and changed later.

const WS = "ws_dealtype";

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

function row(over: Partial<DealTypeRecord> = {}): DealTypeRecord {
  return {
    id: "dtp_1",
    workspaceId: WS,
    dealTypeCode: "new_logo",
    name: "新签",
    sortOrder: 1,
    stallDaysOverride: null,
    ...over,
  };
}

// --- The rule: planDealType ---------------------------------------------------

test("a deal type needs a code and a name", () => {
  const noCode = planDealType({ dealTypeCode: "  ", name: "新签" });
  assert.equal(noCode.ok === false && noCode.violations[0].code, "code_required");
  const noName = planDealType({ dealTypeCode: "new_logo", name: " " });
  assert.equal(noName.ok === false && noName.violations[0].code, "name_required");
});

test("a valid draft trims both fields", () => {
  const r = planDealType({ dealTypeCode: " new_logo ", name: " 新签 " });
  assert.ok(r.ok);
  assert.equal(r.ok && r.value.dealTypeCode, "new_logo");
  assert.equal(r.ok && r.value.name, "新签");
});

// --- The rule: planDealTypeRemoval ---------------------------------------------

test("a type with opportunities filed under it cannot be removed", () => {
  const r = planDealTypeRemoval(3);
  assert.equal(r.ok === false && r.violations[0].code, "deal_type_in_use");
});

test("an unused type may always be removed - there is no last-one restriction", () => {
  const r = planDealTypeRemoval(0);
  assert.ok(r.ok);
});

// --- The rule: planDealTypeStallOverride (incr/0062) ---------------------------

test("null clears the override and is always ok", () => {
  const r = planDealTypeStallOverride(null);
  assert.ok(r.ok);
  assert.equal(r.ok && r.value, null);
});

test("a stall override outside 1-365 is refused", () => {
  const zero = planDealTypeStallOverride(0);
  assert.equal(zero.ok === false && zero.violations[0].code, "stall_override_out_of_range");
  const tooLong = planDealTypeStallOverride(366);
  assert.equal(tooLong.ok === false && tooLong.violations[0].code, "stall_override_out_of_range");
});

test("a stall override within 1-365 is accepted as-is", () => {
  const low = planDealTypeStallOverride(1);
  assert.equal(low.ok && low.value, 1);
  const high = planDealTypeStallOverride(365);
  assert.equal(high.ok && high.value, 365);
});

// --- listDealTypes: gate and first-contact seeding -----------------------------

test("viewing the catalog needs pipeline.dealType.view - it resolves to pipeline.read", async () => {
  const r = await listDealTypes(ctx("sales_rep", "free"));
  assert.ok(r.ok);
});

test("a holder with no permissions at all cannot view the catalog", async () => {
  const bare: PipelineContext & { catalog: CatalogStore } = {
    ...ctx("sales_rep", "free"),
    holder: { permissions: new Set() },
  };
  const r = await listDealTypes(bare);
  assert.equal(r.ok, false);
});

test("an empty workspace reads back the shipped five, seeded on first contact", async () => {
  const store = new InMemoryPipelineStore();
  const r = unwrap(await listDealTypes(ctx("sales_manager", "enterprise", store)));
  assert.deepEqual(
    r.map((d) => d.dealTypeCode),
    ["new_logo", "renewal", "expansion", "project", "product"],
  );
  const again = unwrap(await listDealTypes(ctx("sales_manager", "enterprise", store)));
  assert.equal(again.length, 5);
});

test("a workspace that already has types keeps them - seeding never overwrites", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([], { dealTypes: [row({ dealTypeCode: "custom", name: "自定义" })] });
  const r = unwrap(await listDealTypes(ctx("sales_manager", "enterprise", store)));
  assert.deepEqual(r.map((d) => d.dealTypeCode), ["custom"]);
});

// --- upsertDealType: gate and validation ----------------------------------------

test("editing the catalog needs pipeline.dealType.manage - held broadly, including by sales_rep", async () => {
  const store = new InMemoryPipelineStore();
  const allowed = await upsertDealType(ctx("sales_rep", "enterprise", store), {
    code: "new_logo",
    name: "新签",
  });
  assert.ok(allowed.ok, "sales_rep holds pipeline.dealType - classifying a deal is part of owning it");
});

test("a viewer without pipeline.dealType may not write", async () => {
  const denied = await upsertDealType(ctx("viewer", "enterprise"), {
    code: "new_logo",
    name: "新签",
  });
  assert.equal(denied.ok, false);
});

test("an invalid draft is refused before it reaches the store", async () => {
  const r = await upsertDealType(ctx("sales_manager", "enterprise"), { code: "  ", name: "新签" });
  assert.equal(r.ok === false && r.violations[0].code, "code_required");
});

// --- moveDealType ---------------------------------------------------------------

test("reordering the catalog needs pipeline.dealType too", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([], {
    dealTypes: [
      row({ id: "d1", dealTypeCode: "a", sortOrder: 1 }),
      row({ id: "d2", dealTypeCode: "b", sortOrder: 2 }),
    ],
  });
  const denied = await moveDealType(ctx("viewer", "enterprise", store), { dealTypeId: "d2", direction: "up" });
  assert.equal(denied.ok, false);

  const moved = await moveDealType(ctx("sales_manager", "enterprise", store), { dealTypeId: "d2", direction: "up" });
  assert.ok(moved.ok);
  const after = unwrap(await listDealTypes(ctx("sales_manager", "enterprise", store)));
  assert.deepEqual(after.map((d) => d.dealTypeCode), ["b", "a"]);
});

// --- removeDealType ---------------------------------------------------------------

test("removing a type in use is refused, through the store's own count", async () => {
  const store = new InMemoryPipelineStore();
  store.seed(
    [
      {
        id: "opp_1",
        workspaceId: WS,
        opportunityNo: "OPP-1",
        name: "Deal",
        accountId: "acc_1",
        planId: null,
        campaignId: null,
        territoryId: null,
        ownerSub: "usr_rep",
        requirement: "req",
        sourceProjectId: null,
        dealTypeId: "d1",
        stage: "qualify",
        forecastCategory: "pipeline",
        amount: money(1),
        probability: 10,
        expectedCloseAt: null,
        closedAt: null,
        status: "open",
        currency: "CNY",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    { dealTypes: [row({ id: "d1" })] },
  );
  const r = await removeDealType(ctx("sales_manager", "enterprise", store), { dealTypeId: "d1" });
  assert.equal(r.ok === false && r.violations[0].code, "deal_type_in_use");
});

test("removing an unused type succeeds and a second read no longer shows it", async () => {
  // Two rows seeded, not one - removing down to a genuinely empty list would
  // trigger listDealTypes' own first-contact reseeding and this test would be
  // asserting against the shipped five instead of an empty catalog.
  const store = new InMemoryPipelineStore();
  store.seed([], {
    dealTypes: [row({ id: "d1" }), row({ id: "d2", dealTypeCode: "renewal", name: "续费", sortOrder: 2 })],
  });
  const managerCtx = ctx("sales_manager", "enterprise", store);
  const removed = await removeDealType(managerCtx, { dealTypeId: "d1" });
  assert.ok(removed.ok);
  const after = unwrap(await listDealTypes(managerCtx));
  assert.deepEqual(after.map((d) => d.dealTypeCode), ["renewal"]);
});

// --- dealTypeUsage -----------------------------------------------------------------

test("usage counts opportunities per type, by id", async () => {
  const store = new InMemoryPipelineStore();
  store.seed(
    [
      {
        id: "opp_1", workspaceId: WS, opportunityNo: "OPP-1", name: "Deal 1", accountId: "acc_1",
        planId: null, campaignId: null, territoryId: null, ownerSub: "usr_rep", requirement: "req",
        sourceProjectId: null, dealTypeId: "d1", stage: "qualify", forecastCategory: "pipeline",
        amount: money(1), probability: 10, expectedCloseAt: null, closedAt: null, status: "open",
        currency: "CNY", createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: "opp_2", workspaceId: WS, opportunityNo: "OPP-2", name: "Deal 2", accountId: "acc_1",
        planId: null, campaignId: null, territoryId: null, ownerSub: "usr_rep", requirement: "req",
        sourceProjectId: null, dealTypeId: null, stage: "qualify", forecastCategory: "pipeline",
        amount: money(1), probability: 10, expectedCloseAt: null, closedAt: null, status: "open",
        currency: "CNY", createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    { dealTypes: [row({ id: "d1" }), row({ id: "d2", dealTypeCode: "renewal", name: "续费", sortOrder: 2 })] },
  );
  const usage = unwrap(await dealTypeUsage(ctx("sales_manager", "enterprise", store)));
  assert.equal(usage.d1, 1);
  assert.equal(usage.d2, 0);
});

// --- createOpportunity / updateCommercialTerms thread dealTypeId ------------------

test("createOpportunity accepts an optional deal type, absent by default", async () => {
  const store = new InMemoryPipelineStore();
  const noType = unwrap(
    await createOpportunity(ctx("sales_rep", "free", store), {
      name: "Untyped deal",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: "usr_rep",
      requirement: "req",
      amount: null,
      expectedCloseAt: null,
    }),
  );
  assert.equal(noType.dealTypeId, null);

  const typed = unwrap(
    await createOpportunity(ctx("sales_rep", "free", store), {
      name: "Typed deal",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: "usr_rep",
      requirement: "req",
      amount: null,
      expectedCloseAt: null,
      dealTypeId: "dtp_renewal",
    }),
  );
  assert.equal(typed.dealTypeId, "dtp_renewal");
});

test("a deal's type may be set or changed after creation, through updateCommercialTerms", async () => {
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
    }),
  );
  assert.equal(created.dealTypeId, null);

  const updated = unwrap(
    await updateCommercialTerms(ctx("sales_rep", "free", store), created.id, { dealTypeId: "dtp_project" }),
  );
  assert.equal(updated.dealTypeId, "dtp_project");
});
