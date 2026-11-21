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

test("an explicit released revision keeps its target and boundary while current stays separately identified", async () => {
  const { ctx, content, change, release, time } = setup();
  await change({ kind: "draft", content }); await release();
  const original = (await readAttainmentPlan(ctx, 2026)).current!;
  time("2026-07-03T00:00:00Z");
  const revised = structuredClone(content);
  revised.regions[0].provinces = ["east-new"];
  for (const target of revised.targets) {
    target.floor = String(Number(target.floor) * 2);
    target.target = String(Number(target.target) * 2);
    target.stretch = String(Number(target.stretch) * 2);
  }
  await change({ kind: "draft", content: revised });
  const draft = (await ctx.store.read("ws", 2026))!.revisions.find(r => r.state === "draft")!;
  await change({ kind: "save", revisionId: draft.id, editToken: draft.editToken, content: revised });
  await release();
  const current = await readAttainmentPlan(ctx, 2026);
  const comparison = await readAttainmentPlan(ctx, 2026, original.id);
  assert.equal(current.targets.find(t => t.scope === "workspace")!.target, 4000);
  assert.equal(comparison.targets.find(t => t.scope === "workspace")!.target, 2000);
  assert.equal(comparison.targets[0].revision?.id, original.id);
  assert.equal(comparison.selected?.id, original.id);
  assert.equal(comparison.current?.id, current.current?.id);
  assert.equal(comparison.targets[0].baseline, 2000);
  assert.deepEqual(comparison.regions[0].provinces, ["east"]);
  assert.equal(comparison.targets[0].baselineComparable, true);
  assert.equal(current.targets[0].baselineComparable, false);
  assert.deepEqual((await readAttainmentPlan(ctx, 2026)).targets, current.targets);
});

test("draft, scheduled, foreign, wrong-year and cancelled revisions never silently become the current comparison", async () => {
  const { ctx, content, change, release } = setup();
  await change({ kind: "draft", content }); await release();
  await change({ kind: "draft", content });
  const draft = (await ctx.store.read("ws", 2026))!.revisions.find(r => r.state === "draft")!;
  await assert.rejects(readAttainmentPlan(ctx, 2026, draft.id), /attainment_revision_unavailable/);
  await change({ kind: "release", revisionId: draft.id, editToken: draft.editToken, reason: "scheduled", effectiveAt: "2026-08-01T00:00:00Z" });
  await assert.rejects(readAttainmentPlan(ctx, 2026, draft.id), /attainment_revision_unavailable/);
  assert.equal((await readAttainmentPlan(ctx, 2026)).historical.some(r => r.id === draft.id), false);
  const first = (await readAttainmentPlan(ctx, 2026)).current!;
  await assert.rejects(readAttainmentPlan(ctx, 2027, first.id), /attainment_revision_unavailable/);
  await assert.rejects(readAttainmentPlan({ ...ctx, workspaceId: "other" }, 2026, first.id), /attainment_revision_unavailable/);
  const plan = (await ctx.store.read("ws", 2026))!;
  const releaseEvent = plan.events.find(e => e.revisionId === first.id && e.kind === "release")!;
  plan.events.push({ ...releaseEvent, id: "cancelled-release", no: 10, kind: "cancel", relatedId: releaseEvent.id });
  // In-memory fixture follows the persisted cancellation shape without issuing a business write.
  const cancelled = new InMemorySalesPlanStore(); cancelled.seed([plan]);
  await assert.rejects(readAttainmentPlan({ ...ctx, store: cancelled }, 2026, first.id), /attainment_revision_unavailable/);
});

test("selected historical projections keep regional scope and reject inferred personal quotas", async () => {
  const { ctx, content, change, release } = setup();
  await change({ kind: "draft", content }); await release();
  const id = (await readAttainmentPlan(ctx, 2026)).current!.id;
  ctx.targets.seed({ targets: [{ id: "current-only-quota", workspaceId: "ws", scopeType: "owner", ownerSub: "ops", territoryId: null,
    metric: "revenue", period: "Y2026", status: "committed", planId: null, targetValue: { unit: "money", amount: 999, currency: "CNY" } }] });
  assert.equal((await readAttainmentPlan(ctx, 2026)).targets.some(t => t.scope === "owner:ops"), true);
  assert.equal((await readAttainmentPlan(ctx, 2026, id)).targets.some(t => t.scope === "owner:ops"), false);
  ctx.scope = { kind: "territory", territoryIds: ["east"], accountIds: [], ownerSubs: [], unplacedAccountIds: [] };
  const p = await readAttainmentPlan(ctx, 2026, id);
  assert.deepEqual(p.targets.map(t => t.scope), ["territory:east"]);
  assert.doesNotMatch(JSON.stringify(p.support), /west|2000/);
  assert.deepEqual(p.support, { budgets: [], contributions: [], team: [], actions: [] });
  ctx.scope = { kind: "own", sub: "ops", accountIds: [] };
  await assert.rejects(readAttainmentPlan(ctx, 2026, id), /attainment_revision_unavailable/);
});
