import { test } from "node:test";
import assert from "node:assert/strict";
import { seedDemoWorkspace, type DemoStores } from "./demo-seed";
import { seedPlanningDemo } from "./demo-planning";
import { InMemoryAccountStore } from "../account/store";
import { InMemoryFieldStore } from "../account/field-store";
import { InMemoryCatalogStore } from "../catalog/store";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryDeliveryStore } from "../delivery/store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { InMemoryPlanningStore } from "../planning/store";
import { InMemorySalesPlanStore } from "../planning/plan-store";
import { InMemorySignalStore } from "../signal/store";
import { InMemoryStrategyStore } from "../strategy/store";
import { effectiveTargets } from "../planning/effective-targets";
import { planVersions, validateRevision } from "../planning/plan-model";
import { inPeriod, rollUp } from "../pipeline/lib/forecast";
import { periodRange } from "./period";

const WS = "planning_demo_test";
const reviewer = { sub: "reviewer", name: "Local reviewer" };
async function setup(now = new Date("2026-11-12T12:00:00Z")) {
  const stores: DemoStores & { plans: InMemorySalesPlanStore } = {
    strategy: new InMemoryStrategyStore(),
    planning: new InMemoryPlanningStore(),
    account: new InMemoryAccountStore(),
    field: new InMemoryFieldStore(),
    signal: new InMemorySignalStore(),
    pipeline: new InMemoryPipelineStore(),
    delivery: new InMemoryDeliveryStore(),
    copilot: new InMemoryCopilotStore(),
    catalog: new InMemoryCatalogStore(),
    plans: new InMemorySalesPlanStore(),
  };
  seedDemoWorkspace(WS, stores);
  const divisions = await stores.account.listMarketDivisions(WS);
  stores.planning.seed({
    territories: divisions.map((d, i) => ({
      id: "geo_" + i,
      workspaceId: WS,
      territoryCode: "AUTO-" + d.code,
      name: d.name,
      parentId: null,
      ownerSub: null,
      regions: [d.name],
      divisionIds: [d.id],
      unitIds: [],
      status: "active",
    })),
  });
  await seedPlanningDemo(WS, stores, reviewer, now);
  return stores;
}

test("current-year demo connects geographic plans, quarters, live deals, customers and immutable reports", async () => {
  const stores = await setup();
  const plan = (await stores.plans.read(WS, 2026))!;
  const current = planVersions(plan, "2026-11-12T12:00:00Z").current!;
  assert.equal(current.version, 2);
  assert.equal(current.content.regions.length, 5);
  const divisions = await stores.account.listMarketDivisions(WS);
  for (const region of current.content.regions) {
    assert.deepEqual(
      region.provinces,
      divisions.find((d) => d.id === region.divisionId)!.members.map((m) => m.label),
    );
  }
  assert.equal(current.content.periods.length, 5);
  assert.equal(current.content.targets.length, 30);
  assert.equal(current.content.budgets.length, 25);
  assert.equal(current.content.actions.length, 25);
  assert.equal(
    new Set(
      current.content.team.flatMap((t) => (t.memberSub ? [t.memberSub] : [])),
    ).size,
    2,
  );
  validateRevision(plan, current.content, "2026-11-12T12:00:00Z");
  const targets = effectiveTargets(
    await stores.planning.listTargets(WS),
    [plan],
    "2026-11-12T12:00:00Z",
  );
  assert.equal(
    targets.filter((t) => t.scopeType === "workspace" && t.period === "2026Q3")
      .length,
    1,
    "the old company quota is explicitly adopted, not counted twice",
  );
  const deals = await stores.pipeline.listOpportunities(WS, {
    includeClosed: true,
  });
  const currentDeals = deals.filter(
    (d) =>
      d.opportunityNo.startsWith("DEMO-") && d.opportunityNo.includes("-2026-"),
  );
  assert.equal(currentDeals.length, 76);
  const slice = inPeriod(currentDeals, "2026Q4")!;
  const totals = rollUp(slice.kept, "CNY");
  assert.ok(totals.ok);
  assert.ok(totals.value.closedAmount.amount > 0);
  assert.ok(totals.value.commitAmount.amount > 0);
  assert.ok(totals.value.bestCaseAmount.amount > 0);
  assert.ok(totals.value.pipelineAmount.amount > 0);
  for (const region of current.content.regions) {
    const regional = currentDeals.filter((d) => d.territoryId === region.id);
    assert.ok(regional.some((d) => d.status === "open"));
  }
  const snapshots = await stores.pipeline.listForecastSnapshots(WS, {
    period: "Y2026",
    scopeType: "workspace",
  });
  assert.equal(snapshots.length, 3);
  const latest = snapshots.at(-1)!;
  assert.equal(latest.targetBasis?.[0].version, 1);
  assert.equal(latest.targetBasis?.[0].target, "120000000");
  assert.equal(
    current.content.targets.find(
      (t) => t.scope === "workspace" && t.period === "Y2026",
    )!.target,
    "96000000",
  );
  assert.ok(latest.closedAmount.amount > 0);
  const accountIds = new Set(
    (await stores.account.listAccounts(WS)).map((a) => a.id),
  );
  assert.ok(
    currentDeals.every((d) => accountIds.has(d.accountId) && d.accountName),
  );
  const lines = await stores.catalog.allLines(WS);
  assert.ok(
    currentDeals.every((d) =>
      lines.some(
        (l) => l.opportunityId === d.id && l.amount === d.amount?.amount,
      ),
    ),
  );
  const interactions = await stores.field.listInteractions(WS);
  assert.ok(
    currentDeals.every((d) => interactions.some((r) =>
      r.opportunityId === d.id && r.accountId === d.accountId && r.rawNote,
    )),
  );
  const quota = targets.find(
    (t) =>
      t.scopeType === "owner" &&
      t.ownerSub === reviewer.sub &&
      t.period === "2026Q4",
  );
  assert.equal(quota?.targetValue.amount, 12_000_000);
});

