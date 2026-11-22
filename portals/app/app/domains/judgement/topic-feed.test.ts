import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { targetJudgement, topicFeed } from "./topic-feed";
import { measure } from "../planning/lib/target";
import { InMemoryPlanningStore, type TargetRecord } from "../planning/store";
import { InMemoryAccountStore } from "../account/store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { InMemoryCopilotStore } from "../copilot/store";
import { setPlanningStore, setCopilotStore } from "../shared/registry";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { unwrap } from "../shared/result";
const WS = "aa000000-0000-4000-a000-000000000001",
  ID = "aa000000-0000-4000-a000-000000000010";
const target = (patch: Partial<TargetRecord> = {}): TargetRecord => ({
  id: ID,
  workspaceId: WS,
  period: "2026Q4",
  scopeType: "workspace",
  ownerSub: null,
  territoryId: null,
  metric: "revenue",
  status: "committed",
  planId: null,
  targetValue: { unit: "money", currency: "CNY", amount: 100 },
  ...patch,
});
const totals = {
  closedAmount: { amount: 40, currency: "CNY" },
  pipelineAmount: { amount: 100, currency: "CNY" },
  newLogoCount: 2,
};
afterEach(() => {
  setPlanningStore(null);
  setCopilotStore(null);
});
test("target findings distinguish missing data, real gaps, current period and completed targets", () => {
  const t = target(),
    row = { target: t, measurement: measure(t, null) },
    now = new Date("2026-11-01");
  const missing = targetJudgement(row, now)!;
  assert.match(missing.id, /target-data/);
  assert.equal(missing.facts.length, 1);
  const actual = { target: t, measurement: measure(t, totals) };
  for (const [date, urgency] of [
    ["2026-10-01", "watch"],
    ["2026-12-15", "week"],
    ["2026-12-29", "today"],
  ]) {
    const j = targetJudgement(actual, new Date(date))!;
    assert.equal(j.urgency, urgency);
    assert.match(j.claim, /60/);
    assert.equal(j.facts.length, 3);
  }
  for (const date of ["2026-09-30", "2027-01-01"])
    assert.equal(targetJudgement(actual, new Date(date)), null);
  assert.equal(
    targetJudgement({ ...actual, target: target({ status: "draft" }) }, now),
    null,
  );
  assert.equal(
    targetJudgement({ ...actual, target: target({ metric: "pipeline" }) }, now),
    null,
  );
  assert.equal(
    targetJudgement(
      {
        ...actual,
        measurement: measure(t, {
          ...totals,
          closedAmount: { amount: 120, currency: "CNY" },
        }),
      },
      now,
    ),
    null,
  );
});
test("target feed respects owner scope, snooze and read gates", async () => {
  const own = target({ id: ID + "1", scopeType: "owner", ownerSub: "alice" }),
    foreign = target({ id: ID + "2", scopeType: "owner", ownerSub: "bob" }),
    company = target();
  const store = new InMemoryPlanningStore(),
    copilot = new InMemoryCopilotStore();
  store.seed({ targets: [company, own, foreign] });
  setPlanningStore(store);
  setCopilotStore(copilot);
  const ctx = {
    workspaceId: WS,
    sub: "alice",
    holder: { permissions: new Set(permissionsForRoles(["sales_leader"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: WS,
      product: "yucer",
      tier: "pro" as const,
    },
    stores: {
      account: () => new InMemoryAccountStore(),
      pipeline: () => new InMemoryPipelineStore(),
    },
    allowWorkspaceMetrics: false,
  };
  const options = { scope: "all" as const, now: new Date("2026-11-01") };
  const first = unwrap(await topicFeed(ctx, options));
  assert.equal(first.judgements.length, 1);
  assert.equal(first.judgements[0].subjectId, own.id);
  assert.equal(first.dataAvailable, true);
  await copilot.snoozeJudgement(WS, {
    sub: "alice",
    judgementId: first.judgements[0].id,
    urgency: "watch",
    until: new Date("2027-01-01"),
  });
  assert.equal(unwrap(await topicFeed(ctx, options)).judgements.length, 0);
  assert.equal(
    unwrap(await topicFeed(ctx, { ...options, includeSnoozed: true }))
      .judgements.length,
    1,
  );
  assert.equal(
    (await topicFeed({ ...ctx, holder: { permissions: new Set() } }, options))
      .ok,
    false,
  );
  const management = unwrap(
    await topicFeed({ ...ctx, allowWorkspaceMetrics: true }, options),
  );
  assert.equal(management.judgements[0].subjectId, company.id);
});
