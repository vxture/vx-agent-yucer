import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { money } from "../shared/money";
import { unwrap } from "../shared/result";
import { InMemoryCatalogStore, type CatalogStore } from "../catalog/store";
import { InMemoryPipelineStore, type OpportunityRecord, type StageDefinitionRecord } from "./store";
import { planStageDefinition, planStageRemoval, type StageDefinition } from "./lib/stage";
import {
  createOpportunity,
  listStageDefinitions,
  moveStageDefinition,
  removeStageDefinition,
  upsertStageDefinition,
  type PipelineContext,
} from "./service";

// 商机阶段 - incr/0057-0059, the vocabulary rules and the four service verbs.
//
// The database half (the CHECK constraints, the composite FK into
// opportunity.stage, the column grant) is proved in stage-definition.db.test.ts
// against a real Postgres. This file is the half that is a decision: what the
// product refuses, who may see and who may edit the catalog, and that a new
// deal actually lands on the workspace's OWN entry stage rather than the
// build's.

const WS = "ws_stage";

function ctx(
  role: RoleCode,
  tier: Entitlement["tier"],
  store = new InMemoryPipelineStore(),
): PipelineContext & { catalog: CatalogStore } {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
    catalog: new InMemoryCatalogStore(),
  };
}

function row(over: Partial<StageDefinitionRecord> = {}): StageDefinitionRecord {
  return {
    id: "stg_1",
    workspaceId: WS,
    stageCode: "intake",
    name: "接洽",
    sortOrder: 1,
    defaultProbability: 15,
    isWon: false,
    isTerminal: false,
    ...over,
  };
}

// --- The rule: planStageDefinition -------------------------------------------

test("a stage needs a code and a name", () => {
  const noCode = planStageDefinition({ code: "  ", name: "接洽", defaultProbability: 10, isWon: false, isTerminal: false });
  assert.equal(noCode.ok === false && noCode.violations[0].code, "code_required");
  const noName = planStageDefinition({ code: "intake", name: " ", defaultProbability: 10, isWon: false, isTerminal: false });
  assert.equal(noName.ok === false && noName.violations[0].code, "name_required");
});

test("the default win rate is range-checked like any other probability", () => {
  const bad = planStageDefinition({ code: "intake", name: "接洽", defaultProbability: 101, isWon: false, isTerminal: false });
  assert.equal(bad.ok === false && bad.violations[0].code, "probability_range");
});

test("a won stage must be terminal", () => {
  const r = planStageDefinition({ code: "closed", name: "已赢单", defaultProbability: 100, isWon: true, isTerminal: false });
  assert.equal(r.ok === false && r.violations[0].code, "won_must_be_terminal");
});

test("a won stage is fixed at 100%, a terminal non-won stage at 0% - the same line the DDL's CHECKs hold", () => {
  const wrongWon = planStageDefinition({ code: "closed", name: "已赢单", defaultProbability: 90, isWon: true, isTerminal: true });
  assert.equal(wrongWon.ok === false && wrongWon.violations[0].code, "won_probability_fixed");

  const wrongLost = planStageDefinition({ code: "dead", name: "已丢单", defaultProbability: 5, isWon: false, isTerminal: true });
  assert.equal(wrongLost.ok === false && wrongLost.violations[0].code, "lost_probability_fixed");

  assert.ok(planStageDefinition({ code: "closed", name: "已赢单", defaultProbability: 100, isWon: true, isTerminal: true }).ok);
  assert.ok(planStageDefinition({ code: "dead", name: "已丢单", defaultProbability: 0, isWon: false, isTerminal: true }).ok);
});

test("an open stage's probability is the only genuinely tenant-editable one, and trims the name", () => {
  const r = planStageDefinition({ code: " intake ", name: " 接洽 ", defaultProbability: 15, isWon: false, isTerminal: false });
  assert.ok(r.ok);
  assert.equal(r.ok && r.value.code, "intake");
  assert.equal(r.ok && r.value.name, "接洽");
});

// --- The rule: planStageRemoval -----------------------------------------------

const catalog3: readonly StageDefinition[] = [
  { code: "intake", name: "接洽", sortOrder: 1, defaultProbability: 15, isWon: false, isTerminal: false },
  { code: "closed", name: "已赢单", sortOrder: 2, defaultProbability: 100, isWon: true, isTerminal: true },
  { code: "dead", name: "已丢单", sortOrder: 3, defaultProbability: 0, isWon: false, isTerminal: true },
];

