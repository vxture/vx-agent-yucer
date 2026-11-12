import { test } from "node:test";
import assert from "node:assert/strict";
import { executionRow, reportedAttainment } from "./attainment-progress";
import { resolveAttainmentQuery, revenueTarget } from "./attainment-workspace";
import { canReadReportingScope } from "../../authz/forecast-scope";
import type { AttainmentTarget } from "../../domains/planning/attainment-plan";
import {
  planSnapshot,
  attainmentReportPoint,
  type ForecastableOpportunity,
} from "../../domains/pipeline/lib/forecast";

const target: AttainmentTarget = {
  key: "target",
  scope: "workspace",
  period: "Y2026",
  currency: "CNY",
  target: 800,
  floor: 600,
  stretch: 1200,
  baseline: 1000,
  baselineComparable: true,
  source: "sales_plan",
  revision: { id: "v2", version: 2, effectiveAt: "2026-07-01T00:00:00Z" },
};
const deal: ForecastableOpportunity = {
  id: "won",
  accountId: "ac",
  stage: "won",
  status: "won",
  forecastCategory: "closed",
  amount: { amount: 400, currency: "CNY" },
  ownerSub: "me",
  territoryId: "east",
  expectedCloseAt: null,
  closedAt: new Date("2026-07-01"),
};
const row = (patch: Partial<Parameters<typeof executionRow>[0]> = {}) =>
  executionRow({
    name: "Company",
    period: "Y2026",
    scope: "workspace",
    target,
    deals: [deal],
    defaultCurrency: "CNY",
    ...patch,
  });

test("current progress uses V2 while a reported V1 result remains 40 percent", () => {
  const snapshot = planSnapshot({
    period: "Y2026",
    scope: { scopeType: "workspace", ownerSub: null, territoryId: null },
    opportunities: [deal],
    currency: "CNY",
  });
  assert.ok(snapshot.ok);
  snapshot.value.targetBasis = [
    {
      metric: "revenue",
      sourceKind: "sales_plan",
      revisionId: "v1",
      lineKey: "t",
      legacyTargetId: null,
      version: 1,
      target: "1000",
      currency: "CNY",
      resolvedAt: "2026-01-01T00:00:00Z",
    },
  ];
  assert.equal(row().ratio, 0.5);
  const report = attainmentReportPoint(
    { ...snapshot.value, callNote: "Manager-only note" },
    true,
  );
  assert.equal(reportedAttainment(report).ratio, 0.4);
  assert.equal("callNote" in report || "commitAmount" in report, false);
  assert.equal(attainmentReportPoint(snapshot.value, false).basis, null);
  assert.equal(row().gap, 400);
});

test("zero, no quota, read failure and mixed currencies never invent an attainment rate", () => {
  assert.equal(row({ target: { ...target, target: 0 } }).ratio, null);
  assert.equal(row({ target: null }).ratio, null);
  assert.equal(row({ deals: null }).closed, null);
  const mixed = row({
    deals: [
      deal,
      { ...deal, id: "usd", amount: { amount: 100, currency: "USD" } },
    ],
  });
  assert.equal(mixed.closed, null);
  assert.equal(mixed.ratio, null);
  assert.equal(mixed.error, true);
});

test("unassigned individual quota stays missing even when a region has a target", () => {
  const personal = row({ scope: "owner:me", target: null });
  assert.equal(personal.closed, 400);
  assert.equal(personal.gap, null);
  assert.equal(
    revenueTarget(
      [
        {
          ...target,
          scopeType: "workspace",
          territoryId: null,
          ownerSub: null,
          metric: "revenue",
          targetValue: { unit: "money", amount: 800, currency: "CNY" },
          status: "committed",
          planId: null,
        },
      ],
      "2026",
      { scopeType: "workspace", territoryId: null, ownerSub: null },
    )?.targetValue.amount,
    800,
  );
});

test("reporting scope denies company aggregates even when individual shared rows are visible", () => {
  const own = { kind: "own" as const, sub: "me", accountIds: ["shared"] };
  assert.equal(resolveAttainmentQuery({}, "me", own).selection, "personal");
  assert.equal(
    resolveAttainmentQuery({ scope: "workspace" }, "me", own).invalid,
    true,
  );
  assert.equal(
    resolveAttainmentQuery({ scope: "owner:someone" }, "me", own).invalid,
    true,
  );
  assert.equal(
    resolveAttainmentQuery({ scope: ["personal", "workspace"] }, "me", own)
      .invalid,
    true,
  );
  assert.equal(
    canReadReportingScope(
      own,
      { scopeType: "territory", territoryId: "east", ownerSub: null },
      "me",
    ),
    false,
  );
});