test("demo is repeatable and never overwrites a reviewer's draft or duplicates forecasts", async () => {
  const stores = await setup();
  const before = await stores.pipeline.listForecastSnapshots(WS, {
    period: "Y2026",
  });
  await stores.plans.transact(WS, 2026, (plan) => {
    plan.revisions[1].content.allocationNote = "Reviewer change";
  });
  await seedPlanningDemo(WS, stores, reviewer, new Date("2026-11-13"));
  assert.equal(
    (await stores.plans.read(WS, 2026))!.revisions[1].content.allocationNote,
    "Reviewer change",
  );
  assert.equal(
    (await stores.pipeline.listForecastSnapshots(WS, { period: "Y2026" }))
      .length,
    before.length,
  );
  const fresh = await setup();
  assert.equal(
    (await fresh.plans.read(WS, 2026))!.id,
    (await stores.plans.read(WS, 2026))!.id,
  );
  assert.deepEqual(
    (await fresh.pipeline.listForecastSnapshots(WS, { period: "Y2026" })).map(
      (s) => s.id,
    ),
    before.map((s) => s.id),
  );
});

test("dates roll to the actual year and quarter, including January and a new calendar year", async () => {
  for (const iso of ["2027-01-01T00:01:00Z", "2028-04-02T12:00:00Z"]) {
    const now = new Date(iso);
    const stores = await setup(now);
    const plan = (await stores.plans.read(WS, now.getUTCFullYear()))!;
    const state = planVersions(plan, iso);
    assert.equal(state.current?.version, 2);
    const q =
      now.getUTCFullYear() + "Q" + (Math.floor(now.getUTCMonth() / 3) + 1);
    const range = periodRange(q)!;
    const seeded = (
      await stores.pipeline.listOpportunities(WS, { includeClosed: true })
    ).filter((d) => d.opportunityNo.startsWith("DEMO-" + now.getUTCFullYear()));
    assert.ok(seeded.some((d) => d.status === "won"));
    assert.ok(
      seeded.every(
        (d) => d.createdAt <= now && (!d.closedAt || d.closedAt <= now),
      ),
    );
    assert.ok(
      seeded.some(
        (d) =>
          d.expectedCloseAt &&
          range.start <= d.expectedCloseAt &&
          d.expectedCloseAt < range.end,
      ),
    );
    const reports = await stores.pipeline.listForecastSnapshots(WS, {
      period: q,
    });
    assert.ok(reports.length > 0);
    assert.ok(
      reports.every(
        (s) =>
          s.snapshotAt <= now &&
          s.targetBasis?.[0].revisionId === plan.revisions[0].id,
      ),
    );
  }
});
