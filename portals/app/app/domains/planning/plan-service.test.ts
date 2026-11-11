import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { InMemorySalesPlanStore } from "./plan-store";
import {
  changeSalesPlan,
  readSalesPlan,
  type SalesPlanContext,
  type PlanCommand,
} from "./plan-service";
import {
  emptyContent,
  digest,
  minor,
  validateContent,
  planVersions,
  type PlanContent,
} from "./plan-model";
import { effectiveTargets } from "./effective-targets";
function content(): PlanContent {
  const c = emptyContent(
    2026,
    [
      {
        id: "east",
        divisionId: "d",
        code: "E",
        name: "East",
        provinces: [],
        included: true,
        reason: "",
        ownerSub: null,
      },
    ],
    "CNY",
  );
  for (const t of c.targets) t.target = "1000";
  return c;
}
function setup() {
  let time = "2026-07-01T00:00:00.000Z";
  const ctx: SalesPlanContext = {
    workspaceId: "workspace",
    sub: "ops",
    holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: "workspace",
      product: "yucer",
      tier: "enterprise",
    },
    scope: { kind: "workspace" },
    store: new InMemorySalesPlanStore(),
    now: () => new Date(time),
  };
  let seq = 0;
  const change = async (command: PlanCommand) =>
    changeSalesPlan(ctx, {
      year: 2026,
      expectedEventNo:
        (await ctx.store.read(ctx.workspaceId, 2026))?.events.at(-1)?.no ?? 0,
      requestKey: `request_${++seq}`,
      command,
    });
  return {
    ctx,
    change,
    time: (t: string) => {
      time = t;
    },
  };
}
test("money uses integer minor units and rejects ambiguous input", () => {
  assert.equal(minor("0.10") + minor("0.20"), minor("0.30"));
  for (const v of ["-1", "NaN", "Infinity", "1e3", "1.001"])
    assert.throws(() => minor(v));
});
test("retries retain the original request digest when the server enriches source data", async () => {
  const { ctx } = setup();
  const original = { kind: "draft" as const, content: content() };
  ctx.requestDigest = digest({
    command: original,
    expectedEventNo: 0,
    actor: ctx.sub,
  });
  const first = await changeSalesPlan(ctx, {
    year: 2026,
    expectedEventNo: 0,
    requestKey: "enriched_retry",
    command: original,
  });
  const enriched = content();
  enriched.assumptions = "Sources read again after a lost response";
  const retry = await changeSalesPlan(ctx, {
    year: 2026,
    expectedEventNo: 0,
    requestKey: "enriched_retry",
    command: { kind: "draft", content: enriched },
  });
  assert.equal(retry.revisions[0]!.id, first.revisions[0]!.id);
  assert.equal(retry.events.length, 1);
  ctx.requestDigest = digest({ different: true });
  await assert.rejects(
    changeSalesPlan(ctx, {
      year: 2026,
      expectedEventNo: 0,
      requestKey: "enriched_retry",
      command: original,
    }),
    /idempotency_conflict/,
  );
});
test("target differences retain exact minor units and do not divide by zero", async () => {
  const { targetDelta } = await import("./plan-state");
  assert.deepEqual(targetDelta("1000", "800"), {
    amount: "-200.00",
    percent: "-20.00%",
  });
  assert.deepEqual(targetDelta("0", "1"), { amount: "+1.00", percent: null });
  assert.equal(targetDelta(null, "1"), null);
  assert.deepEqual(targetDelta("9999999999999.99", "9999999999999.98"), {
    amount: "-0.01",
    percent: "-0.00%",
  });
});
test("target ladder, null versus zero, overlapping periods and over-allocation", () => {
  const c = content();
  validateContent(c, true);
  c.targets[0]!.floor = "1001";
  assert.throws(() => validateContent(c, true), /target_ladder/);
  c.targets[0]!.floor = null;
  c.targets[0]!.target = "0";
  assert.throws(() => validateContent(c, true), /overallocated/);
  c.targets[0]!.target = "1000";
  c.periods.push({ ...c.periods[1]!, key: "2026-01" });
  assert.throws(
    () => validateContent(c, true),
    /invalid_period|overlapping_period/,
  );
});
test("draft saves do not allocate version; released contents are copied and immutable", async () => {
  const { ctx, change } = setup();
  const p = await change({ kind: "draft", content: content() });
  const r = p.revisions[0]!;
  await change({
    kind: "save",
    revisionId: r.id,
    editToken: 1,
    content: content(),
  });
  await assert.rejects(
    change({ kind: "release", revisionId: r.id, editToken: 1, reason: "" }),
    /draft_conflict/,
  );
  const released = await change({
    kind: "release",
    revisionId: r.id,
    editToken: 2,
    reason: "",
  });
  assert.equal(released.revisions[0]!.version, 1);
  await assert.rejects(
    change({
      kind: "save",
      revisionId: r.id,
      editToken: 3,
      content: content(),
    }),
    /draft_not_found/,
  );
  released.revisions[0]!.content.targets[0]!.target = "1";
  assert.equal(
    (await readSalesPlan(ctx, 2026))!.revisions[0]!.content.targets[0]!.target,
    "1000",
  );
});
test("concurrent publication and idempotent retry are atomic", async () => {
  const { ctx, change } = setup();
  const p = await change({ kind: "draft", content: content() });
  const input = {
    year: 2026,
    expectedEventNo: 1,
    requestKey: "same_request",
    command: {
      kind: "release" as const,
      revisionId: p.revisions[0]!.id,
      editToken: 1,
      reason: "",
    },
  };
  const results = await Promise.allSettled([
    changeSalesPlan(ctx, input),
    changeSalesPlan(ctx, input),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  assert.equal(
    (await ctx.store.read(ctx.workspaceId, 2026))!.events.filter(
      (e) => e.kind === "release",
    ).length,
    1,
  );
  await assert.rejects(
    changeSalesPlan(ctx, {
      ...input,
      command: { ...input.command, reason: "different" },
    }),
    /idempotency_conflict/,
  );
});
test("scheduled release cancels without recycling number and restore creates V3", async () => {
  const { change, time } = setup();
  let p = await change({ kind: "draft", content: content() });
  p = await change({
    kind: "release",
    revisionId: p.revisions[0]!.id,
    editToken: 1,
    reason: "",
    effectiveAt: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(planVersions(p, "2026-07-01T00:00:00.000Z").current, null);
  p = await change({ kind: "cancel", reason: "cancel" });
  p = await change({
    kind: "draft",
    content: content(),
    restoreId: p.revisions[0]!.id,
  });
  let r = p.revisions.at(-1)!;
  p = await change({
    kind: "release",
    revisionId: r.id,
    editToken: 1,
    reason: "restore",
  });
  assert.equal(p.revisions.at(-1)!.version, 2);
  assert.equal(
    planVersions(p, "2026-07-01T00:00:00.000Z").baseline?.version,
    2,
  );
  time("2026-09-01T00:00:00.000Z");
  p = await change({
    kind: "draft",
    content: content(),
    restoreId: p.revisions[0]!.id,
  });
  r = p.revisions.at(-1)!;
  p = await change({
    kind: "release",
    revisionId: r.id,
    editToken: 1,
    reason: "restore again",
  });
  assert.equal(planVersions(p, "2026-09-01T00:00:00.000Z").current?.version, 3);
});
test("closed quarter cannot be rewritten and closed year rejects releases", async () => {
  const { change } = setup();
  const c = content();
  const t = {
    ...c.targets[0]!,
    key: "quarter",
    period: "2026Q1",
    target: "200",
  };
  c.targets.push(t);
  c.allocationNote = "Remaining quarters unallocated";
  let p = await change({ kind: "draft", content: c });
  p = await change({
    kind: "release",
    revisionId: p.revisions[0]!.id,
    editToken: 1,
    reason: "",
  });
  p = await change({ kind: "lock", period: "2026Q1", reason: "finished" });
  p = await change({ kind: "draft", content: c });
  const r = p.revisions.at(-1)!;
  const edit = structuredClone(r.content);
  edit.targets.find((t) => t.key === "quarter")!.target = "1";
  p = await change({
    kind: "save",
    revisionId: r.id,
    editToken: 1,
    content: edit,
  });
  await assert.rejects(
    change({
      kind: "release",
      revisionId: r.id,
      editToken: 2,
      reason: "change",
    }),
    /closed_period_changed/,
  );
  await change({ kind: "close", reason: "year finished" });
  await assert.rejects(change({ kind: "draft", content: c }), /plan_closed/);
});
test("cross-region customer budget and shared member capacity are checked", () => {
  const c = content();
  c.budgets = [
    {
      key: "budget",
      accountId: "account",
      name: "A",
      tier: "strategic",
      period: "Y2026",
      metric: "revenue",
      currency: "CNY",
      amount: "100",
      sourcePlanId: null,
      sourceReadAt: "2026-07-01",
      note: "confirmed",
    },
  ];
  c.contributions = [
    {
      key: "a",
      budgetKey: "budget",
      targetKey: c.targets[1]!.key,
      regionId: "east",
      responsibility: "primary",
      amount: "101",
    },
  ];
  assert.throws(() => validateContent(c, true), /budget_overallocated/);
  c.contributions[0]!.amount = "100";
  c.team = ["a", "b"].map((key) => ({
    key,
    regionId: "east",
    memberSub: "person",
    memberName: "One person",
    unitId: null,
    unitName: "",
    role: "sales",
    start: "2026-01-01",
    end: "2027-01-01",
    percent: 60,
    requestedFte: null,
    note: "",
  }));
  assert.throws(() => validateContent(c, true), /capacity_note_required/);
  c.capacityNote = "temporary overlap";
  validateContent(c, true);
});
test("workspace isolation and data-scope gate do not expose frozen customer snapshots", async () => {
  const { ctx, change } = setup();
  await change({ kind: "draft", content: content() });
  assert.equal(
    await readSalesPlan({ ...ctx, workspaceId: "other" }, 2026),
    null,
  );
  await assert.rejects(
    readSalesPlan(
      { ...ctx, scope: { kind: "own", sub: ctx.sub, accountIds: [] } },
      2026,
    ),
    /plan_scope_required/,
  );
});
test("legacy and released targets cannot double count and annual aliases normalize", async () => {
  const { change } = setup();
  let p = await change({ kind: "draft", content: content() });
  p = await change({
    kind: "release",
    revisionId: p.revisions[0]!.id,
    editToken: 1,
    reason: "",
  });
  const legacy = {
    id: "old",
    workspaceId: "workspace",
    period: "2026",
    scopeType: "workspace" as const,
    territoryId: null,
    ownerSub: null,
    metric: "revenue" as const,
    targetValue: { unit: "money" as const, amount: 1000, currency: "CNY" },
    status: "committed" as const,
    planId: null,
  };
  assert.throws(
    () => effectiveTargets([legacy], [p], "2026-07-01T00:00:00.000Z"),
    /unadopted_target_conflict/,
  );
  p.legacy.push({
    targetId: "old",
    revisionId: p.revisions[0]!.id,
    snapshot: legacy,
  });
  assert.equal(
    effectiveTargets([legacy], [p], "2026-07-01T00:00:00.000Z").length,
    2,
  );
});

test("draft and save request retries are idempotent without creating business versions", async () => {
  const { ctx } = setup();
  const request = {
    year: 2026,
    expectedEventNo: 0,
    requestKey: "retry_draft",
    command: { kind: "draft" as const, content: content() },
  };
  const first = await changeSalesPlan(ctx, request);
  const again = await changeSalesPlan(ctx, request);
  assert.equal(first.revisions[0]!.id, again.revisions[0]!.id);
  const save = {
    year: 2026,
    expectedEventNo: first.events.at(-1)!.no,
    requestKey: "retry_save",
    command: {
      kind: "save" as const,
      revisionId: first.revisions[0]!.id,
      editToken: 1,
      content: content(),
    },
  };
  await changeSalesPlan(ctx, save);
  await changeSalesPlan(ctx, save);
  const persisted = (await ctx.store.read(ctx.workspaceId, 2026))!;
  assert.equal(persisted.revisions[0]!.editToken, 2);
  assert.equal(persisted.revisions[0]!.version, null);
});
test("schedule replacement failure rolls back the cancellation", async () => {
  const { ctx, change } = setup();
  let p = await change({ kind: "draft", content: content() });
  p = await change({
    kind: "release",
    revisionId: p.revisions[0]!.id,
    editToken: 1,
    reason: "",
    effectiveAt: "2026-08-01T00:00:00.000Z",
  });
  p = await change({ kind: "draft", content: content() });
  const r = p.revisions.at(-1)!;
  const changed = structuredClone(r.content);
  changed.targets[0]!.target = "0";
  await assert.rejects(
    change({ kind: "save", revisionId: r.id, editToken: 1, content: changed }),
    /overallocated/,
  );
  assert.equal(
    planVersions(
      (await ctx.store.read(ctx.workspaceId, 2026))!,
      "2026-07-01T00:00:00.000Z",
    ).scheduled?.version,
    1,
  );
});
test("source permissions apply to all frozen revisions before they are returned", async () => {
  const { ctx, change } = setup();
  await change({ kind: "draft", content: content() });
  await ctx.store.transact(ctx.workspaceId, 2026, (p) => {
    p.revisions[0]!.content.team.push({
      key: "private",
      memberSub: "member",
      memberName: "Private name",
      regionId: "east",
      unitId: null,
      unitName: "",
      role: "sales",
      start: "2026-01-01",
      end: "2027-01-01",
      percent: 100,
      requestedFte: null,
      note: "",
    });
  });
  await assert.rejects(
    readSalesPlan(
      {
        ...ctx,
        holder: {
          permissions: new Set(
            [...ctx.holder.permissions].filter((p) => p !== "admin.manage"),
          ),
        },
      },
      2026,
    ),
    /plan_source_permission/,
  );
});
test("adopted targets cannot be adjusted through the old entry and new managed scopes use a draft", async () => {
  const { ctx, change } = setup();
  let p = await change({ kind: "draft", content: content() });
  p = await change({
    kind: "release",
    revisionId: p.revisions[0]!.id,
    editToken: 1,
    reason: "",
  });
  const { InMemoryPlanningStore } = await import("./store");
  const { withSalesPlanTargets } = await import("./effective-targets");
  const { updateTarget, createTarget } = await import("./service");
  const { InMemoryCatalogStore } = await import("../catalog/store");
  const store = withSalesPlanTargets(new InMemoryPlanningStore(), ctx.store);
  const rows = await store.listTargets(ctx.workspaceId);
  assert.equal(rows.length, 2);
  const result = await updateTarget({ ...ctx, store }, rows[0]!.id, {
    amount: 500,
  });
  assert.equal(
    !result.ok && result.violations[0]?.code,
    "managed_by_sales_plan",
  );
  const created = await createTarget(
    { ...ctx, store, catalog: new InMemoryCatalogStore() },
    {
      scope: {
        period: "2026Q1",
        metric: "revenue",
        scopeType: "workspace",
        territoryId: null,
        ownerSub: null,
      },
      amount: 20,
    },
  );
  assert.equal(
    !created.ok && created.violations[0]?.code,
    "managed_by_sales_plan",
  );
});
test("planning findings use declared targets and deduplicate shared resource evidence", async () => {
  const { planningFindings } = await import("./plan-checks");
  const c = content();
  let findings = planningFindings(c);
  assert.equal(findings.filter((f) => f.kind === "customer_gap").length, 1);
  assert.equal(
    findings.find((f) => f.kind === "customer_gap")!.value,
    "1000.00",
  );
  c.team = ["a", "b"].map((key) => ({
    key,
    regionId: "east",
    memberSub: "one",
    memberName: "One",
    unitId: null,
    unitName: "",
    role: "sales",
    start: "2026-01-01",
    end: "2027-01-01",
    percent: 60,
    requestedFte: null,
    note: "",
  }));
  findings = planningFindings(c);
  assert.equal(findings.filter((f) => f.kind === "over_capacity").length, 1);
  assert.equal(findings.find((f) => f.kind === "over_capacity")!.value, "120");
});
