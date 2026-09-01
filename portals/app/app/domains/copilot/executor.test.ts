import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { InMemoryPipelineStore, type OpportunityRecord } from "../pipeline/store";
import { setAccountStore, setPipelineStore } from "../shared/registry";
import { InMemoryAccountStore } from "../account/store";
import { EXECUTABLE_ACTIONS } from "./lib/autonomy";
import { carryOut, handledActions, type ExecutionContext } from "./executor";
import type { AgentAction } from "./lib/action";

const WS = "ws_1";
const CREATED = new Date("2026-08-14T00:00:00Z");

test.afterEach(() => setPipelineStore(null));

function deals(over: Partial<OpportunityRecord> = {}): InMemoryPipelineStore {
  const store = new InMemoryPipelineStore();
  store.seed([
    {
      id: "opp_1",
      workspaceId: WS,
      opportunityNo: "OPP-1",
      createdAt: CREATED,
      name: "Deal",
      accountId: "acc_1",
      planId: null,
      campaignId: null,
      sourceProjectId: null,
      territoryId: null,
      ownerSub: "usr_rep",
      stage: "discover",
      forecastCategory: "commit",
      amount: null,
      probability: 25,
      expectedCloseAt: null,
      closedAt: null,
      status: "open",
      currency: "CNY",
      ...over,
    },
  ]);
  setPipelineStore(store);
  return store;
}

function ctx(role: RoleCode = "sales_leader", tier: Entitlement["tier"] = "enterprise"): ExecutionContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
  };
}

function action(over: Partial<AgentAction> = {}): AgentAction {
  return {
    id: "act_1",
    status: "accepted",
    actionType: "advance_stage",
    capability: null,
    subjectType: "opportunity",
    subjectId: "opp_1",
    payload: { to: "validate" },
    rationale: "POC signed off",
    confidence: 80,
    decidedBySub: "usr_me",
    decidedAt: CREATED,
    executedAt: null,
    createdAt: CREATED,
    ...over,
  };
}

// --- The coupling ------------------------------------------------------------

test("everything the rule calls safe has a handler, and vice versa", () => {
  // THE GUARD THIS FILE EXISTS FOR. The two halves fail differently and only
  // one of them is loud:
  //
  //   listed but unhandled - the product auto-approves under ask_high_risk and
  //     then cannot perform it. Nobody looked at the proposal AND nothing
  //     happened, which is the worst of both readings. This is not
  //     hypothetical: promote_signal was in exactly that state until wiring the
  //     executor on 2026-09-01 exposed it.
  //   handled but unlisted - dead code, because carryOut consults the list
  //     first. Harmless at runtime and invisible without this assertion.
  assert.deepEqual([...handledActions()].sort(), [...EXECUTABLE_ACTIONS].sort());
});

// --- advance_stage -----------------------------------------------------------

test("advance_stage moves the deal and journals the model's reason", async () => {
  const store = deals();
  const r = await carryOut(ctx(), action());
  assert.equal(r.ok, true);
  assert.equal((await store.getOpportunity(WS, "opp_1"))?.stage, "validate");

  const events = await store.listStageEvents(WS, "opp_1");
  assert.equal(events.at(-1)?.reason, "POC signed off");
  assert.equal(events.at(-1)?.actorSub, "usr_me");
});

test("it runs the domain service, not the store - so the stage machine still applies", async () => {
  // A closed deal does not quietly reopen because a proposal said so. If the
  // executor wrote the column itself it would be the one writer in the product
  // that skipped the machine, the journal and the win/loss rule together.
  deals({ stage: "won", status: "won", closedAt: CREATED });
  const r = await carryOut(ctx(), action({ payload: { to: "negotiate" } }));
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0].code, "terminal_stage");
});

test("the accepter's own gate decides", async () => {
  // delivery_manager holds copilot.decide and only pipeline.read.
  const store = deals();
  const r = await carryOut(ctx("delivery_manager"), action());
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
  assert.equal((await store.getOpportunity(WS, "opp_1"))?.stage, "discover");
});

// --- Filling a customer record, which the model proposes ---------------------

