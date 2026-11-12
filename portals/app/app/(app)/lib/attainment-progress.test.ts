import { test } from "node:test";
import assert from "node:assert/strict";
import {
  executionRow,
  unallocatedExecutionRow,
  snapshotAttainment,
  attainmentBalance,
  attainmentMilestones,
} from "./attainment-progress";
import { resolveAttainmentQuery, revenueTarget } from "./attainment-workspace";
import { canReadReportingScope } from "../../authz/forecast-scope";
import type { AttainmentTarget } from "../../domains/planning/attainment-plan";
import {
  planSnapshot,
  forecastSnapshotPoint,
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
  const report = forecastSnapshotPoint(
    { ...snapshot.value, callNote: "Manager-only note" },
    true,
  );
  assert.equal(snapshotAttainment(report).ratio, 0.4);
  assert.equal("callNote" in report || "commitAmount" in report, false);
  assert.equal(forecastSnapshotPoint(snapshot.value, false).basis, null);
  assert.equal(row().gap, 400);
});

test("open pipeline remains available after the target is exceeded and never includes closed revenue", () => {
  const input = [
    { ...deal, amount: { amount: 1000, currency: "CNY" } },
    ...(["commit", "best_case", "pipeline"] as const).map((forecastCategory, i) => ({
      ...deal, id: forecastCategory, stage: "qualified" as const, status: "open" as const,
      forecastCategory, amount: { amount: (i + 1) * 100, currency: "CNY" },
      closedAt: null, expectedCloseAt: new Date("2026-09-01"),
    })),
  ];
  const actual = row({ deals: input });
  assert.equal(actual.open, 600);
  assert.equal(actual.closed, 1000);
  assert.equal(actual.coverage, null);
  assert.equal(row({ deals: null }).open, null);
  assert.equal(row({ deals: [] }).open, 0);
});

test("milestones use the actual floor, target and stretch on one scale including exact boundaries", () => {
  const base = { target: { ...target, floor: 80, target: 100, stretch: 120 }, closed: 0 };
  const scale = attainmentMilestones(base)!;
  assert.equal(scale.maximum, 120);
  assert.deepEqual(scale.milestones.map((m) => m.amount), [80, 100, 120]);
  assert.deepEqual(scale.milestones.map((m) => m.position), [80 / 120 * 100, 100 / 120 * 100, 100]);
  for (const [closed, stage] of [[0, "below"], [79, "below"], [80, "floor"], [99, "floor"], [100, "target"], [119, "target"], [120, "stretch"], [150, "stretch"]] as const)
    assert.equal(attainmentMilestones({ ...base, closed })?.stage, stage);
  assert.equal(attainmentMilestones({ ...base, closed: null }), null);
  assert.equal(attainmentMilestones({ ...base, target: null }), null);
  assert.equal(attainmentMilestones({ ...base, target: { ...base.target, target: 0 } }), null);
  const noTiers = attainmentMilestones({ ...base, target: { ...base.target, floor: null, stretch: null } })!;
  assert.equal(noTiers.maximum, 100);
  assert.deepEqual(noTiers.milestones.map((m) => m.tier), ["target"]);
  const invalidTiers = attainmentMilestones({ ...base, target: { ...base.target, floor: 110, stretch: 90 } })!;
  assert.deepEqual(invalidTiers.milestones.map((m) => m.tier), ["target"]);
});

