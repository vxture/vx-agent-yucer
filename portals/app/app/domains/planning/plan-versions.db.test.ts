import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { PrismaSalesPlanStore } from "./plan-prisma-store";
import { emptyContent, planVersions } from "./plan-model";
import { changeSalesPlan, type SalesPlanContext } from "./plan-service";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
const skip = !process.env.DATABASE_URL;
async function pg<T>(run: (c: Client) => Promise<T>) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return await run(c);
  } finally {
    await c.end();
  }
}
function context(): SalesPlanContext {
  return {
    workspaceId: randomUUID(),
    sub: "test_ops",
    holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: "test",
      product: "yucer",
      tier: "enterprise",
    },
    scope: { kind: "workspace" },
    store: new PrismaSalesPlanStore(),
  };
}
test(
  "Postgres: published aggregate is immutable, role cannot bypass sealing, workspace FKs apply",
  { skip },
  async () => {
    const ctx = context();
    const year = new Date().getUTCFullYear();
    const content = emptyContent(year, [], "CNY");
    content.targets[0]!.target = "1000";
    content.allocationNote = "No regions allocated";
    let plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: 0,
      requestKey: randomUUID(),
      command: { kind: "draft", content },
    });
    const id = plan.revisions[0]!.id;
    await pg(async (c) => {
      await c.query("SET ROLE yucer_svc");
      await assert.rejects(
        c.query(
          "UPDATE yucer_gtm.sales_plan_revision SET state='sealed' WHERE id=$1",
          [id],
        ),
        /controlled_release_required/,
      );
      await c.query("RESET ROLE");
    });
    plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: plan.events.at(-1)!.no,
      requestKey: randomUUID(),
      command: { kind: "release", revisionId: id, editToken: 1, reason: "" },
    });
    assert.equal(
      planVersions(plan, new Date().toISOString()).current?.version,
      1,
    );
    const loaded = await ctx.store.read(ctx.workspaceId, year);
    assert.equal(loaded!.revisions[0]!.content.targets[0]!.target, "1000");
    await pg(async (c) => {
      await c.query("SET ROLE yucer_svc");
      for (const sql of [
        "UPDATE yucer_gtm.sales_plan_revision SET content='{}' WHERE id=$1",
        "DELETE FROM yucer_gtm.sales_plan_revision WHERE id=$1",
        "UPDATE yucer_gtm.sales_plan_event SET reason='rewrite' WHERE revision_id=$1",
      ])
        await assert.rejects(
          c.query(sql, [id]),
          /immutable_revision|permission denied/,
        );
      await c.query("RESET ROLE");
      await assert.rejects(
        c.query(
          "INSERT INTO yucer_gtm.sales_plan_revision (workspace_id,plan_id,content,created_by_sub) VALUES ($1,$2,$3,'bad')",
          [randomUUID(), plan.id, content],
        ),
        /invalid_plan|foreign key/,
      );
    });
  },
);
test(
  "Postgres: concurrent draft saves conflict, failed publish leaves no partial revision",
  { skip },
  async () => {
    const ctx = context();
    const year = new Date().getUTCFullYear();
    const content = emptyContent(year, [], "CNY");
    content.targets[0]!.target = "1000";
    content.allocationNote = "Unallocated";
    const plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: 0,
      requestKey: randomUUID(),
      command: { kind: "draft", content },
    });
    const id = plan.revisions[0]!.id;
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        changeSalesPlan(ctx, {
          year,
          expectedEventNo: plan.events.at(-1)!.no,
          requestKey: randomUUID(),
          command: { kind: "save", revisionId: id, editToken: 1, content },
        }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    await assert.rejects(
      changeSalesPlan(ctx, {
        year,
        expectedEventNo: 2,
        requestKey: randomUUID(),
        command: {
          kind: "release",
          revisionId: id,
          editToken: 2,
          reason: "",
          effectiveAt: "2000-01-01T00:00:00.000Z",
        },
      }),
      /retroactive_release/,
    );
    assert.equal(
      (await ctx.store.read(ctx.workspaceId, year))!.events.filter(
        (e) => e.kind === "release",
      ).length,
      0,
    );
  },
);
test(
  "Postgres: forecast snapshot and immutable target basis commit together across plan adjustments",
  { skip },
  async () => {
    const ctx = context();
    const year = new Date().getUTCFullYear();
    const content = emptyContent(year, [], "CNY");
    content.targets[0]!.target = "1000";
    content.allocationNote = "No region allocation";
    let plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: 0,
      requestKey: randomUUID(),
      command: { kind: "draft", content },
    });
    plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: plan.events.at(-1)!.no,
      requestKey: randomUUID(),
      command: {
        kind: "release",
        revisionId: plan.revisions[0]!.id,
        editToken: 1,
        reason: "",
      },
    });
    const { PrismaPipelineStore } = await import("../pipeline/prisma-store");
    const { PrismaPlanningStore } = await import("./prisma-store");
    const { resolveForecastTargetBasis, withSalesPlanTargets } = await import(
      "./effective-targets"
    );
    const { money } = await import("../shared/money");
    const pipeline = new PrismaPipelineStore();
    const basis = await resolveForecastTargetBasis(
      withSalesPlanTargets(new PrismaPlanningStore(), ctx.store),
      ctx.store,
      ctx.workspaceId,
      {
        period: `Y${year}`,
        scopeType: "workspace",
        territoryId: null,
        ownerSub: null,
      },
      "CNY",
    );
    const row = {
      period: `Y${year}`,
      scopeType: "workspace" as const,
      territoryId: null,
      ownerSub: null,
      currency: "CNY",
      snapshotAt: new Date(),
      commitAmount: money(0),
      bestCaseAmount: money(0),
      pipelineAmount: money(0),
      closedAmount: money(400),
      newLogoCount: 0,
      targetBasis: basis,
    };
    await pipeline.appendForecastSnapshot(ctx.workspaceId, row);
    plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: plan.events.at(-1)!.no,
      requestKey: randomUUID(),
      command: { kind: "draft", content },
    });
    const draft = plan.revisions.at(-1)!;
    const changed = structuredClone(draft.content);
    changed.targets[0]!.target = "800";
    plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: plan.events.at(-1)!.no,
      requestKey: randomUUID(),
      command: {
        kind: "save",
        revisionId: draft.id,
        editToken: 1,
        content: changed,
      },
    });
    plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: plan.events.at(-1)!.no,
      requestKey: randomUUID(),
      command: {
        kind: "release",
        revisionId: draft.id,
        editToken: 2,
        reason: "revised expectations",
      },
    });
    const history = await pipeline.listForecastSnapshots(ctx.workspaceId, {
      period: `Y${year}`,
    });
    const adopted = history[0]!.targetBasis!.find(
      (b) => b.metric === "revenue",
    )!;
    assert.equal(adopted.target, "1000");
    assert.equal(adopted.version, 1);
    assert.equal(history[0]!.closedAmount.amount / Number(adopted.target), 0.4);
    const current = await resolveForecastTargetBasis(
      withSalesPlanTargets(new PrismaPlanningStore(), ctx.store),
      ctx.store,
      ctx.workspaceId,
      {
        period: `Y${year}`,
        scopeType: "workspace",
        territoryId: null,
        ownerSub: null,
      },
      "CNY",
    );
    assert.equal(current.find((b) => b.metric === "revenue")!.target, "800");
    const invalid = {
      ...row,
      snapshotAt: new Date(row.snapshotAt.getTime() + 1),
      targetBasis: [...basis, basis[0]!],
    };
    await assert.rejects(
      pipeline.appendForecastSnapshot(ctx.workspaceId, invalid),
      /Unique constraint|unique constraint/,
    );
    assert.equal(
      (
        await pipeline.listForecastSnapshots(ctx.workspaceId, {
          period: `Y${year}`,
        })
      ).length,
      1,
    );
  },
);

