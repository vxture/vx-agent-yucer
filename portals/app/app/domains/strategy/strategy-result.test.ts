import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryStrategyStore } from "./store";
import {
  createPlan,
  editPlan,
  publishStrategy,
  reviseStrategy,
  type StrategyContext,
} from "./service";
import { listStrategyOptions, saveStrategyOption } from "./type-service";
import { defaultStrategyTypeId } from "./lib/strategy-type";
import {
  advancedFilled,
  strategyToday,
  alignResultRelations,
  consistencyWarnings,
  emptyStrategyResult,
  goalExpectations,
  strategyResultIssues,
  validStrategyResult,
  type StrategyResult,
} from "./lib/strategy-result";
import { readPlanDraft, type PlanVocabulary } from "./plan-assist-service";

function goal() {
  return {
    id: randomUUID(),
    metric: "revenue" as const,
    name: "Revenue",
    baseline: "0",
    target: "1000000",
    unit: "CNY",
    dueOn: "2099-12-31",
    criterion: "Signed revenue",
  };
}
function result(): StrategyResult {
  return { ...emptyStrategyResult(), goals: [goal()] };
}
function context(): StrategyContext {
  return {
    workspaceId: "result-test",
    sub: "owner",
    store: new InMemoryStrategyStore(),
    memberDirectory: {
      listMembers: async () => [
        { sub: "owner", displayName: "Owner", status: "active" },
      ],
    },
    holder: { permissions: new Set(permissionsForRoles(["sales_leader"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: "result-test",
      product: "yucer",
      tier: "business",
    },
  };
}

test("incomplete drafts survive; publication requires seven business fields", async () => {
  const c = context(),
    p = unwrap(
      await createPlan(c, {
        name: "Draft",
        period: "2099",
        planNo: "DRAFT",
        ownerSub: null,
        objective: null,
        result: emptyStrategyResult(),
      }),
    );
  const refused = await publishStrategy(c, p.id, p.editToken!);
  assert.equal(refused.ok, false);
  if (!refused.ok)
    assert.equal(refused.violations[0].code, "strategy_incomplete");
  const saved = unwrap(
    await editPlan(
      c,
      p.id,
      {
        ...p,
        result: {
          ...emptyStrategyResult(),
          risks: [
            {
              id: randomUUID(),
              kind: "risk",
              description: "Concentration",
              response: "",
            },
          ],
        },
      },
      { expectedEditToken: p.editToken },
    ),
  );
  assert.equal(saved.result?.risks[0].description, "Concentration");
  assert.equal(saved.status, "draft");
});

test("published result and dictionary names are immutable; revision inherits without altering downstream goal IDs", async () => {
  const c = context(),
    option = (await c.store.listStrategyOptions(c.workspaceId)).find(
      (o) => o.kind === "value",
    )!;
  const segment = await c.store.upsertSegment(c.workspaceId, {
    segmentCode: "MKT",
    name: "Retail",
    priority: 0,
    status: "active",
    criteria: { industries: [], regions: [], sizes: ["Midmarket"] },
  });
  const data = { ...result(), valuePropositionId: option.id };
  const p = unwrap(
    await createPlan(c, {
      name: "Strategy",
      period: "2099",
      planNo: "RESULT",
      ownerSub: "owner",
      objective: "Win midmarket retailers",
      strategyTypeId: defaultStrategyTypeId(0),
      result: data,
      expectations: goalExpectations(data, "CNY"),
      targetMarkets: [
        { segmentId: segment.id, intent: "focus", approach: null },
      ],
    }),
  );
  const v1 = unwrap(await publishStrategy(c, p.id, p.editToken!));
  unwrap(await saveStrategyOption(c, { ...option, name: "Changed" }));
  assert.equal(
    (
      await c.store.getPlan(c.workspaceId, v1.id)
    )?.publishedSnapshot?.options?.find((o) => o.id === option.id)?.name,
    option.name,
  );
  assert.equal(
    await c.store.updatePlan(c.workspaceId, v1.id, {
      result: emptyStrategyResult(),
    }),
    false,
  );
  const revision = unwrap(await reviseStrategy(c, v1.id));
  assert.equal(revision.result?.goals[0].id, data.goals[0].id);
  const saved = unwrap(
    await editPlan(
      c,
      revision.id,
      {
        ...revision,
        changeReason: "Adjust target",
        result: {
          ...data,
          goals: data.goals.map((g) => ({ ...g, target: "1200000" })),
        },
        expectations: goalExpectations(
          {
            ...data,
            goals: data.goals.map((g) => ({ ...g, target: "1200000" })),
          },
          "CNY",
        ),
      },
      { expectedEditToken: revision.editToken },
    ),
  );
  const v2 = unwrap(await publishStrategy(c, saved.id, saved.editToken!));
  assert.equal(v2.versionNo, 2);
  assert.equal(v1.result?.goals[0].target, "1000000");
});

test("dates distinguish new overdue targets from retained historical commitments", () => {
  const x = result();
  x.goals[0].dueOn = "2020-01-01";
  assert.equal(
    strategyResultIssues(x, { today: "2026-11-18" }).some(
      (e) => e.code === "past",
    ),
    true,
  );
  assert.equal(
    strategyResultIssues(x, { today: "2026-11-18", previous: x }).length,
    0,
  );
  const bad = { ...x, goals: [{ ...x.goals[0], dueOn: "2026-02-30" }] };
  assert.equal(validStrategyResult(bad), false);
  assert.equal(
    validStrategyResult({
      ...x,
      milestones: [
        {
          id: randomUUID(),
          name: "Pilot",
          startOn: "2027-02-01",
          endOn: "2027-01-01",
          deliverable: "",
        },
      ],
    }),
    false,
  );
  assert.equal(
    strategyResultIssues({
      ...x,
      goals: [{ ...x.goals[0], baseline: "abc" }],
    }).some((e) => e.field.endsWith("baseline")),
    true,
  );
});

test("advanced filled count preserves zeros and independent sections", () => {
  const x = emptyStrategyResult();
  assert.equal(advancedFilled(x), 0);
  x.resources.people = "0";
  assert.equal(advancedFilled(x), 1);
  assert.equal(
    advancedFilled({
      ...x,
      milestones: [
        { id: randomUUID(), name: "", startOn: "", endOn: "", deliverable: "" },
      ],
    }),
    1,
  );
  assert.equal(
    advancedFilled({
      ...x,
      risks: [
        {
          id: randomUUID(),
          kind: "assumption",
          description: "Budget available",
          response: "",
        },
      ],
    }),
    2,
  );
});

test("Ansoff checks are contextual, nonblocking, and never infer unknown as existing", () => {
  const x = {
    ...result(),
    markets: [{ id: randomUUID(), novelty: "unknown" as const }],
    offerings: [
      { id: randomUUID(), kind: "product" as const, novelty: "new" as const },
    ],
  };
  assert.deepEqual(consistencyWarnings("market-depth", x), ["new-product"]);
  assert.equal(validStrategyResult(x), true);
  assert.deepEqual(consistencyWarnings("product-innovation", x), []);
  assert.deepEqual(consistencyWarnings("defense", x), []);
  assert.deepEqual(
    consistencyWarnings("diversification", {
      ...x,
      offerings: [{ ...x.offerings[0], novelty: "existing" }],
    }),
    ["existing-product"],
  );
});

test("custom metrics stay independent from the three downstream planning metrics", () => {
  const x = {
    ...result(),
    goals: [
      ...result().goals,
      {
        ...goal(),
        id: randomUUID(),
        metric: null,
        name: "Gross margin",
        target: "40",
        unit: "%",
      },
    ],
  };
  assert.equal(validStrategyResult(x), true);
  assert.equal(goalExpectations(x, "USD").length, 1);
  assert.equal(goalExpectations(x, "USD")[0].currency, "USD");
  assert.equal(validStrategyResult({ ...x, goals: [goal(), goal()] }), false);
});

test("dictionary choices are workspace scoped, configurable, and UUID keyed", async () => {
  const c = context(),
    rows = unwrap(await listStrategyOptions(c));
  assert.equal(rows.length, 10);
  unwrap(
    await saveStrategyOption(c, {
      ...rows[0],
      name: "Localized promise",
      enabled: false,
    }),
  );
  assert.equal(
    unwrap(await listStrategyOptions(c)).find((o) => o.id === rows[0].id)?.name,
    "Localized promise",
  );
  assert.notEqual(
    unwrap(await listStrategyOptions({ ...c, workspaceId: "other" }))[0].name,
    "Localized promise",
  );
  unwrap(
    await saveStrategyOption(c, {
      id: "",
      kind: "path",
      code: "franchise",
      name: "Franchise",
      enabled: true,
      sortOrder: 8,
    }),
  );
  assert.match(
    unwrap(await listStrategyOptions(c)).find((o) => o.code === "franchise")!
      .id,
    /^[0-9a-f-]{36}$/,
  );
  assert.equal(
    (await listStrategyOptions({ ...c, holder: { permissions: new Set() } }))
      .ok,
    false,
  );
});

test("assistant updates actual fields and inherits selected market offerings; unknown UUIDs never pass", async () => {
  const c = context(),
    options = await c.store.listStrategyOptions(c.workspaceId),
    market = randomUUID(),
    product = randomUUID();
  const v: PlanVocabulary = {
    types: [{ id: defaultStrategyTypeId(0), name: "Deepen", enabled: true }],
    options,
    members: [{ sub: "owner", displayName: "Owner" }],
    markets: [
      {
        id: market,
        name: "Retail",
        criteria: { sizes: ["Midmarket"] },
        productIds: [product],
      },
    ],
    products: [{ id: product, name: "POS" }],
    solutions: [],
    currency: "CNY",
  };
  const current = {
    name: "",
    period: "2099",
    ownerSub: null,
    objective: null,
    result: emptyStrategyResult(),
  };
  const data = {
    ...result(),
    valuePropositionId: options[0].id,
    markets: [{ id: market, novelty: "existing" as const }],
    offerings: [
      { id: product, kind: "product" as const, novelty: "existing" as const },
    ],
  };
  const answer = JSON.stringify({
    message: "Draft prepared",
    fields: {
      name: "Retail strategy",
      ownerSub: "owner",
      strategyTypeId: defaultStrategyTypeId(0),
      objective: "Win retailers",
      targetMarkets: [{ segmentId: market }],
      result: data,
    },
  });
  const read = readPlanDraft(answer, current, v);
  assert.equal(read?.patch.name, "Retail strategy");
  assert.deepEqual(read?.patch.targetMarkets?.[0].productIds, [product]);
  assert.equal(read?.patch.expectations?.[0].id, data.goals[0].id);
  assert.equal(readPlanDraft("I have filled the form", current, v), null);
  assert.equal(
    readPlanDraft(
      JSON.stringify({ fields: { ownerSub: "invented" } }),
      current,
      v,
    ),
    null,
  );
  assert.equal(
    readPlanDraft(
      JSON.stringify({
        fields: { targetMarkets: [{ segmentId: randomUUID() }] },
      }),
      current,
      v,
    ),
    null,
  );
  assert.equal(
    readPlanDraft(
      JSON.stringify({
        fields: { result: { ...data, valuePropositionId: randomUUID() } },
      }),
      current,
      v,
    ),
    null,
  );
});

test("result metadata cannot inject unrelated identities; relation-only edits retain remaining novelty", async () => {
  const c = context();
  const segment = await c.store.upsertSegment(c.workspaceId, {
    segmentCode: "MKT-META",
    name: "Retail",
    priority: 0,
    status: "active",
    criteria: { industries: [], regions: [], sizes: [] },
  });
  const data = {
    ...emptyStrategyResult(),
    markets: [{ id: segment.id, novelty: "existing" as const }],
  };
  assert.equal(
    (
      await createPlan(c, {
        planNo: "BAD-META",
        name: "Draft",
        period: "2099",
        ownerSub: null,
        objective: null,
        result: data,
      })
    ).ok,
    false,
  );
  const p = unwrap(
    await createPlan(c, {
      planNo: "META",
      name: "Draft",
      period: "2099",
      ownerSub: null,
      objective: null,
      result: data,
      targetMarkets: [
        { segmentId: segment.id, intent: "focus", approach: null },
      ],
    }),
  );
  const edited = unwrap(await editPlan(c, p.id, { ...p, result: undefined, targetMarkets: [] }));
  assert.deepEqual(edited.result?.markets, []);
  const unavailable = randomUUID();
  assert.equal(
    alignResultRelations(
      {
        ...data,
        offerings: [{ id: unavailable, kind: "product", novelty: "new" }],
      },
      {},
      { productIds: [unavailable] },
    ).offerings[0].novelty,
    "new",
  );
});

test("assistant removal aligns retained metadata without accepting invented explicit relations", async () => {
  const c = context(),
    market = randomUUID();
  const current = {
    name: "Draft",
    period: "2099",
    ownerSub: null,
    objective: null,
    targetMarkets: [
      { segmentId: market, intent: "focus" as const, approach: null },
    ],
    result: {
      ...emptyStrategyResult(),
      markets: [{ id: market, novelty: "existing" as const }],
    },
  };
  const v: PlanVocabulary = {
    types: [],
    options: await c.store.listStrategyOptions(c.workspaceId),
    members: [],
    markets: [{ id: market, name: "Retail", criteria: {} }],
    products: [],
    solutions: [],
    currency: "CNY",
  };
  const read = readPlanDraft(
    JSON.stringify({ fields: { targetMarkets: [] } }),
    current,
    v,
  );
  assert.deepEqual(read?.patch.result?.markets, []);
  assert.equal(
    readPlanDraft(
      JSON.stringify({ fields: { targetMarkets: [], result: current.result } }),
      current,
      v,
    ),
    null,
  );
});

test("goal calendar follows the established workspace business date across UTC midnight", () => {
  assert.equal(strategyToday(new Date("2026-11-18T18:00:00Z")), "2026-11-19");
});
