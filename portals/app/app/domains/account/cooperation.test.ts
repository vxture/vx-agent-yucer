import { InMemoryPipelineStore } from "../pipeline/store";
import { test } from "node:test";
import assert from "node:assert/strict";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { InMemoryAccountStore, type AccountRecord } from "./store";
import {
  recordCooperationHistory,
  readCooperationHistory,
} from "./cooperation-service";
import { customerVintage, type CooperationInput } from "./lib/cooperation";
const now = () => new Date("2026-11-28T00:00:00Z");
function fixture() {
  const store = new InMemoryAccountStore();
  store.seed({
    accounts: [
      {
        id: "a",
        workspaceId: "ws",
        name: "A",
        accountNo: "ACC-A",
        status: "active",
        tier: "standard",
        ownerSub: "rep",
      } as AccountRecord,
    ],
  });
  return {
    workspaceId: "ws",
    sub: "ops",
    store,
    holder: { permissions: new Set(permissionsForRoles(["sales_rep"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: "ws",
      product: "yucer",
      tier: "enterprise" as const,
    },
  };
}
const input = (over: Partial<CooperationInput> = {}): CooperationInput => ({
  state: "before_year",
  firstDate: null,
  beforeYear: 2020,
  acquisitionOwnerSub: null,
  acquisitionTerritoryId: null,
  evidence: "Verified pre-system contracts",
  requestKey: "history-request-1",
  ...over,
});
test("real pre-system history is appended and corrected without changing the previous fact", async () => {
  const ctx = fixture();
  const first = await recordCooperationHistory(ctx, "a", input(), now);
  assert.ok(first.ok);
  if (!first.ok) return;
  assert.equal(customerVintage(first.value, 2026), "old");
  const corrected = await recordCooperationHistory(
    ctx,
    "a",
    input({
      state: "dated",
      beforeYear: null,
      firstDate: "2010-04-01",
      requestKey: "history-request-2",
    }),
    now,
  );
  assert.ok(corrected.ok);
  const read = await readCooperationHistory(ctx);
  assert.ok(read.ok);
  if (read.ok) assert.equal(read.value[0]!.firstDate, "2010-04-01");
  assert.equal(first.value.state, "before_year");
});
test("idempotent retry returns the original fact and conflicting reuse is rejected", async () => {
  const ctx = fixture();
  const one = await recordCooperationHistory(ctx, "a", input(), now),
    two = await recordCooperationHistory(ctx, "a", input(), now);
  assert.deepEqual(one, two);
  await assert.rejects(
    recordCooperationHistory(ctx, "a", input({ beforeYear: 2019 }), now),
    /request_conflict/,
  );
});
test("tenant, permission, missing customer and invalid dates cannot write evidence", async () => {
  const ctx = fixture();
  assert.equal(
    (
      await recordCooperationHistory(
        { ...ctx, workspaceId: "foreign" },
        "a",
        input(),
        now,
      )
    ).ok,
    false,
  );
  assert.equal(
    (
      await recordCooperationHistory(
        { ...ctx, holder: { permissions: new Set() } },
        "a",
        input(),
        now,
      )
    ).ok,
    false,
  );
  assert.equal(
    (await recordCooperationHistory(ctx, "other", input(), now)).ok,
    false,
  );
  for (const value of [
    input({ state: "dated", beforeYear: null, firstDate: "2026-02-31" }),
    input({ beforeYear: 2027 }),
    input({ state: "dated", beforeYear: null, firstDate: "2026-12-01" }),
    input({ evidence: " " }),
    input({
      state: "dated",
      beforeYear: null,
      firstDate: "2026-02-01",
      acquisitionOwnerSub: "rep",
    }),
  ])
    assert.equal(
      (await recordCooperationHistory(ctx, "a", value, now)).ok,
      false,
    );
  const read = await readCooperationHistory(ctx);
  assert.ok(read.ok && read.value.length === 0);
});

test("recorded wins reject a later first-cooperation date and never-cooperated assertions", async () => {
  const ctx = fixture(),
    pipeline = new InMemoryPipelineStore();
  pipeline.seed([
    {
      id: "win",
      workspaceId: "ws",
      accountId: "a",
      status: "won",
      closedAt: new Date("2010-01-01"),
    } as never,
  ]);
  assert.equal(
    (
      await recordCooperationHistory(
        { ...ctx, pipeline },
        "a",
        input({ state: "never", beforeYear: null }),
        now,
      )
    ).ok,
    false,
  );
  assert.equal(
    (
      await recordCooperationHistory(
        { ...ctx, pipeline },
        "a",
        input({ state: "dated", beforeYear: null, firstDate: "2026-01-01" }),
        now,
      )
    ).ok,
    false,
  );
  assert.equal(
    (
      await recordCooperationHistory(
        { ...ctx, pipeline },
        "a",
        input({ beforeYear: 2020 }),
        now,
      )
    ).ok,
    true,
  );
});
