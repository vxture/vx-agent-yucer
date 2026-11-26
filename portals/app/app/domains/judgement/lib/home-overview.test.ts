import assert from "node:assert/strict";
import { test } from "node:test";
import { overviewPeriod, publishedOverviewMetric, openOpportunityOverview, overviewMarginRate } from "./home-overview";
import type { TargetRecord } from "../../planning/store";
import type { ForecastableOpportunity } from "../../pipeline/lib/forecast";
const now = new Date("2026-11-24T12:00:00Z");
const target = (id: string, patch: Partial<TargetRecord> = {}): TargetRecord => ({
  id, workspaceId: "workspace-a", period: "Y2026", scopeType: "workspace", territoryId: null, ownerSub: null,
  metric: "revenue", targetValue: { unit: "money", amount: 1000, currency: "CNY" }, status: "committed", planId: null, ...patch,
});
test("home chooses one published company scope and never adds regional and personal targets", () => {
  const rows = [target("company"), target("territory", {scopeType:"territory",territoryId:"east"}), target("alice", {scopeType:"owner",ownerSub:"alice"}),
    target("draft", {status:"draft"}), target("old", {period:"Y2025"}), target("quarter", {period:"2026Q4"})];
  assert.deepEqual(overviewPeriod(rows, {kind:"workspace"}, "alice", now).targets.map(t=>t.id), ["company"]);
  assert.deepEqual(overviewPeriod(rows, {kind:"own",sub:"alice",accountIds:[]}, "alice", now).targets.map(t=>t.id), ["alice"]);
  assert.deepEqual(overviewPeriod(rows, {kind:"own",sub:"bob",accountIds:[]}, "bob", now).targets, []);
});
test("period falls back only to an active published period, without adding overlapping quarters", () => {
  const rows = [target("old", {period:"2026Q3"}), target("current", {period:"2026Q4"}), target("future", {period:"Y2027"})];
  assert.equal(overviewPeriod(rows, {kind:"workspace"}, "alice", now).period, "2026Q4");
  assert.deepEqual(overviewPeriod(rows, {kind:"workspace"}, "alice", now).targets.map(t=>t.id), ["current"]);
  assert.equal(overviewPeriod([], {kind:"workspace"}, "alice", now).period, "Y2026");
});
test("published zero, missing goal and missing published measurement remain distinct", () => {
  const t = target("company");
  assert.equal(publishedOverviewMetric([], [], "revenue").state, "missing");
  const unknown = publishedOverviewMetric([{target:t,measurement:{kind:"not_measurable",code:"no_snapshot"}}], [t], "revenue");
  assert.equal(unknown.state, "unmeasured"); assert.equal(unknown.amount, null); assert.equal(unknown.target, 1000);
  const zero = publishedOverviewMetric([{target:t,measurement:{kind:"measured",achieved:{unit:"money",amount:0,currency:"CNY"},ratio:0}}], [t], "revenue");
  assert.equal(zero.state, "ready"); assert.equal(zero.amount, 0);
  assert.equal(publishedOverviewMetric([], [t,target("other")], "revenue").amount, null);
});
test("new customers use the published count, never the registered account total", () => {
  const t = target("new", {metric:"new_logo",targetValue:{unit:"count",amount:12}});
  const metric = publishedOverviewMetric([{target:t,measurement:{kind:"measured",achieved:{unit:"count",amount:3},ratio:25}}], [t], "new_logo");
  assert.deepEqual(metric, {state:"ready",amount:3,target:12,currency:null});
});
test("pipeline support reads its matching published measurement, not all open deals", () => {
  const t = target("pipeline", {metric:"pipeline", targetValue:{unit:"money",amount:3000,currency:"CNY"}});
  const other = target("other", {metric:"pipeline",scopeType:"territory",territoryId:"east"});
  const metric = publishedOverviewMetric([
    {target:other,measurement:{kind:"measured",achieved:{unit:"money",amount:9000,currency:"CNY"},ratio:9}},
    {target:t,measurement:{kind:"measured",achieved:{unit:"money",amount:1200,currency:"CNY"},ratio:0.4}},
  ], [t], "pipeline");
  assert.deepEqual(metric, {state:"ready",amount:1200,target:3000,currency:"CNY"});
});
test("margin rate is an estimate from the matching revenue baseline, never profit attainment", () => {
  const revenue = target("r"), margin = target("m", {metric:"margin",targetValue:{unit:"money",amount:400,currency:"CNY"}});
  assert.equal(overviewMarginRate([revenue,margin]), 0.4);
  assert.equal(overviewMarginRate([revenue,{...margin,targetValue:{unit:"money",amount:0,currency:"CNY"}}]), 0);
  const actual = publishedOverviewMetric([{target:margin,measurement:{kind:"not_measurable",code:"no_cost_data"}}], [revenue,margin], "margin");
  assert.equal(actual.amount, null); assert.equal(actual.target, 400); assert.equal(actual.state, "unmeasured");
  for (const patch of [
    {period:"Y2027"}, {planId:"another-plan"}, {scopeType:"territory" as const}, {ownerSub:"bob"}, {territoryId:"east"},
    {targetValue:{unit:"money" as const,amount:400,currency:"USD"}},
    {targetValue:{unit:"money" as const,amount:1200,currency:"CNY"}},
  ]) assert.equal(overviewMarginRate([revenue,{...margin,...patch}]), null);
  assert.equal(overviewMarginRate([margin]), null);
  assert.equal(overviewMarginRate([revenue,margin,target("duplicate")]), null);
  assert.equal(overviewMarginRate([{...revenue,targetValue:{unit:"money",amount:0,currency:"CNY"}},margin]), null);
});
const deal = (id: string, patch: Partial<ForecastableOpportunity> = {}): ForecastableOpportunity => ({id,stage:"qualify",status:"open",forecastCategory:"pipeline",amount:{amount:0.1,currency:"CNY"},territoryId:null,ownerSub:"alice",...patch});
test("opportunity amounts keep currencies separate, retain missing amounts and exclude closed outcomes", () => {
  const rows = [deal("a"),deal("b",{amount:{amount:0.2,currency:"CNY"}}),deal("usd",{amount:{amount:80,currency:"USD"}}),deal("unknown",{amount:null}),
    deal("won",{status:"won",stage:"won"}),deal("lost",{status:"lost",stage:"lost"})];
  const summary = openOpportunityOverview(rows);
  assert.equal(summary.count, 4); assert.equal(summary.missingAmounts, 1);
  assert.deepEqual(summary.amounts, [{currency:"CNY",amount:0.3},{currency:"USD",amount:80}]);
  assert.deepEqual(openOpportunityOverview([]), {count:0,missingAmounts:0,amounts:[]});
});
