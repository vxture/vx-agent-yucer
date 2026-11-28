import { test } from "node:test";
import assert from "node:assert/strict";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { InMemoryAccountStore, type AccountRecord } from "../account/store";
import { InMemorySalesPlanStore } from "./plan-store";
import { emptyContent, type SalesPlan } from "./plan-model";
import {
  readPlanActionResults,
  recordPlanActionResult,
  type PlanActionResultInput,
} from "./action-result";
import type { FocusContext } from "./focus-read";
const at = "2026-07-01T00:00:00.000Z";
function fixture() {
  const content = emptyContent(
    2026,
    [
      {
        id: "east",
        divisionId: "east",
        name: "East",
        code: "E",
        included: true,
        provinces: [],
        reason: "",
        ownerSub: "ops",
      },
    ],
    "CNY",
  );
  content.actions = [
    {
      key: "a1",
      accountId: "a",
      regionId: "east",
      targetKey: null,
      objective: "Confirm requirements",
      ownerSub: "rep",
      due: "2026-08-01",
      evidenceRefs: [],
    },
  ];
  const store = new InMemorySalesPlanStore(),
    accounts = new InMemoryAccountStore();
  accounts.seed({
    accounts: [
      {
        id: "a",
        name: "Customer",
        accountNo: "ACC-1",
        workspaceId: "ws",
        ownerSub: "rep",
        status: "active",
        tier: "standard",
      } as AccountRecord,
    ],
  });
  const plan: SalesPlan = {
    id: "p",
    workspaceId: "ws",
    year: 2026,
    revisions: [
      {
        id: "r",
        state: "sealed",
        editToken: 1,
        version: 1,
        baseId: null,
        restoresId: null,
        content,
        contentHash: "hash",
        reason: "",
        createdBy: "ops",
        createdAt: at,
        sealedBy: "ops",
        sealedAt: at,
      },
    ],
    events: [
      {
        id: "e",
        no: 1,
        kind: "release",
        revisionId: "r",
        relatedId: null,
        period: null,
        at,
        effectiveAt: at,
        actor: "ops",
        reason: "",
        requestKey: "release-1",
        requestHash: "hash",
      },
    ],
    legacy: [],
  };
  store.seed([plan]);
  const ctx: FocusContext = {
    workspaceId: "ws",
    sub: "ops",
    scope: { kind: "workspace" },
    store,
    accounts,
    holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: "ws",
      product: "yucer",
      tier: "enterprise",
    },
    now: () => new Date("2026-11-01T00:00:00Z"),
  };
  return ctx;
}
const input = (
  over: Partial<PlanActionResultInput> = {},
): PlanActionResultInput => ({
  year: 2026,
  period: "Y2026",
  revisionId: "r",
  accountId: "a",
  actionKey: "a1",
  met: true,
  evidence: "Signed requirements confirmed",
  occurredAt: "2026-08-01",
  requestKey: "verification-1",
  ...over,
});
test("verification is exact-revision evidence, idempotent, and corrections append", async () => {
  const ctx = fixture();
  const first = await recordPlanActionResult(ctx, input());
  assert.equal(first.met, true);
  assert.equal((await recordPlanActionResult(ctx, input())).id, first.id);
  await assert.rejects(
    recordPlanActionResult(ctx, input({ met: false })),
    /request_conflict/,
  );
  await recordPlanActionResult(
    ctx,
    input({
      met: false,
      evidence: "Acceptance withdrawn",
      requestKey: "verification-2",
    }),
  );
  assert.equal(
    (await readPlanActionResults(ctx, { year: 2026 }))[0]!.met,
    false,
  );
  assert.equal(first.met, true);
  assert.equal(
    (await ctx.store.read("ws", 2026))!.revisions[0]!.content.actions[0]!
      .objective,
    "Confirm requirements",
  );
});
test("unpublished action, stale revision, foreign workspace, revoked permission and future evidence are refused", async () => {
  const ctx = fixture();
  for (const value of [
    input({ revisionId: "foreign" }),
    input({ actionKey: "unknown" }),
    input({ occurredAt: "2026-11-02" }),
    input({ occurredAt: "2026-02-31" }),
    input({ evidence: " " }),
  ])
    await assert.rejects(recordPlanActionResult(ctx, value));
  await assert.rejects(
    recordPlanActionResult({ ...ctx, workspaceId: "foreign" }, input()),
  );
  await assert.rejects(
    recordPlanActionResult(
      { ...ctx, holder: { permissions: new Set() } },
      input(),
    ),
  );
  assert.deepEqual(await ctx.store.actionResults("ws", "r"), []);
});
test("a failed plan transaction rolls back its appended verification too", async () => {
  const ctx = fixture();
  const row = await recordPlanActionResult(ctx, input());
  await assert.rejects(
    ctx.store.transact("ws", 2026, async (_plan, write) => {
      await write.appendActionResult({
        ...row,
        id: "another",
        met: false,
        requestKey: "rollback-request",
      });
      throw new Error("later failure");
    }),
  );
  assert.equal((await ctx.store.actionResults("ws", "r"))[0]!.met, true);
});

test("a closed planning year refuses new acceptance evidence", async () => {
  const ctx = fixture();
  const plan = (await ctx.store.read("ws", 2026))!;
  plan.events.push({
    ...plan.events[0]!,
    id: "closed",
    no: 2,
    kind: "close",
    period: null,
    at: "2026-10-01T00:00:00Z",
    effectiveAt: "2026-10-01T00:00:00Z",
    requestKey: "year-close",
  });
  await ctx.store.transact("ws", 2026, (current) => {
    current.events = plan.events;
  });
  await assert.rejects(recordPlanActionResult(ctx, input()), /draft_conflict/);
  assert.deepEqual(await ctx.store.actionResults("ws", "r"), []);
});
