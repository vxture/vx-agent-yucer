import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { PrismaStrategyStore } from "./prisma-store";
import { emptyStrategyResult, goalExpectations } from "./lib/strategy-result";
const skip = process.env.DATABASE_URL ? false : "no DATABASE_URL";
const WS = "eeeeeeee-0125-4000-8000-000000000001",
  OTHER = "eeeeeeee-0125-4000-8000-000000000002";
async function sql<T>(fn: (c: Client) => Promise<T>, role = false) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    if (role) await c.query("SET ROLE yucer_svc");
    return await fn(c);
  } finally {
    await c.end();
  }
}
async function cleanup() {
  await sql(async (c) => {
    for (const table of [
      "strategy_plan_event",
      "strategy_plan",
      "market_segment",
      "strategy_option",
      "strategy_type",
    ]) {
      await c.query(
        `DELETE FROM yucer_gtm.${table} WHERE workspace_id IN ($1,$2)`,
        [WS, OTHER],
      );
    }
  });
}

test(
  "database roundtrip, publication snapshot, dictionary freeze and revision copy preserve the complete strategy result",
  { skip },
  async () => {
    await cleanup();
    try {
      const s = new PrismaStrategyStore(),
        options = await s.listStrategyOptions(WS),
        type = (await s.listStrategyTypes(WS))[0];
      const segment = await s.upsertSegment(
        WS,
        {
          segmentCode: "RESULT-MKT",
          name: "Retail",
          priority: 1,
          status: "active",
          criteria: { industries: [], regions: [], sizes: ["Midmarket"] },
        },
        "create",
      );
      const value = options.find((o) => o.kind === "value")!;
      const result = {
        ...emptyStrategyResult(),
        valuePropositionId: value.id,
        goals: [
          {
            id: randomUUID(),
            metric: "revenue" as const,
            name: "Revenue",
            baseline: "0",
            target: "1000000",
            unit: "CNY",
            dueOn: "2099-12-31",
            criterion: "Signed",
          },
        ],
        risks: [
          {
            id: randomUUID(),
            kind: "risk" as const,
            description: "Buyer budget",
            response: "Validate with sponsors",
          },
        ],
      };
      const p = (await s.createPlan(WS, {
        planNo: "RESULT-2099",
        name: "Retail strategy",
        period: "2099",
        strategyTypeId: type.id,
        ownerSub: "owner",
        objective: "Deepen retail",
        result,
        expectations: goalExpectations(result, "CNY"),
        targetMarkets: [
          {
            segmentId: segment.id,
            marketName: segment.name,
            criteria: segment.criteria,
            intent: "focus",
            approach: null,
            solutionIds: [],
          },
        ],
      }))!;
      assert.deepEqual(p.result, result);
      const v1 = await s.publishPlan(WS, p.id, {
        expectedEditToken: p.editToken!,
        actorSub: "owner",
        at: new Date(),
        solutions: [],
        ownerName: "Owner",
      });
      assert.deepEqual(v1.publishedSnapshot?.result, result);
      assert.equal(v1.publishedSnapshot?.options?.[0].name, value.name);
      await s.saveStrategyOption(WS, { ...value, name: "Renamed promise" });
      assert.equal(
        (await s.getPlan(WS, p.id))?.resultOptions?.[0].name,
        value.name,
      );
      assert.equal(
        await s.updatePlan(WS, p.id, { result: emptyStrategyResult() }),
        false,
      );
      await assert.rejects(
        sql(
          (c) =>
            c.query(
              "UPDATE yucer_gtm.strategy_plan SET result=$1 WHERE id=$2",
              [JSON.stringify(emptyStrategyResult()), p.id],
            ),
          true,
        ),
        /immutable_strategy/,
      );
      const revision = await s.createRevision(WS, p.id, "editor");
      assert.deepEqual(revision.result, result);
      assert.equal(revision.result?.goals[0].id, p.result?.goals[0].id);
      await s.discardDraft(WS, revision.id, revision.editToken!, "editor");
    } finally {
      await cleanup();
    }
  },
);

test(
  "database refuses incomplete publication, wrong-kind/cross-workspace options and divergent goal projections",
  { skip },
  async () => {
    await cleanup();
    try {
      const s = new PrismaStrategyStore();
      const options = await s.listStrategyOptions(WS),
        other = await s.listStrategyOptions(OTHER);
      const draft = (await s.createPlan(WS, {
        planNo: "INCOMPLETE",
        name: "Draft",
        period: "2099",
        objective: null,
        ownerSub: null,
        result: emptyStrategyResult(),
      }))!;
      await assert.rejects(
        s.publishPlan(WS, draft.id, {
          expectedEditToken: draft.editToken!,
          actorSub: "owner",
          at: new Date(),
          solutions: [],
          ownerName: null,
        }),
        /strategy_incomplete/,
      );
      for (const valuePropositionId of [
        other[0].id,
        options.find((o) => o.kind === "path")!.id,
      ]) {
        await assert.rejects(
          s.updatePlan(WS, draft.id, {
            result: { ...emptyStrategyResult(), valuePropositionId },
          }),
          /strategy_option_unavailable/,
        );
      }
      await assert.rejects(
        s.updatePlan(WS, draft.id, {
          result: {
            ...emptyStrategyResult(),
            goals: [
              {
                id: randomUUID(),
                metric: "revenue",
                name: "Revenue",
                baseline: "0",
                target: "100",
                unit: "CNY",
                dueOn: "2099-12-31",
                criterion: "",
              },
            ],
          },
        }),
        /expectations_invalid/,
      );
      await assert.rejects(
        sql(
          (c) =>
            c.query(
              "UPDATE yucer_gtm.strategy_option SET kind='path' WHERE workspace_id=$1",
              [WS],
            ),
          true,
        ),
        /permission denied/,
      );
    } finally {
      await cleanup();
    }
  },
);
