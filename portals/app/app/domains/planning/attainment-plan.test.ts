import { test } from "node:test";
import assert from "node:assert/strict";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { InMemorySalesPlanStore } from "./plan-store";
import { InMemoryPlanningStore } from "./store";
import {
  changeSalesPlan,
  type PlanCommand,
  type SalesPlanContext,
} from "./plan-service";
import { emptyContent } from "./plan-model";
import { readAttainmentPlan } from "./attainment-plan";

function setup() {
  let now = new Date("2026-07-01T00:00:00Z");
  const ctx: SalesPlanContext & { targets: InMemoryPlanningStore } = {
    workspaceId: "ws",
    sub: "ops",
    scope: { kind: "workspace" },
    holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: "ws",
      product: "yucer",
      tier: "enterprise",
    },
    store: new InMemorySalesPlanStore(),
    targets: new InMemoryPlanningStore(),
    now: () => now,
  };
  let sequence = 0;
  const change = async (command: PlanCommand) =>
    changeSalesPlan(ctx, {
      year: 2026,
      expectedEventNo:
        (await ctx.store.read("ws", 2026))?.events.at(-1)?.no ?? 0,
      requestKey: `attainment_${++sequence}`,
      command,
    });
  const content = emptyContent(
    2026,
    ["east", "west"].map((id) => ({
      id,
      divisionId: id,
      code: id,
      name: id,
      provinces: [id],
      included: true,
      reason: "",
      ownerSub: null,
    })),
    "CNY",
  );
  for (const t of content.targets) {
    t.floor = t.scope === "workspace" ? "1200" : "600";
    t.target = t.scope === "workspace" ? "2000" : "1000";
    t.stretch = t.scope === "workspace" ? "2400" : "1200";
  }
  const release = async () => {
    const draft = (await ctx.store.read("ws", 2026))!.revisions.find(
      (r) => r.state === "draft",
    )!;
    return change({
      kind: "release",
      revisionId: draft.id,
      editToken: draft.editToken,
      reason: "release",
    });
  };
  return {
    ctx,
    content,
    change,
    release,
    time: (value: string) => {
      now = new Date(value);
    },
  };
}

test("attainment reads the effective tiers, keeps the original baseline, and ignores an unsaved/scheduled revision", async () => {
  const { ctx, content, change, release, time } = setup();
  await change({ kind: "draft", content });
  assert.equal((await readAttainmentPlan(ctx, 2026)).targets.length, 0);
  await release();
  let p = await readAttainmentPlan(ctx, 2026);
  assert.equal(p.current?.version, 1);
  assert.equal(p.targets.find((t) => t.scope === "territory:east")?.floor, 600);
  await change({ kind: "draft", content });
  const draft = (await ctx.store.read("ws", 2026))!.revisions.find(
    (r) => r.state === "draft",
  )!;
  draft.content.targets.find((t) => t.scope === "territory:east")!.target =
    "800";
  draft.content.allocationNote = "Leave part of the company target unallocated";
  await change({
    kind: "save",
    revisionId: draft.id,
    editToken: draft.editToken,
    content: draft.content,
  });
  assert.equal(
    (await readAttainmentPlan(ctx, 2026)).targets.find(
      (t) => t.scope === "territory:east",
    )?.target,
    1000,
  );
  const saved = (await ctx.store.read("ws", 2026))!.revisions.find(
    (r) => r.state === "draft",
  )!;
  await change({
    kind: "release",
    revisionId: saved.id,
    editToken: saved.editToken,
    reason: "revision",
    effectiveAt: "2026-07-02T00:00:00Z",
  });
  p = await readAttainmentPlan(ctx, 2026);
  assert.equal(p.current?.version, 1);
  assert.equal(p.scheduled?.version, 2);
  time("2026-07-03T00:00:00Z");
  p = await readAttainmentPlan(ctx, 2026);
  const east = p.targets.find((t) => t.scope === "territory:east")!;
  assert.equal(east.target, 800);
  assert.equal(east.baseline, 1000);
  assert.equal(p.current?.version, 2);
  assert.equal(east.baselineComparable, true);
});

test("regional readers receive only their own target projection, without company/customer/personnel snapshots", async () => {
  const { ctx, content, change, release } = setup();
  await change({ kind: "draft", content });
  await release();
  ctx.scope = {
    kind: "territory",
    territoryIds: ["east"],
    accountIds: [],
    ownerSubs: [],
    unplacedAccountIds: [],
  };
  const p = await readAttainmentPlan(ctx, 2026);
  assert.deepEqual(
    p.regions.map((r) => r.id),
    ["east"],
  );
  assert.deepEqual(
    p.targets.map((r) => r.scope),
    ["territory:east"],
  );
  assert.equal(p.supportRestricted, true);
  assert.deepEqual(p.support, {
    budgets: [],
    contributions: [],
    team: [],
    actions: [],
  });
  assert.doesNotMatch(JSON.stringify(p), /west|2000/);
});

test("a personal reader keeps an explicit legacy quota; regional targets never become personal quotas", async () => {
  const { ctx, content, change, release } = setup();
  await change({ kind: "draft", content });
  await release();
  ctx.targets.seed({
    targets: [
      {
        id: "personal",
        workspaceId: "ws",
        scopeType: "owner",
        territoryId: null,
        ownerSub: "ops",
        metric: "revenue",
        period: "2026",
        status: "committed",
        planId: null,
        targetValue: { unit: "money", amount: 250, currency: "CNY" },
      },
    ],
  });
  ctx.scope = { kind: "own", sub: "ops", accountIds: [] };
  const p = await readAttainmentPlan(ctx, 2026);
  assert.equal(p.current, null);
  assert.equal(p.targets.length, 1);
  assert.equal(p.targets[0].target, 250);
  assert.equal(p.targets[0].period, "Y2026");
  assert.equal(p.targets[0].source, "legacy");
  assert.deepEqual(p.regions, []);
});

test("a denied target reader cannot use the new projection to bypass the domain gate", async () => {
  const { ctx } = setup();
  ctx.holder = { permissions: new Set() };
  await assert.rejects(readAttainmentPlan(ctx, 2026), /plan_denied/);
});
