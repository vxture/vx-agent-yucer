import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryPipelineStore } from "./store";
import {
  DEFAULT_FORECAST_THRESHOLDS,
  planForecastThresholds,
  suggestCategory,
  type CategorizableDeal,
} from "./lib/forecast-rule";
import {
  forecastThresholds,
  previewCategories,
  setBusinessFormStallOverride,
  setForecastThresholds,
  type PipelineContext,
} from "./service";

// 预测阈值 - incr/0041, the rule and the two verbs.
//
// The database half (the range CHECKs, the ordered-pair CHECK, the grant that
// leaves workspace_id unwritable) is proved in forecast-threshold.db.test.ts
// against a real Postgres. This file is the half that is a decision: what the
// product refuses, and that the review page actually forecasts against the
// workspace's numbers rather than the build's.

const WS = "ws_ft";
const NOW = new Date("2026-08-31T00:00:00Z");

function ctx(role: RoleCode, store = new InMemoryPipelineStore()): PipelineContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier: "enterprise" },
    store,
  };
}

const deal = (over: Partial<CategorizableDeal> = {}): CategorizableDeal => ({
  id: "opp_1",
  stage: "propose",
  forecastCategory: "pipeline",
  probability: 65,
  expectedCloseAt: new Date("2026-09-20T00:00:00Z"),
  lastStageChangeAt: NOW,
  ...over,
});

// --- The rule ---------------------------------------------------------------

test("the bands have to be orderable, which is a fact about the pair", () => {
  const crossed = planForecastThresholds({ commitAt: 50, bestCaseAt: 50, stallDays: 45 });
  assert.equal(crossed.ok === false && crossed.violations[0].code, "bands_cross");
  const inverted = planForecastThresholds({ commitAt: 40, bestCaseAt: 60, stallDays: 45 });
  assert.equal(inverted.ok === false && inverted.violations[0].code, "bands_cross");
  assert.equal(planForecastThresholds({ commitAt: 90, bestCaseAt: 50, stallDays: 45 }).ok, true);
});

test("each number has a range, and a fraction is not a number here", () => {
  const over = planForecastThresholds({ commitAt: 101, bestCaseAt: 50, stallDays: 45 });
  assert.equal(over.ok === false && over.violations[0].code, "commit_out_of_range");
  const zero = planForecastThresholds({ commitAt: 80, bestCaseAt: 0, stallDays: 45 });
  assert.equal(zero.ok === false && zero.violations[0].code, "best_case_out_of_range");
  const forever = planForecastThresholds({ commitAt: 80, bestCaseAt: 50, stallDays: 400 });
  assert.equal(forever.ok === false && forever.violations[0].code, "stall_out_of_range");
  const fraction = planForecastThresholds({ commitAt: 80.5, bestCaseAt: 50, stallDays: 45 });
  assert.equal(fraction.ok === false && fraction.violations[0].code, "commit_out_of_range");
});

test("the same deal lands in different bands under different thresholds", () => {
  // 65% is best case under the shipped numbers and commit under a workspace
  // that commits at 60 - which is the whole reason this is data.
  const d = deal();
  assert.equal(
    (suggestCategory(d, NOW, DEFAULT_FORECAST_THRESHOLDS) as { category: string }).category,
    "best_case",
  );
  assert.equal(
    (suggestCategory(d, NOW, { commitAt: 60, bestCaseAt: 30, stallDays: 45 }) as { category: string })
      .category,
    "commit",
  );
});

// --- The verbs --------------------------------------------------------------

test("a workspace that has set nothing forecasts against the shipped numbers", async () => {
  const store = new InMemoryPipelineStore();
  assert.deepEqual(unwrap(await forecastThresholds(ctx("sales_leader", store))), DEFAULT_FORECAST_THRESHOLDS);
});

test("what is saved is what the review page then reads", async () => {
  const store = new InMemoryPipelineStore();
  const c = ctx("sales_leader", store);
  unwrap(await setForecastThresholds(c, { commitAt: 60, bestCaseAt: 30, stallDays: 90 }));
  assert.deepEqual(unwrap(await forecastThresholds(c)), {
    commitAt: 60,
    bestCaseAt: 30,
    stallDays: 90,
  });
});

test("the review page reads the workspace's bands, not the build's", async () => {
  const store = new InMemoryPipelineStore();
  const c = ctx("sales_leader", store);
  store.seed([
    {
        id: "opp_1",
        workspaceId: WS,
        opportunityNo: "OPP-1",
        name: "Deal",
        accountId: "acc_1",
        stage: "propose",
        status: "open",
        forecastCategory: "pipeline",
        probability: 65,
        expectedCloseAt: new Date("2026-09-20T00:00:00Z"),
        ownerSub: "usr_me",
      requirement: "wants a thing",
    } as never,
  ]);

  const shipped = unwrap(await previewCategories(c, { now: NOW }));
  assert.equal(
    shipped[0]!.verdict.kind === "suggested" && shipped[0]!.verdict.category,
    "best_case",
  );

  await setForecastThresholds(c, { commitAt: 60, bestCaseAt: 30, stallDays: 45 });
  const theirs = unwrap(await previewCategories(c, { now: NOW }));
  /* THE POINT OF THE WHOLE INCREMENT. Nothing about the deal changed; the
     workspace said where commit starts and the suggestion followed. */
  assert.equal(theirs[0]!.verdict.kind === "suggested" && theirs[0]!.verdict.category, "commit");
});

