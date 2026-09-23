import { test } from "node:test";
import assert from "node:assert/strict";
import { seedDemoWorkspace, type DemoStores } from "../shared/demo-seed";
import { InMemoryAccountStore } from "./store";
import { InMemoryFieldStore } from "./field-store";
import { InMemoryCatalogStore } from "../catalog/store";
import { InMemoryCopilotStore } from "../copilot/store";
import { InMemoryDeliveryStore } from "../delivery/store";
import { InMemoryPipelineStore } from "../pipeline/store";
import { InMemoryPlanningStore } from "../planning/store";
import { InMemorySignalStore } from "../signal/store";
import { InMemoryStrategyStore } from "../strategy/store";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { accountStatuses } from "./service";

// 状态标签 derived through the service (YC-021 L5): the facts are gathered
// from their owning domains, the verdict is lib/status.ts's. The demo seed
// stores most customers as `active` - the frozen label this replaces - so a
// derivation that only echoed the column fails the second assertion below.

const WS = "ws_status";

function seeded(): DemoStores {
  const s: DemoStores = {
    strategy: new InMemoryStrategyStore(),
    planning: new InMemoryPlanningStore(),
    account: new InMemoryAccountStore(),
    field: new InMemoryFieldStore(),
    signal: new InMemorySignalStore(),
    pipeline: new InMemoryPipelineStore(),
    delivery: new InMemoryDeliveryStore(),
    copilot: new InMemoryCopilotStore(),
    catalog: new InMemoryCatalogStore(),
  };
  seedDemoWorkspace(WS, s);
  return s;
}

const ctx = (s: DemoStores, role: RoleCode = "sales_leader") => ({
  workspaceId: WS,
  sub: "usr_me",
  holder: { permissions: new Set(permissionsForRoles([role])) },
  entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier: "enterprise" as const },
  store: s.account,
  pipeline: s.pipeline,
  delivery: s.delivery,
});

test("accountStatuses: derived from facts, not echoed from the stored column", async () => {
  const s = seeded();
  const accounts = await s.account.listAccounts(WS);
  const r = await accountStatuses(ctx(s), accounts.map((a) => a.id));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // acc_demo_1 holds in-force contracts (demo-seed ct_demo_1).
  assert.equal(r.value.get("acc_demo_1"), "active");
  assert.ok(
    accounts.some((a) => a.status === "active" && r.value.get(a.id) === "prospect"),
    "a customer stored as active who never bought derives as a prospect",
  );
  assert.equal(r.value.size, accounts.length, "one status per requested account");
});

test("accountStatuses: one account narrows the reads and gets the same answer as the roster", async () => {
  const s = seeded();
  const all = await accountStatuses(ctx(s), (await s.account.listAccounts(WS)).map((a) => a.id));
  const one = await accountStatuses(ctx(s), ["acc_demo_1"]);
  assert.equal(one.ok && one.value.get("acc_demo_1"), all.ok && all.value.get("acc_demo_1"));
});

test("accountStatuses: an account with no facts at all is a prospect", async () => {
  const r = await accountStatuses(ctx(seeded()), ["acc_nowhere"]);
  assert.equal(r.ok && r.value.get("acc_nowhere"), "prospect");
});