test(
  "Postgres: document checks reject missing identities, misdated periods and invalid support",
  { skip },
  async () => {
    const year = new Date().getUTCFullYear();
    const valid = emptyContent(year, [], "CNY");
    valid.targets[0]!.target = "1000";
    valid.allocationNote = "No regional distribution";
    await pg(async (c) => {
      await c.query("SET ROLE yucer_svc");
      await c.query("SELECT yucer_gtm.check_sales_plan_document($1,true)", [
        valid,
      ]);
      for (const mutate of [
        (d: typeof valid) => {
          delete (d.targets[0] as unknown as Record<string, unknown>).scope;
        },
        (d: typeof valid) => {
          delete (d.targets[0] as unknown as Record<string, unknown>).metric;
        },
        (d: typeof valid) => {
          d.periods[1]!.end = `${year}-05-01`;
        },
        (d: typeof valid) => {
          d.allocationNote = "";
        },
        (d: typeof valid) => {
          d.targets[0]!.floor = "1001";
        },
      ]) {
        const bad = structuredClone(valid);
        mutate(bad);
        await assert.rejects(
          c.query("SELECT yucer_gtm.check_sales_plan_document($1,true)", [bad]),
          /invalid_target|invalid_period|overlapping_period|allocation_note_required|target_ladder/,
        );
      }
    });
  },
);

