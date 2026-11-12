import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attainmentHref,
  legacyForecastHref,
  resolveAttainmentQuery,
  revenuePeriods,
  revenuePool,
  revenueTarget,
} from "./attainment-workspace";
import {
  planSnapshot,
  type ForecastableOpportunity,
} from "../../domains/pipeline/lib/forecast";
import type { DataScope } from "../../authz/scope";
import type { SalesTarget } from "../../domains/planning/lib/target";

const workspace = {
  scopeType: "workspace",
  ownerSub: null,
  territoryId: null,
} as const;
const owner = {
  scopeType: "owner",
  ownerSub: "rep_a",
  territoryId: null,
} as const;
const target = (patch: Partial<SalesTarget> = {}): SalesTarget => ({
  ...workspace,
  period: "2026Q4",
  metric: "revenue",
  status: "committed",
  targetValue: { unit: "money", amount: 1000, currency: "CNY" },
  planId: null,
  ...patch,
});
const deal = (
  id: string,
  patch: Partial<ForecastableOpportunity> = {},
): ForecastableOpportunity => ({
  id,
  stage: "negotiate",
  status: "open",
  forecastCategory: "commit",
  amount: { amount: 100, currency: "CNY" },
  territoryId: "east",
  ownerSub: "rep_a",
  accountId: "account_1",
  expectedCloseAt: new Date("2026-12-01"),
  closedAt: null,
  ...patch,
});

test("personal and legacy team scopes resolve to one exact tuple", () => {
  assert.deepEqual(
    resolveAttainmentQuery({ scope: "personal" }, "rep_a").scope,
    owner,
  );
  for (const scope of [undefined, "team", "workspace"])
    assert.deepEqual(
      resolveAttainmentQuery({ scope }, "rep_a").scope,
      workspace,
    );
  assert.deepEqual(
    resolveAttainmentQuery({ scope: "owner:rep_a" }, "rep_b").scope,
    owner,
  );
});

test("all is a browsing state; repeated or invalid query values never select an arbitrary scope or step", () => {
  const q = resolveAttainmentQuery(
    {
      period: ["2026Q4", "2026Q3"],
      scope: ["personal", "workspace"],
      view: ["review", "history"],
    },
    "rep_a",
  );
  assert.equal(q.period, "all");
  assert.equal(q.view, "progress");
  assert.deepEqual(q.scope, workspace);
  assert.equal(
    resolveAttainmentQuery({ period: "not-a-period", view: "bad" }, "rep_a")
      .period,
    "all",
  );
  assert.equal(
    resolveAttainmentQuery({ period: "2024Q3", view: "history" }, "rep_a")
      .period,
    "2024Q3",
  );
});

test("legacy forecast links retain the reporting scope and period and enter review", () => {
  const href = legacyForecastHref(
    { period: "2026Q3", scope: "territory:east" },
    "rep_a",
    "2026Q4",
  );
  const parsed = new URL(href, "http://localhost");
  assert.equal(parsed.pathname, "/attainment");
  assert.equal(parsed.searchParams.get("period"), "2026Q3");
  assert.equal(parsed.searchParams.get("scope"), "territory:east");
  assert.equal(parsed.searchParams.get("view"), "review");
  assert.equal(
    new URL(
      legacyForecastHref({}, "rep_a", "2026Q4"),
      "http://localhost",
    ).searchParams.get("period"),
    "2026Q4",
  );
  assert.equal(
    new URL(
      attainmentHref({ scope: "owner:rep_a&view=history" }),
      "http://localhost",
    ).searchParams.get("view"),
    "progress",
  );
});

test("target selection never substitutes a person, territory, metric, draft or another period", () => {
  const targets = [
    target({ ...owner }),
    target({ metric: "new_logo", targetValue: { unit: "count", amount: 10 } }),
    target({ period: "Y2026" }),
    target({ status: "draft" }),
  ];
  assert.equal(revenueTarget(targets, "2026Q4", workspace), null);
  assert.equal(revenueTarget(targets, "2026Q4", owner), targets[0]);
  const territory = {
    scopeType: "territory",
    territoryId: "east",
    ownerSub: null,
  } as const;
  assert.equal(revenueTarget(targets, "2026Q4", territory), null);
});