test("a stage with opportunities on it cannot be removed", () => {
  const r = planStageRemoval(3, catalog3[0]!, catalog3);
  assert.equal(r.ok === false && r.violations[0].code, "stage_in_use");
});

test("the workspace's last won stage cannot be removed, even unused", () => {
  const r = planStageRemoval(0, catalog3[1]!, catalog3);
  assert.equal(r.ok === false && r.violations[0].code, "last_won_stage");
});

test("the workspace's last (non-won) terminal stage cannot be removed, even unused", () => {
  const r = planStageRemoval(0, catalog3[2]!, catalog3);
  assert.equal(r.ok === false && r.violations[0].code, "last_lost_stage");
});

test("an unused, non-anchor stage may be removed", () => {
  const r = planStageRemoval(0, catalog3[0]!, catalog3);
  assert.ok(r.ok);
});

test("a second won stage frees the first to be removed", () => {
  const withTwoWon: readonly StageDefinition[] = [
    ...catalog3,
    { code: "closed2", name: "已成交", sortOrder: 4, defaultProbability: 100, isWon: true, isTerminal: true },
  ];
  const r = planStageRemoval(0, catalog3[1]!, withTwoWon);
  assert.ok(r.ok);
});

// --- listStageDefinitions: gate and first-contact seeding ---------------------

test("viewing the catalog needs pipeline.stage.view - it resolves to pipeline.read, so sales_rep may read it", async () => {
  const r = await listStageDefinitions(ctx("sales_rep", "free"));
  assert.ok(r.ok);
});

test("a holder with no permissions at all cannot even view the catalog", async () => {
  const bare: PipelineContext & { catalog: CatalogStore } = {
    ...ctx("sales_rep", "free"),
    holder: { permissions: new Set() },
  };
  const r = await listStageDefinitions(bare);
  assert.equal(r.ok, false);
});

test("an empty workspace reads back the shipped seven, seeded on first contact", async () => {
  const store = new InMemoryPipelineStore();
  const r = unwrap(await listStageDefinitions(ctx("sales_manager", "enterprise", store)));
  assert.deepEqual(
    r.map((s) => s.stageCode),
    ["qualify", "discover", "validate", "propose", "negotiate", "won", "lost"],
  );
  // Seeded for real, not just returned in memory - a second read sees the
  // same rows rather than seeding again.
  const again = unwrap(await listStageDefinitions(ctx("sales_manager", "enterprise", store)));
  assert.equal(again.length, 7);
});

test("a workspace that already has stages keeps them - seeding never overwrites", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([], { stageDefinitions: [row({ stageCode: "custom", name: "自定义" })] });
  const r = unwrap(await listStageDefinitions(ctx("sales_manager", "enterprise", store)));
  assert.deepEqual(r.map((s) => s.stageCode), ["custom"]);
});

// --- upsertStageDefinition: gate and validation --------------------------------

test("editing the catalog needs pipeline.stage.manage - sales_rep may view but not write it", async () => {
  const store = new InMemoryPipelineStore();
  const denied = await upsertStageDefinition(ctx("sales_rep", "enterprise", store), {
    code: "intake",
    name: "接洽",
    defaultProbability: 15,
    isWon: false,
    isTerminal: false,
  });
  assert.equal(denied.ok, false);

  const allowed = await upsertStageDefinition(ctx("sales_manager", "enterprise", store), {
    code: "intake",
    name: "接洽",
    defaultProbability: 15,
    isWon: false,
    isTerminal: false,
  });
  assert.ok(allowed.ok);
});

test("an invalid draft is refused before it reaches the store", async () => {
  const r = await upsertStageDefinition(ctx("sales_manager", "enterprise"), {
    code: "closed",
    name: "已赢单",
    defaultProbability: 90,
    isWon: true,
    isTerminal: true,
  });
  assert.equal(r.ok === false && r.violations[0].code, "won_probability_fixed");
});

// --- moveStageDefinition --------------------------------------------------------

