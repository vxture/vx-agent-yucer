import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryCatalogStore, type CatalogStore } from "../catalog/store";
import { InMemoryPipelineStore, type BusinessFormRecord } from "./store";
import {
  planBusinessForm,
  planBusinessFormRemoval,
  planBusinessFormStallOverride,
} from "./lib/business-form-vocab";
import {
  businessFormUsage,
  createOpportunity,
  listBusinessForms,
  moveBusinessForm,
  removeBusinessForm,
  updateCommercialTerms,
  upsertBusinessForm,
  type PipelineContext,
} from "./service";

// 业务形态 - incr/0067, the other axis 商机类型 split into.
//
// The stall-days override rides this vocabulary now (incr/0062 put it on the
// conflated one). What that number DOES is proved in forecast-threshold.test.ts;
// this file proves the catalog around it.

const WS = "ws_businessform";

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

function row(over: Partial<BusinessFormRecord> = {}): BusinessFormRecord {
  return {
    id: "bfm_1",
    workspaceId: WS,
    businessFormCode: "custom_project",
    name: "项目定制类",
    sortOrder: 1,
    stallDaysOverride: null,
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

test("a business form needs a code and a name", () => {
  const noCode = planBusinessForm({ businessFormCode: "  ", name: "项目定制类" });
  assert.equal(noCode.ok === false && noCode.violations[0].code, "code_required");
  const noName = planBusinessForm({ businessFormCode: "custom_project", name: " " });
  assert.equal(noName.ok === false && noName.violations[0].code, "name_required");
});

test("a valid draft trims both fields", () => {
  const r = planBusinessForm({ businessFormCode: " custom_project ", name: " 项目定制类 " });
  assert.equal(r.ok && r.value.businessFormCode, "custom_project");
  assert.equal(r.ok && r.value.name, "项目定制类");
});

test("a form with opportunities filed under it cannot be removed", () => {
  const r = planBusinessFormRemoval(3);
  assert.equal(r.ok === false && r.violations[0].code, "business_form_in_use");
});

test("an unused form may always be removed", () => {
  assert.ok(planBusinessFormRemoval(0).ok);
});

test("null clears the stall override and is always ok", () => {
  const r = planBusinessFormStallOverride(null);
  assert.equal(r.ok && r.value, null);
});

test("a stall override outside 1-365 is refused", () => {
  const zero = planBusinessFormStallOverride(0);
  assert.equal(zero.ok === false && zero.violations[0].code, "stall_override_out_of_range");
  const tooLong = planBusinessFormStallOverride(366);
  assert.equal(tooLong.ok === false && tooLong.violations[0].code, "stall_override_out_of_range");
});

test("a stall override within 1-365 is accepted as-is", () => {
  const low = planBusinessFormStallOverride(1);
  assert.equal(low.ok && low.value, 1);
  const high = planBusinessFormStallOverride(365);
  assert.equal(high.ok && high.value, 365);
});

// --- listBusinessForms: gate and first-contact seeding --------------------------

test("viewing the catalog resolves to pipeline.read", async () => {
  assert.ok((await listBusinessForms(ctx("sales_rep", "free"))).ok);
});

test("a holder with no permissions at all cannot view the catalog", async () => {
  const bare: PipelineContext & { catalog: CatalogStore } = {
    ...ctx("sales_rep", "free"),
    holder: { permissions: new Set() },
  };
  assert.equal((await listBusinessForms(bare)).ok, false);
});

test("an empty workspace reads back the shipped three, 咨询服务类 among them", async () => {
  // The third value is NEW with the split: advisory work is neither a bespoke
  // build nor a catalogue sale, and the old five had nowhere to put it.
  const store = new InMemoryPipelineStore();
  const r = unwrap(await listBusinessForms(ctx("sales_manager", "enterprise", store)));
  assert.deepEqual(
    r.map((b) => b.businessFormCode),
    ["custom_project", "standard_product", "consulting"],
  );
});

test("a workspace that already has forms keeps them - seeding never overwrites", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([], { businessForms: [row({ businessFormCode: "custom", name: "自定义" })] });
  const r = unwrap(await listBusinessForms(ctx("sales_manager", "enterprise", store)));
  assert.deepEqual(r.map((b) => b.businessFormCode), ["custom"]);
});

// --- the write verbs ------------------------------------------------------------

test("editing the catalog rides /admin/opportunity's own permission", async () => {
  const store = new InMemoryPipelineStore();
  const allowed = await upsertBusinessForm(ctx("sales_rep", "enterprise", store), {
    code: "custom_project",
    name: "项目定制类",
  });
  assert.ok(allowed.ok);
  const denied = await upsertBusinessForm(ctx("viewer", "enterprise"), {
    code: "custom_project",
    name: "项目定制类",
  });
  assert.equal(denied.ok, false);
});

test("an invalid draft is refused before it reaches the store", async () => {
  const r = await upsertBusinessForm(ctx("sales_manager", "enterprise"), {
    code: "  ",
    name: "项目定制类",
  });
  assert.equal(r.ok === false && r.violations[0].code, "code_required");
});

test("a rename leaves the stall override alone - the two are separate writes", async () => {
  // upsertBusinessForm's input type excludes stallDaysOverride, so the
  // rename path structurally cannot clear a number the other verb owns.
  const store = new InMemoryPipelineStore();
  store.seed([], { businessForms: [row({ id: "b1", stallDaysOverride: 90 })] });
  const c = ctx("sales_manager", "enterprise", store);
  unwrap(await upsertBusinessForm(c, { code: "custom_project", name: "大型定制" }));
  const after = unwrap(await listBusinessForms(c));
  assert.equal(after[0]!.name, "大型定制");
  assert.equal(after[0]!.stallDaysOverride, 90);
});

test("reordering the catalog needs the same permission", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([], {
    businessForms: [
      row({ id: "b1", businessFormCode: "a", sortOrder: 1 }),
      row({ id: "b2", businessFormCode: "b", sortOrder: 2 }),
    ],
  });
  const denied = await moveBusinessForm(ctx("viewer", "enterprise", store), {
    businessFormId: "b2",
    direction: "up",
  });
  assert.equal(denied.ok, false);

  assert.ok(
    (
      await moveBusinessForm(ctx("sales_manager", "enterprise", store), {
        businessFormId: "b2",
        direction: "up",
      })
    ).ok,
  );
  const after = unwrap(await listBusinessForms(ctx("sales_manager", "enterprise", store)));
  assert.deepEqual(after.map((b) => b.businessFormCode), ["b", "a"]);
});