test(
  "Postgres: release retries are unique, scheduled replacement and cancellation stay atomic",
  { skip },
  async () => {
    const ctx = context();
    const year = new Date().getUTCFullYear();
    const content = emptyContent(year, [], "CNY");
    content.targets[0]!.target = "1000";
    content.allocationNote = "Not distributed";
    let plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: 0,
      requestKey: randomUUID(),
      command: { kind: "draft", content },
    });
    const release = {
      year,
      expectedEventNo: plan.events.at(-1)!.no,
      requestKey: randomUUID(),
      command: {
        kind: "release" as const,
        revisionId: plan.revisions[0]!.id,
        editToken: 1,
        reason: "",
      },
    };
    const published = await Promise.all([
      changeSalesPlan(ctx, release),
      changeSalesPlan(ctx, release),
    ]);
    assert.equal(published[0]!.revisions[0]!.version, 1);
    assert.equal(
      published[1]!.events.filter((e) => e.kind === "release").length,
      1,
    );
    plan = published[0]!;
    plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: plan.events.at(-1)!.no,
      requestKey: randomUUID(),
      command: { kind: "draft", content },
    });
    const draft = planVersions(plan, new Date().toISOString()).draft!;
    plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: plan.events.at(-1)!.no,
      requestKey: randomUUID(),
      command: {
        kind: "release",
        revisionId: draft.id,
        editToken: 1,
        reason: "Future revision",
        effectiveAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    assert.equal(
      planVersions(plan, new Date().toISOString()).current!.version,
      1,
    );
    assert.equal(
      planVersions(plan, new Date().toISOString()).scheduled!.version,
      2,
    );
    const persisted = await ctx.store.read(ctx.workspaceId, year);
    const persistedState = planVersions(persisted!, new Date().toISOString());
    assert.equal(persistedState.current!.version, 1);
    assert.equal(persistedState.scheduled!.version, 2);
    assert.equal(
      persisted!.events.at(-1)!.effectiveAt,
      plan.events.at(-1)!.effectiveAt,
    );
    await pg(async (c) => {
      await c.query("SET ROLE yucer_svc");
      await assert.rejects(
        c.query(
          "INSERT INTO yucer_gtm.sales_target(workspace_id,period,scope_type,metric,target_amount,currency) VALUES($1,$2,'workspace','new_logo',1,NULL)",
          [ctx.workspaceId, `${year}Q1`],
        ),
        /managed_by_sales_plan/,
      );
      await c.query(
        "INSERT INTO yucer_gtm.sales_target(workspace_id,period,scope_type,owner_sub,metric,target_amount,currency) VALUES($1,$2,'owner','independent','new_logo',1,NULL)",
        [ctx.workspaceId, `Y${year}`],
      );
    });
    const cancel = {
      year,
      expectedEventNo: plan.events.at(-1)!.no,
      requestKey: randomUUID(),
      command: { kind: "cancel" as const, reason: "Cancel schedule" },
    };
    plan = await changeSalesPlan(ctx, cancel);
    const retry = await changeSalesPlan(ctx, cancel);
    assert.equal(retry.events.length, plan.events.length);
    assert.equal(planVersions(retry, new Date().toISOString()).scheduled, null);
    assert.equal(
      planVersions(retry, new Date().toISOString()).current!.version,
      1,
    );
  },
);

test(
  "Postgres: legacy creation during a draft requires explicit adoption before release",
  { skip },
  async () => {
    const ctx = context();
    const year = new Date().getUTCFullYear();
    const content = emptyContent(year, [], "CNY");
    content.targets[0]!.target = "1000";
    content.allocationNote = "No regions";
    let plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: 0,
      requestKey: randomUUID(),
      command: { kind: "draft", content },
    });
    const { PrismaPlanningStore } = await import("./prisma-store");
    const { withSalesPlanTargets } = await import("./effective-targets");
    const raw = new PrismaPlanningStore();
    const old = await raw.createTarget(ctx.workspaceId, {
      period: String(year),
      scopeType: "workspace",
      territoryId: null,
      ownerSub: null,
      metric: "revenue",
      targetValue: { unit: "money", amount: 1000, currency: "CNY" },
      status: "committed",
      planId: null,
    });
    const command = {
      kind: "release" as const,
      revisionId: plan.revisions[0]!.id,
      editToken: 1,
      reason: "",
    };
    await assert.rejects(
      changeSalesPlan(ctx, {
        year,
        expectedEventNo: 1,
        requestKey: randomUUID(),
        command,
      }),
      /legacy_source_changed/,
    );
    assert.equal(
      (await ctx.store.read(ctx.workspaceId, year))!.revisions[0]!.state,
      "draft",
    );
    plan = await changeSalesPlan(ctx, {
      year,
      expectedEventNo: 1,
      requestKey: randomUUID(),
      command: { ...command, adoptions: [{ targetId: old.id, snapshot: old }] },
    });
    const rows = await withSalesPlanTargets(raw, ctx.store).listTargets(
      ctx.workspaceId,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, old.id);
    assert.equal(rows[0]!.managedBySalesPlan, true);
    await pg(async (c) => {
      await c.query("SET ROLE yucer_svc");
      await assert.rejects(
        c.query(
          "UPDATE yucer_gtm.sales_target SET target_amount=1 WHERE id=$1",
          [old.id],
        ),
        /managed_by_sales_plan/,
      );
    });
  },
);