test("reordering the catalog needs pipeline.stage.manage too", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([], {
    stageDefinitions: [
      row({ id: "s1", stageCode: "a", sortOrder: 1 }),
      row({ id: "s2", stageCode: "b", sortOrder: 2 }),
    ],
  });
  const denied = await moveStageDefinition(ctx("sales_rep", "enterprise", store), { stageId: "s2", direction: "up" });
  assert.equal(denied.ok, false);

  const moved = await moveStageDefinition(ctx("sales_manager", "enterprise", store), { stageId: "s2", direction: "up" });
  assert.ok(moved.ok);
  const after = unwrap(await listStageDefinitions(ctx("sales_manager", "enterprise", store)));
  assert.deepEqual(after.map((s) => s.stageCode), ["b", "a"]);
});

// --- removeStageDefinition -------------------------------------------------------

test("removing a stage runs the same refusals planStageRemoval does, through the store's own counts", async () => {
  const store = new InMemoryPipelineStore();
  store.seed(
    [
      {
        id: "opp_1",
        workspaceId: WS,
        opportunityNo: "OPP-1",
        name: "Deal",
        accountId: "acc_1",
        planId: null,
        campaignId: null,
        territoryId: null,
        ownerSub: "usr_rep",
        requirement: "req",
        sourceProjectId: null,
        stage: "a",
        forecastCategory: "pipeline",
        amount: money(1),
        probability: 15,
        expectedCloseAt: null,
        closedAt: null,
        status: "open",
        currency: "CNY",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      } satisfies OpportunityRecord,
    ],
    {
      stageDefinitions: [
        row({ id: "s1", stageCode: "a", sortOrder: 1 }),
        row({ id: "s2", stageCode: "b", sortOrder: 2, isWon: true, isTerminal: true, defaultProbability: 100 }),
        row({ id: "s3", stageCode: "c", sortOrder: 3, isTerminal: true, defaultProbability: 0 }),
      ],
    },
  );
  const managerCtx = ctx("sales_manager", "enterprise", store);

  const inUse = await removeStageDefinition(managerCtx, { stageId: "s1" });
  assert.equal(inUse.ok === false && inUse.violations[0].code, "stage_in_use");

  const lastWon = await removeStageDefinition(managerCtx, { stageId: "s2" });
  assert.equal(lastWon.ok === false && lastWon.violations[0].code, "last_won_stage");

  const lastLost = await removeStageDefinition(managerCtx, { stageId: "s3" });
  assert.equal(lastLost.ok === false && lastLost.violations[0].code, "last_lost_stage");
});

test("removing an unused, non-anchor stage succeeds and a second read no longer shows it", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([], {
    stageDefinitions: [
      row({ id: "s1", stageCode: "a", sortOrder: 1 }),
      row({ id: "s2", stageCode: "b", sortOrder: 2, isWon: true, isTerminal: true, defaultProbability: 100 }),
      row({ id: "s3", stageCode: "c", sortOrder: 3, isTerminal: true, defaultProbability: 0 }),
    ],
  });
  const managerCtx = ctx("sales_manager", "enterprise", store);
  const removed = await removeStageDefinition(managerCtx, { stageId: "s1" });
  assert.ok(removed.ok);
  const after = unwrap(await listStageDefinitions(managerCtx));
  assert.deepEqual(after.map((s) => s.stageCode), ["b", "c"]);
});

// --- createOpportunity lands on the workspace's OWN entry stage -----------------

test("createOpportunity enters at the workspace's own lowest-sort-order open stage, not the build's", async () => {
  const store = new InMemoryPipelineStore();
  store.seed([], {
    stageDefinitions: [
      row({ id: "s1", stageCode: "triage", name: "初筛", sortOrder: 1, defaultProbability: 5 }),
      row({ id: "s2", stageCode: "closed", name: "已赢单", sortOrder: 2, isWon: true, isTerminal: true, defaultProbability: 100 }),
    ],
  });
  const created = unwrap(
    await createOpportunity(ctx("sales_rep", "free", store), {
      name: "Custom-catalog deal",
      accountId: "acc_1",
      territoryId: null,
      ownerSub: "usr_rep",
      requirement: "custom catalog entry stage",
      amount: null,
      expectedCloseAt: null,
    }),
  );
  assert.equal(created.stage, "triage");
  assert.equal(created.probability, 5);
});