test("closed targets remain available for historical review while drafts stay excluded", () => {
  const closed = target({ period: "2025Q4", status: "closed" });
  const draft = target({ period: "2025Q3", status: "draft" });
  assert.equal(revenueTarget([closed, draft], "2025Q4", workspace), closed);
  assert.deepEqual(revenuePeriods([closed, draft], workspace), ["2025Q4"]);
});

test("all periods keep overlapping annual and quarterly targets as separate rows", () => {
  const targets = [
    target(),
    target({ period: "Y2026" }),
    target({ period: "2026Q3" }),
    target({ ...owner, period: "2027Q1" }),
    target({ period: "2026Q3", metric: "pipeline" }),
  ];
  assert.deepEqual(revenuePeriods(targets, workspace), [
    "2026Q4",
    "2026Q3",
    "Y2026",
  ]);
});

test("live coverage inputs match forecast submission for the same period and scope", () => {
  const deals = [
    deal("commit"),
    deal("best", {
      forecastCategory: "best_case",
      amount: { amount: 200, currency: "CNY" },
    }),
    deal("won", {
      forecastCategory: "closed",
      status: "won",
      stage: "won",
      closedAt: new Date("2026-10-03"),
      expectedCloseAt: new Date("2026-03-01"),
    }),
    deal("other-owner", { ownerSub: "rep_b" }),
    deal("next", { expectedCloseAt: new Date("2027-01-01") }),
    deal("lost", {
      status: "lost",
      forecastCategory: "closed",
      stage: "lost",
      closedAt: new Date("2026-10-03"),
    }),
  ];
  const pool = revenuePool(deals, "2026Q4", owner, "CNY")!;
  assert.deepEqual(
    pool.open.map((d) => d.id),
    ["commit", "best"],
  );
  const submitted = planSnapshot({
    opportunities: deals,
    scope: owner,
    period: "2026Q4",
    snapshotAt: new Date("2026-11-11"),
    currency: "CNY",
  });
  assert.equal(submitted.ok, true);
  assert.equal(pool.totals.ok, true);
  if (!submitted.ok || !pool.totals.ok) return;
  for (const key of [
    "closedAmount",
    "commitAmount",
    "bestCaseAmount",
    "pipelineAmount",
  ] as const)
    assert.deepEqual(pool.totals.value[key], submitted.value[key]);
});

test("undated deals are reported within the selected scope and mixed currencies refuse totals", () => {
  const deals = [
    deal("missing", { expectedCloseAt: null }),
    deal("other-missing", { ownerSub: "rep_b", expectedCloseAt: null }),
  ];
  assert.equal(revenuePool(deals, "2026Q4", owner, "CNY")?.undated, 1);
  assert.equal(revenuePool(deals, "all", owner, "CNY"), null);
  const mixed = revenuePool(
    [deal("cny"), deal("usd", { amount: { amount: 100, currency: "USD" } })],
    "2026Q4",
    owner,
    "CNY",
  );
  assert.equal(mixed?.totals.ok, false);
});

test("team progress opens all authorized regions without granting company or other scopes", () => {
  const access: DataScope = {
    kind: "territory",
    territoryIds: ["east", "south"],
    accountIds: [],
    ownerSubs: [],
    unplacedAccountIds: [],
  };
  for (const query of [{}, { scope: "team" }]) {
    const result = resolveAttainmentQuery(query, "rep_a", access);
    assert.equal(result.invalid, false);
    assert.equal(result.teamOverview, true);
    assert.equal(result.selection, "team");
  }
  for (const query of [
    { scope: "workspace" },
    { scope: "territory:west" },
    { scope: "owner:rep_b" },
    { scope: "team", view: "review" },
    { scope: "team", view: "history" },
  ])
    assert.equal(resolveAttainmentQuery(query, "rep_a", access).invalid, true);
  assert.equal(
    resolveAttainmentQuery({ scope: "territory:east" }, "rep_a", access)
      .invalid,
    false,
  );
  assert.equal(
    resolveAttainmentQuery({ view: "history" }, "rep_a", access).selection,
    "personal",
  );
  assert.equal(
    resolveAttainmentQuery({ scope: "team" }, "rep_a", {
      kind: "own",
      sub: "rep_a",
      accountIds: [],
    }).invalid,
    true,
  );
  assert.equal(
    resolveAttainmentQuery({}, "rep_a", {
      kind: "own",
      sub: "rep_a",
      accountIds: [],
    }).selection,
    "personal",
  );
  assert.equal(resolveAttainmentQuery({}, "rep_a").teamOverview, true);
});
