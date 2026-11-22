import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { EMPTY_ENTITLEMENT } from "../../../entitlement/types";
import { permissionsForRoles } from "../../../authz/catalog";
import { scopeAccountStore } from "../../../authz/scoped-stores";
import {
  InMemoryAccountStore,
  type AccountRecord,
} from "../../../domains/account/store";
import type { AppSession } from "../../../(app)/lib/session";
import { InMemoryStrategyStore } from "../../../domains/strategy/store";
import { setStrategyStore } from "../../../domains/shared/registry";
import { businessBindings, accessSource, businessRecords } from "./business";
import { readTaskSource } from "./context";
import { mergeForm } from "../../../domains/copilot/lib/business-form";
const WS = randomUUID(),
  ID = randomUUID();
function session(store: InMemoryAccountStore, sub = "alice"): AppSession {
  return {
    workspaceId: WS,
    user: { sub },
    scope: { kind: "own", sub, accountIds: [] },
    authz: { permissions: new Set(permissionsForRoles(["sales_rep"])) },
    entitlement: {
      ...EMPTY_ENTITLEMENT,
      workspace_id: WS,
      product: "yucer",
      tier: "enterprise",
    },
    stores: {
      account: () =>
        scopeAccountStore(store, { kind: "own", sub, accountIds: [] }),
    },
  } as unknown as AppSession;
}
afterEach(() => setStrategyStore(null));
test("controlled lookup obeys real account scope and never accepts SQL or workspace overrides", async () => {
  const store = new InMemoryAccountStore();
  store.seed({
    accounts: [
      {
        id: ID,
        workspaceId: WS,
        name: "Alice customer",
        accountNo: "ACC-1",
        ownerSub: "alice",
        tier: "standard",
        status: "active",
      } as AccountRecord,
    ],
  });
  const c = session(store),
    b = businessBindings(c, (o) => readTaskSource(c, o));
  assert.equal((await b.query({ kind: "account" })).records.length, 1);
  assert.equal(
    (
      await businessBindings(session(store, "bob"), (o) =>
        readTaskSource(session(store, "bob"), o),
      ).query({ kind: "account" })
    ).records.length,
    0,
  );
  for (const input of [
    { kind: "account", sql: "select *" },
    { kind: "account", workspaceId: randomUUID() },
    { kind: "account", id: "ACC-1" },
    { kind: "agent_message" },
  ])
    await assert.rejects(b.query(input));
  assert.ok(
    (await b.query({ kind: "account", query: "no match" })).sources.some(
      (s) => s.kind === "access",
    ),
  );
});
test("access fingerprints track capability and scope changes, not metered quota consumption", () => {
  const c = session(new InMemoryAccountStore()),
    first = accessSource(c);
  c.entitlement.quota_pools = [
    { metric: "tokens", limit: 100, remaining: 90, priority: 1 },
  ];
  assert.deepEqual(accessSource(c), first);
  c.authz = { ...c.authz, permissions: new Set() };
  assert.notEqual(accessSource(c).version, first.version);
});
test("foreign UUID relations and stale form targets are rejected by controlled source resolution", async () => {
  const strategy = new InMemoryStrategyStore();
  setStrategyStore(strategy);
  const c = session(new InMemoryAccountStore());
  c.authz = {
    ...c.authz,
    permissions: new Set(permissionsForRoles(["sales_leader"])),
  };
  const b = businessBindings(c, (o) => readTaskSource(c, o));
  await assert.rejects(
    b.prepare(
      mergeForm(null, "segment", null, {
        name: "Market",
        solutionIds: [randomUUID()],
      }),
    ),
  );
  await assert.rejects(
    b.prepare({
      ...mergeForm(null, "segment", ID, { name: "Market" }),
      baseVersion: "outdated",
    }),
  );
  await assert.rejects(businessRecords(c, "agent_task"));
});