test("accepting a model's fill writes the field", { skip: false }, async () => {
  // THE ONE-CLICK FILL, end to end. The model proposes through the same tool it
  // proposes everything with; the proposal lands in the same queue; accepting
  // runs the same executor. No second mechanism, so a filled field carries the
  // same signature as every other thing the machine suggested.
  const accounts = new InMemoryAccountStore();
  accounts.seed({
    accounts: [
      {
        id: "acc_1",
        workspaceId: WS,
        accountNo: "ACC-1",
        name: "东北重工集团",
        industry: null,
        region: null,
        segmentCode: null,
        ownerSub: "usr_rep",
        healthScore: null,
        status: "active",
        tier: "standard",
      } as never,
    ],
  });
  setAccountStore(accounts);
  try {
    const r = await carryOut(
      ctx(),
      action({
        actionType: "fill_account_field",
        subjectType: "account",
        subjectId: "acc_1",
        payload: { field: "industry", value: "制造" },
      }),
    );
    assert.equal(r.ok, true);
    assert.equal((await accounts.getAccount(WS, "acc_1"))?.industry, "制造");
  } finally {
    setAccountStore(null);
  }
});

test("a field outside the four is refused, not written", async () => {
  // `payload` is model-written JSON, so the field name arrives as arbitrary
  // text. `tier` is a commercial designation with its own rules and its own
  // page; a model naming it must not reach it through here.
  const accounts = new InMemoryAccountStore();
  accounts.seed({
    accounts: [
      {
        id: "acc_1",
        workspaceId: WS,
        accountNo: "ACC-1",
        name: "Acme",
        industry: null,
        region: null,
        segmentCode: null,
        ownerSub: "usr_rep",
        healthScore: null,
        status: "active",
        tier: "standard",
      } as never,
    ],
  });
  setAccountStore(accounts);
  try {
    for (const field of ["tier", "status", "healthScore"]) {
      const r = await carryOut(
        ctx(),
        action({
          actionType: "fill_account_field",
          subjectType: "account",
          subjectId: "acc_1",
          payload: { field, value: "strategic" },
        }),
      );
      assert.equal(r.ok === false && r.violations[0].code, "field_not_fillable", field);
    }
    assert.equal((await accounts.getAccount(WS, "acc_1"))?.tier, "standard");
  } finally {
    setAccountStore(null);
  }
});

test("a fill aimed at something that is not a customer is refused", async () => {
  const r = await carryOut(
    ctx(),
    action({
      actionType: "fill_account_field",
      subjectType: "opportunity",
      subjectId: "opp_1",
      payload: { field: "industry", value: "制造" },
    }),
  );
  assert.equal(r.ok === false && r.violations[0].code, "subject_mismatch");
});

test("an empty value is refused rather than clearing the field", async () => {
  // "Fill this in" that blanks the field is the opposite of the request - and a
  // model returning an empty string for an industry it could not determine is a
  // real thing to expect.
  const r = await carryOut(
    ctx(),
    action({
      actionType: "fill_account_field",
      subjectType: "account",
      subjectId: "acc_1",
      payload: { field: "industry", value: "   " },
    }),
  );
  assert.equal(r.ok === false && r.violations[0].code, "value_required");
});

// --- Refusing what it should not guess at ------------------------------------

test("a payload with no usable stage is refused, not guessed at", async () => {
  deals();
  for (const payload of [{}, { to: 42 }, { to: "shipping" }]) {
    const r = await carryOut(ctx(), action({ payload }));
    assert.equal(r.ok === false && r.violations[0].code, "payload_invalid", JSON.stringify(payload));
  }
});

test("advance_stage against a non-opportunity is refused", async () => {
  // The type and the subject disagreeing is a proposal nobody should act on -
  // and passing a lead id to the opportunity store would answer `not_found`,
  // which reads as a missing deal rather than an incoherent proposal.
  deals();
  const r = await carryOut(ctx(), action({ subjectType: "lead", subjectId: "lead_1" }));
  assert.equal(r.ok === false && r.violations[0].code, "subject_mismatch");
});

test("an action type nothing handles is refused by name", async () => {
  // action_type is FREE TEXT from the model - the tool schema only gives
  // examples - so the set arriving here is open and the allowlist is the only
  // thing that bounds it.
  deals();
  for (const t of ["promote_signal", "draft_outreach", "delete_everything"]) {
    const r = await carryOut(ctx(), action({ actionType: t }));
    assert.equal(r.ok === false && r.violations[0].code, "not_executable_type", t);
  }
});
