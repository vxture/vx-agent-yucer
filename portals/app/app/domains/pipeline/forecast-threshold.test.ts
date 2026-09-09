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

test("reading the bands is not the same authority as setting them", async () => {
  const store = new InMemoryPipelineStore();
  // A rep may read the forecast; the catalog withholds pipeline.forecast from
  // the person who owns the deal, which is exactly the point of that split.
  assert.equal((await forecastThresholds(ctx("sales_rep", store))).ok, true);
  const r = await setForecastThresholds(ctx("sales_rep", store), {
    commitAt: 10,
    bestCaseAt: 5,
    stallDays: 1,
  });
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});