test("removing a form in use is refused, through the store's own count", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([deal({ businessFormId: "b1" }) as never], { businessForms: [row({ id: "b1" })] });
  const r = await removeBusinessForm(ctx("sales_manager", "enterprise", store), {
    businessFormId: "b1",
  });
  assert.equal(r.ok === false && r.violations[0].code, "business_form_in_use");
});

test("usage counts opportunities per form, by id", async () => {
  const store = new InMemoryPipelineStore();
  store.seed(
    [
      deal({ id: "opp_1", businessFormId: "b1" }) as never,
      deal({ id: "opp_2", opportunityNo: "OPP-2", businessFormId: null }) as never,
    ],
    {
      businessForms: [
        row({ id: "b1" }),
        row({ id: "b2", businessFormCode: "standard_product", name: "标化产品类", sortOrder: 2 }),
      ],
    },
  );
  const usage = unwrap(await businessFormUsage(ctx("sales_manager", "enterprise", store)));
  assert.equal(usage.b1, 1);
  assert.equal(usage.b2, 0);
});

// --- the opportunity's own field -------------------------------------------------

test("a deal's form is absent unless somebody says - nothing in the record can guess it", async () => {
  // Deliberately UNLIKE 签约类型, which is defaulted from the account's own
  // history: what is being sold is not derivable from anything the product
  // holds at creation.
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
  assert.equal(created.businessFormId, null);

  const updated = unwrap(
    await updateCommercialTerms(ctx("sales_rep", "free", store), created.id, {
      businessFormId: "bfm_consulting",
    }),
  );
  assert.equal(updated.businessFormId, "bfm_consulting");
});