test("reading the bands needs no permission beyond the page's own; setting them needs the unified /admin/opportunity permission (incr/0063)", async () => {
  // forecastThresholds/setForecastThresholds are exclusively called from
  // /admin/opportunity now, gated on pipeline.opportunityconfig.view/.manage
  // - not pipeline.forecast any more. sales_rep holds the union write
  // permission (it held pipeline.dealType among the six that were merged),
  // so it can set thresholds here even though it never held pipeline.forecast
  // itself; viewer holds neither.
  const store = new InMemoryPipelineStore();
  assert.equal((await forecastThresholds(ctx("sales_rep", store))).ok, true);
  const noAuthority = await setForecastThresholds(ctx("viewer", store), {
    commitAt: 10,
    bestCaseAt: 5,
    stallDays: 1,
  });
  assert.equal(noAuthority.ok === false && noAuthority.violations[0].code, "permission_denied");
  assert.deepEqual(
    unwrap(
      await setForecastThresholds(ctx("sales_rep", store), { commitAt: 10, bestCaseAt: 5, stallDays: 1 }),
    ),
    { commitAt: 10, bestCaseAt: 5, stallDays: 1 },
  );
});

// --- 业务形态的停滞天数覆盖 (incr/0062, moved onto this axis by incr/0067) ----

test("previewCategories follows a deal's own business form override, not the workspace default", async () => {
  const store = new InMemoryPipelineStore();
  const c = ctx("sales_leader", store);
  const form = await store.upsertBusinessForm(WS, {
    businessFormCode: "custom_project",
    name: "项目定制类",
  });
  await store.setBusinessFormStallOverride(WS, form.id, 90);

  store.seed(
    [
      {
        id: "opp_1",
        workspaceId: WS,
        opportunityNo: "OPP-1",
        name: "Deal",
        accountId: "acc_1",
        stage: "propose",
        status: "open",
        forecastCategory: "commit",
        probability: 90,
        expectedCloseAt: new Date("2026-09-20T00:00:00Z"),
        ownerSub: "usr_me",
        requirement: "wants a thing",
        businessFormId: form.id,
      } as never,
    ],
    {
      events: [
        {
          id: "evt_1",
          opportunityId: "opp_1",
          fromStage: null,
          toStage: "propose",
          reason: null,
          actorSub: "usr_me",
          // 60 days ago: past the workspace's own 45-day default, but under
          // this form's own 90-day override.
          occurredAt: new Date(NOW.getTime() - 60 * 86_400_000),
        },
      ],
    },
  );

  const rows = unwrap(await previewCategories(c, { now: NOW }));
  assert.deepEqual(rows[0]!.verdict.kind === "suggested" && rows[0]!.verdict.basis.caps, []);

  // Shorten this form's own override below 60 days: the SAME deal now stalls,
  // even though the workspace default never changed.
  unwrap(await setBusinessFormStallOverride(c, { businessFormId: form.id, stallDaysOverride: 30 }));
  const stalled = unwrap(await previewCategories(c, { now: NOW }));
  assert.deepEqual(
    stalled[0]!.verdict.kind === "suggested" && stalled[0]!.verdict.basis.caps,
    ["stalled"],
  );
});

test("a role with no /admin/opportunity write authority may not set a business form's stall override", async () => {
  // incr/0063 folded this field into the same pipeline.opportunityConfig
  // every other /admin/opportunity write now uses - viewer holds none of the
  // six permissions that were merged, so it still has no authority here.
  const store = new InMemoryPipelineStore();
  const form = await store.upsertBusinessForm(WS, {
    businessFormCode: "custom_project",
    name: "项目定制类",
  });
  const r = await setBusinessFormStallOverride(ctx("viewer", store), {
    businessFormId: form.id,
    stallDaysOverride: 10,
  });
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

test("sales_rep may set it too now - the same unified permission that renames/reorders the form (incr/0063)", async () => {
  // Before incr/0063 this specifically required pipeline.forecast, which
  // sales_rep never held, even though it held the vocabulary's own permission.
  // That split is gone: the whole page shares one write permission now.
  const store = new InMemoryPipelineStore();
  const c = ctx("sales_rep", store);
  const form = await store.upsertBusinessForm(WS, {
    businessFormCode: "custom_project",
    name: "项目定制类",
  });
  const r = unwrap(
    await setBusinessFormStallOverride(c, { businessFormId: form.id, stallDaysOverride: 10 }),
  );
  assert.equal(r.stallDaysOverride, 10);
});
