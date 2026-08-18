import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../entitlement/types";
import { CAPABILITY_MATRIX } from "../entitlement/capability";
import { ROLE_PERMISSIONS, permissionsForRoles, type RoleCode } from "../authz/catalog";
import { unwrap } from "./shared/result";
import { InMemoryAccountStore } from "./account/store";
import { getAccountDetail } from "./account/service";
import { InMemoryCopilotStore } from "./copilot/store";
import { execute } from "./copilot/service";
import type { AgentAction } from "./copilot/lib/action";

// Reads and refusals that leaked around the gate.
//
// Two shapes, both of which type-check, build and render correctly:
//
//   1. A PAGE holding a store handle. The nav hides an unentitled domain, but
//      hiding a link is not access control - the URL still works.
//   2. A service loading the row BEFORE checking the gate, so an unauthorized
//      caller can tell a real id from an invented one by which refusal comes
//      back.

const WS = "ws_1";

function ent(tier: Entitlement["tier"]): Entitlement {
  return { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier };
}

function holder(role: RoleCode) {
  return { permissions: new Set(permissionsForRoles([role])) };
}

// --- A page must not be able to read around its own gate -------------------

function accountCtx(role: RoleCode, tier: Entitlement["tier"], store: InMemoryAccountStore) {
  return { workspaceId: WS, sub: "usr_me", holder: holder(role), entitlement: ent(tier), store };
}

function seededAccounts(): InMemoryAccountStore {
  const store = new InMemoryAccountStore();
  store.seed({
    accounts: [
      {
        id: "acc_1",
        workspaceId: WS,
        accountNo: "ACC-0001",
        name: "Customer",
        industry: "retail",
        region: "east",
        segmentCode: "MID",
        ownerSub: "usr_rep",
        healthScore: 40,
        status: "active",
    tier: "standard" as const,
      },
    ],
    contacts: [
      {
        id: "ct_1",
        workspaceId: WS,
        accountId: "acc_1",
        name: "Buyer",
        title: "CFO",
        department: "finance",
        decisionRole: "economic",
        influence: 90,
        status: "active",
      },
    ],
  });
  return store;
}

test("an unentitled workspace cannot read an account by knowing its id", async () => {
  // account.view needs the account.manage feature. The nav entry is merely
  // LOCKED for a workspace without it - which used to mean the detail page
  // still answered in full when typed directly.
  const store = seededAccounts();
  const r = await getAccountDetail(accountCtx("sales_rep", null, store), "acc_1");
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "no_data_access");
});

test("an entitled member gets the account and its contacts together", async () => {
  const store = seededAccounts();
  const detail = unwrap(await getAccountDetail(accountCtx("sales_rep", "free", store), "acc_1"));
  assert.equal(detail.account.name, "Customer");
  assert.equal(detail.contacts.length, 1);
  assert.equal(detail.contacts[0].decisionRole, "economic");
});

test("an account in another workspace is not found, not forbidden", async () => {
  const store = seededAccounts();
  const other = { ...accountCtx("sales_rep", "free", store), workspaceId: "ws_other" };
  const r = await getAccountDetail(other, "acc_1");
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

// --- A refusal must not reveal whether the id exists -----------------------

function proposal(over: Partial<AgentAction> = {}): AgentAction {
  return {
    id: "act_1",
    status: "accepted",
    actionType: "advance_stage",
    subjectType: "opportunity",
    subjectId: "opp_1",
    payload: {},
    rationale: null,
    confidence: null,
    decidedBySub: "usr_leader",
    decidedAt: new Date(),
    executedAt: null,
    createdAt: new Date(),
    ...over,
  };
}

function copilotCtx(role: RoleCode, tier: Entitlement["tier"], store: InMemoryCopilotStore) {
  return { workspaceId: WS, sub: "usr_me", holder: holder(role), entitlement: ent(tier), store };
}

test("an unauthorized caller cannot tell a real proposal id from an invented one", async () => {
  // Loading the row first answered not_found for an id that does not exist and
  // permission_denied for one that does - enough to enumerate valid ids.
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal()]);
  const ctx = copilotCtx("viewer", "enterprise", store);

  const real = await execute(ctx, "act_1");
  const invented = await execute(ctx, "act_does_not_exist");

  assert.equal(real.ok, false);
  assert.equal(invented.ok, false);
  assert.equal(
    real.ok === false && real.violations[0].code,
    invented.ok === false && invented.violations[0].code,
    "the two refusals must be indistinguishable",
  );
});

test("an authorized caller still gets not_found for an id that does not exist", async () => {
  const store = new InMemoryCopilotStore();
  const r = await execute(copilotCtx("sales_leader", "enterprise", store), "act_missing");
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

test("an authorized caller can still execute an accepted proposal", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal()]);
  const out = unwrap(await execute(copilotCtx("sales_leader", "enterprise", store), "act_1"));
  assert.equal(out.autonomous, false);
});

test("hoisting the decide gate does not close the autopilot path", async () => {
  // Autopilot used to skip the decide gate entirely. It now passes through it
  // first, which is only safe because of the implication asserted below.
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal({ status: "proposed", decidedBySub: null, decidedAt: null })]);
  const out = unwrap(
    await execute(copilotCtx("sales_leader", "enterprise", store), "act_1", {
      autopilot: true,
      workspaceOptIn: true,
    }),
  );
  assert.equal(out.autonomous, true);
});

test("autopilot authorization strictly implies decide authorization", async () => {
  // The reason the hoist is safe, asserted rather than reasoned about: if a
  // future tier or role ever granted autopilot without suggest/decide, the
  // decide gate would start refusing autonomous execution and this would fail
  // rather than the behaviour silently changing.
  const autopilotTiers = (Object.keys(CAPABILITY_MATRIX) as Array<keyof typeof CAPABILITY_MATRIX>).filter(
    (t) => CAPABILITY_MATRIX[t].includes("copilot.autopilot"),
  );
  assert.ok(autopilotTiers.length > 0, "some tier must grant autopilot or the test is vacuous");
  for (const tier of autopilotTiers) {
    assert.ok(
      CAPABILITY_MATRIX[tier].includes("copilot.suggest"),
      `${tier} grants autopilot without suggest, so the decide gate would block it`,
    );
  }

  const autopilotRoles = (Object.keys(ROLE_PERMISSIONS) as RoleCode[]).filter((r) =>
    ROLE_PERMISSIONS[r].includes("copilot.autopilot"),
  );
  assert.ok(autopilotRoles.length > 0);
  for (const role of autopilotRoles) {
    assert.ok(
      ROLE_PERMISSIONS[role].includes("copilot.decide"),
      `${role} holds autopilot without decide, so the decide gate would block it`,
    );
  }
});
