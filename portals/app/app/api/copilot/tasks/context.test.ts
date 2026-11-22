import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import type { AppSession } from "../../../(app)/lib/session";
import { EMPTY_ENTITLEMENT } from "../../../entitlement/types";
import { permissionsForRoles } from "../../../authz/catalog";
import { scopeAccountStore } from "../../../authz/scoped-stores";
import {
  InMemoryAccountStore,
  type AccountRecord,
} from "../../../domains/account/store";
import {
  InMemoryStrategyStore,
  type PlanRecord,
} from "../../../domains/strategy/store";
import { setStrategyStore } from "../../../domains/shared/registry";
import { fail, violation, ok } from "../../../domains/shared/result";
import { readTaskSource } from "./context";
import { privateRequest, readTaskBody, taskResponse } from "./http";

const WS = "aa000000-0000-4000-a000-000000000101",
  ID = "aa000000-0000-4000-a000-000000000110";
function session(store: InMemoryAccountStore, owner = "alice"): AppSession {
  return {
    workspaceId: WS,
    user: { sub: owner },
    authz: { permissions: new Set(permissionsForRoles(["sales_rep"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: WS,
      product: "yucer",
      tier: "pro",
    },
    stores: {
      account: () =>
        scopeAccountStore(store, { kind: "own", sub: owner, accountIds: [] }),
    },
  } as unknown as AppSession;
}
afterEach(() => setStrategyStore(null));

test("source metadata uses the real scoped account store, including cross-workspace refusal", async () => {
  const store = new InMemoryAccountStore();
  store.seed({
    accounts: [
      {
        id: ID,
        workspaceId: WS,
        name: "private customer",
        ownerSub: "alice",
        accountNo: "ACC-1",
        status: "active",
        tier: "standard",
      } as AccountRecord,
    ],
  });
  const c = session(store),
    obj = { kind: "account" as const, id: ID };
  const source = await readTaskSource(c, obj);
  assert.ok(source);
  assert.equal(source.kind, "account");
  assert.match(source.version, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(source), /private customer/);
  assert.equal(await readTaskSource(session(store, "bob"), obj), null);
  assert.equal(
    await readTaskSource(
      { ...c, workspaceId: "aa000000-0000-4000-a000-000000000102" },
      obj,
    ),
    null,
  );
});

test("source resolution re-evaluates permissions and current business content", async () => {
  const store = new InMemoryAccountStore();
  const record = {
    id: ID,
    workspaceId: WS,
    name: "first",
    ownerSub: "alice",
    accountNo: "ACC-1",
    status: "active",
    tier: "standard",
  } as AccountRecord;
  store.seed({ accounts: [record] });
  const c = session(store),
    obj = { kind: "account" as const, id: ID };
  const first = await readTaskSource(c, obj);
  store.seed({ accounts: [{ ...record, name: "updated" }] });
  assert.notEqual((await readTaskSource(c, obj))?.version, first?.version);
  assert.equal(
    await readTaskSource(
      { ...c, authz: { ...c.authz, permissions: new Set() } },
      obj,
    ),
    null,
  );
});

test("an old strategy publication is unavailable once a newer effective version exists", async () => {
  const strategy = new InMemoryStrategyStore(),
    lineage = ID;
  const plan = {
    id: ID,
    workspaceId: WS,
    lineageId: lineage,
    versionNo: 1,
    planNo: "PLAN-1",
    name: "publication",
    period: "2026",
    objective: null,
    ownerSub: "alice",
    solutionIds: [],
    status: "active",
    approvedAt: new Date(),
  } as PlanRecord;
  strategy.seed({ plans: [plan] });
  setStrategyStore(strategy);
  const c = session(new InMemoryAccountStore());
  c.entitlement = { ...c.entitlement, tier: "business" };
  c.authz = {
    ...c.authz,
    permissions: new Set(permissionsForRoles(["sales_leader"])),
  };
  assert.ok(await readTaskSource(c, { kind: "strategy", id: ID }));
  strategy.seed({
    plans: [
      { ...plan, id: "aa000000-0000-4000-a000-000000000111", versionNo: 2 },
    ],
  });
  assert.equal(await readTaskSource(c, { kind: "strategy", id: ID }), null);
});

test("private task endpoints reject cross-site mutations and oversized declared requests", () => {
  assert.equal(
    privateRequest(
      new Request("https://yucer.example/api/copilot/tasks", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    )?.status,
    403,
  );
  assert.equal(
    privateRequest(
      new Request("https://yucer.example/api/copilot/tasks", {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site" },
      }),
    )?.status,
    403,
  );
  assert.equal(
    privateRequest(
      new Request("https://yucer.example/api/copilot/tasks", {
        method: "POST",
        headers: { "content-length": "40000" },
      }),
    )?.status,
    413,
  );
  assert.equal(
    privateRequest(
      new Request("https://yucer.example/api/copilot/tasks", {
        method: "POST",
        headers: { origin: "https://yucer.example" },
      }),
    ),
    null,
  );
});

test("task responses preserve error codes, stable statuses and no-store on private content", async () => {
  const answer = taskResponse(ok({ privateText: "owner-only" }));
  assert.equal(answer.headers.get("cache-control"), "private, no-store");
  for (const [code, status] of [
    ["not_found", 404],
    ["source_unavailable", 404],
    ["access_changed", 403],
    ["permission_denied", 403],
    ["rule_changed", 409],
    ["request_in_progress", 409],
    ["task_model_failed", 502],
    ["task_tool_denied", 400],
  ] as const) {
    const response = taskResponse(
      fail(violation(code, "must not expose raw input")),
    );
    assert.equal(response.status, status);
    const value = await response.json();
    assert.equal(typeof value.retryable, "boolean");
    assert.doesNotMatch(JSON.stringify(value), /raw input/);
  }
});

test("actual task body size is bounded even when Content-Length is absent", async () => {
  const rejected = await readTaskBody(
    new Request("https://yucer.example/api/copilot/tasks", {
      method: "POST",
      body: "x".repeat(32769),
    }),
  );
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.response.status, 413);
  const parsed = await readTaskBody(
    new Request("https://yucer.example/api/copilot/tasks", {
      method: "POST",
      body: JSON.stringify({ goal: "bounded" }),
    }),
  );
  assert.deepEqual(parsed, { ok: true, value: { goal: "bounded" } });
});