test("exceeding stretch expands the scale and moves every target marker left proportionally", () => {
  const targetWithTiers = { ...target, floor: 80, target: 100, stretch: 120 };
  const atStretch = attainmentMilestones({ target: targetWithTiers, closed: 120 })!;
  const exceeded = attainmentMilestones({ target: targetWithTiers, closed: 200 })!;
  assert.equal(exceeded.maximum, 200);
  assert.equal(exceeded.stage, "stretch");
  assert.deepEqual(exceeded.milestones.map((m) => m.position), [40, 50, 60]);
  assert.ok(exceeded.milestones.every((m, i) => m.position < atStretch.milestones[i].position));
  const noStretch = attainmentMilestones({ target: { ...targetWithTiers, stretch: null }, closed: 200 })!;
  assert.equal(noStretch.maximum, 200);
  assert.deepEqual(noStretch.milestones.map((m) => m.position), [40, 50]);
  const equalTiers = attainmentMilestones({ target: { ...targetWithTiers, floor: 100, stretch: 100 }, closed: 200 })!;
  assert.deepEqual(equalTiers.milestones.map((m) => m.position), [50, 50, 50]);
  assert.equal(attainmentMilestones({ target: { ...targetWithTiers, floor: 0 }, closed: 0 })?.stage, "floor");
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

test("remaining target and actual surplus are distinct, including zero and unavailable data", () => {
  assert.deepEqual(attainmentBalance(row()), { kind: "gap", amount: 400 });
  assert.deepEqual(
    attainmentBalance(
      row({ deals: [{ ...deal, amount: { amount: 1000, currency: "CNY" } }] }),
    ),
    { kind: "excess", amount: 200 },
  );
  assert.deepEqual(
    attainmentBalance(
      row({ deals: [{ ...deal, amount: { amount: 800, currency: "CNY" } }] }),
    ),
    { kind: "gap", amount: 0 },
  );
  assert.deepEqual(attainmentBalance(row({ target: null })), {
    kind: "unknown",
    amount: null,
  });
  assert.deepEqual(attainmentBalance(row({ deals: null })), {
    kind: "unknown",
    amount: null,
  });
});


test("unassigned group reconciles company quota and actuals without double counting regions", () => {
  const company = { ...target, target: 1000, floor: 800, stretch: 1200 };
  const regional = { ...target, scope: "territory:east", target: 800, floor: 640, stretch: 960 };
  const input = {
    name: "Unassigned region", period: "Y2026", regionIds: ["east"],
    companyTarget: company, regionTargets: [regional], defaultCurrency: "CNY",
    deals: [deal, { ...deal, id: "unassigned", territoryId: null, amount: { amount: 100, currency: "CNY" } }],
  };
  const rest = unallocatedExecutionRow(input)!;
  assert.equal(rest.scope, "unallocated");
  assert.equal(rest.target?.target, 200);
  assert.equal(rest.target?.floor, 160);
  assert.equal(rest.target?.stretch, 240);
  assert.equal(rest.target?.revision?.id, company.revision?.id);
  assert.equal(rest.closed, 100);
  assert.equal(rest.ratio, 0.5);
  assert.equal(rest.gap, 100);
  assert.equal(rest.closed! + row({ scope: "territory:east", target: regional, deals: input.deals }).closed!, row({ target: company, deals: input.deals }).closed);
  assert.equal(rest.target!.target + regional.target, company.target);
  assert.equal(unallocatedExecutionRow({ ...input, deals: [] }), null);
  assert.equal(unallocatedExecutionRow({ ...input, deals: null }), null);
});

test("unassigned quota uses the exact period and currency, preserves unmatched business and reports over-allocation", () => {
  const base = {
    name: "Unassigned region", period: "Y2026", regionIds: ["east"],
    companyTarget: target, defaultCurrency: "CNY",
    deals: [{ ...deal, territoryId: "retired-region" }],
  };
  const exact = { ...target, scope: "territory:east" };
  const fullyAllocated = unallocatedExecutionRow({ ...base, regionTargets: [exact] })!;
  assert.equal(fullyAllocated.target?.target, 0);
  assert.equal(fullyAllocated.ratio, null);
  assert.equal(fullyAllocated.closed, 400);
  const quarter = unallocatedExecutionRow({ ...base, period: "2026Q3", companyTarget: { ...target, period: "2026Q3", target: 100 }, regionTargets: [exact] })!;
  assert.equal(quarter.target?.target, 100);
  assert.equal(quarter.closed, 400);
  const over = unallocatedExecutionRow({ ...base, regionTargets: [{ ...exact, target: 1000 }] })!;
  assert.equal(over.target?.target, 0);
  assert.equal(over.allocationExcess, 200);
  assert.equal(unallocatedExecutionRow({ ...base, companyTarget: null })?.target, null);
  assert.equal(unallocatedExecutionRow({ ...base, regionTargets: [{ ...exact, currency: "USD" }] })?.target, null);
  assert.equal(unallocatedExecutionRow({ ...base, deals: [], regionTargets: [exact] }), null);
  assert.equal(unallocatedExecutionRow({ ...base, deals: [], regionTargets: [exact], includeEmpty: true })?.closed, 0);
  assert.equal(unallocatedExecutionRow({ ...base, regionTargets: [{ ...exact, floor: null, stretch: null }] })?.target?.floor, null);
});


test("unassigned group visibility requires positive closed income in the selected period", () => {
  const input = {
    name: "Unassigned region", period: "Y2026", regionIds: ["east"],
    companyTarget: target, regionTargets: [], defaultCurrency: "CNY",
  };
  const unassigned = { ...deal, territoryId: null };
  assert.equal(unallocatedExecutionRow({ ...input, deals: [deal] }), null);
  assert.equal(unallocatedExecutionRow({ ...input, deals: [] }), null);
  assert.equal(unallocatedExecutionRow({ ...input, deals: [{ ...unassigned, amount: { amount: 0, currency: "CNY" } }] }), null);
  assert.equal(unallocatedExecutionRow({ ...input, deals: [{ ...unassigned, status: "open", stage: "qualified", forecastCategory: "commit", closedAt: null, expectedCloseAt: new Date("2026-07-01") }] }), null);
  assert.equal(unallocatedExecutionRow({ ...input, deals: [{ ...unassigned, closedAt: null }] }), null);
  assert.equal(unallocatedExecutionRow({ ...input, deals: [{ ...unassigned, closedAt: new Date("2025-07-01") }] }), null);
  assert.equal(unallocatedExecutionRow({ ...input, period: "2026Q1", companyTarget: null, deals: [unassigned] }), null);
  assert.equal(unallocatedExecutionRow({ ...input, deals: [unassigned] })?.closed, 400);
  assert.equal(unallocatedExecutionRow({ ...input, deals: [], includeEmpty: true })?.closed, 0);
});
