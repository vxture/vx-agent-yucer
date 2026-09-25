import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { InMemoryPipelineStore, type OpportunityRecord } from "../pipeline/store";
import { setAccountStore, setFieldStore, setPipelineStore } from "../shared/registry";
import { InMemoryAccountStore } from "../account/store";
import { InMemoryFieldStore } from "../account/field-store";
import { EXECUTABLE_ACTIONS } from "./lib/autonomy";
import { carryOut, handledActions, type ExecutionContext } from "./executor";
import type { AgentAction } from "./lib/action";

const WS = "ws_1";
const CREATED = new Date("2026-08-14T00:00:00Z");

test.afterEach(() => {
  setPipelineStore(null);
  setFieldStore(null);
  setAccountStore(null);
});

function deals(over: Partial<OpportunityRecord> = {}): InMemoryPipelineStore {
  const store = new InMemoryPipelineStore();
  store.seed([
    {
      id: "opp_1",
      workspaceId: WS,
      requirement: "POS replacement",
      opportunityNo: "OPP-1",
      createdAt: CREATED,
      name: "Deal",
      accountId: "acc_1",
      planId: null,
      campaignId: null,
      sourceProjectId: null,
      contractTypeId: null,
      businessFormId: null,
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
    /* incr/0040. The industry is a vocabulary row, so the workspace has to
       have one for the model's answer to land on - a value outside the list is
       now refused rather than becoming a new industry. */
    industries: [
      { id: "ind_1", workspaceId: WS, industryCode: "manufacturing", name: "制造", sortOrder: 1 },
    ],
    accounts: [
      {
        id: "acc_1",
        workspaceId: WS,
        accountNo: "ACC-1",
        name: "东北重工集团",
        industryId: null,
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

// --- Recording an interaction from a pasted transcript ----------------------

function fieldStore(): InMemoryFieldStore {
  const store = new InMemoryFieldStore();
  setFieldStore(store);
  return store;
}

test("record_interaction writes through the domain service with agent_drafted capture mode", async () => {
  const store = fieldStore();
  const r = await carryOut(
    ctx(),
    action({
      actionType: "record_interaction",
      subjectType: "account",
      subjectId: "acc_1",
      payload: {
        channel: "meeting",
        occurredAt: "2026-09-20T14:00:00Z",
        rawNote: "Discussed Q4 targets with procurement team",
        summary: "Key takeaway: budget approved for Phase 2",
        subject: "Q4 planning review",
        participants: [
          { externalName: "Zhang Wei", roleAtTime: "procurement_lead" },
          { memberSub: "usr_me" },
        ],
      },
    }),
  );
  assert.equal(r.ok, true);
  const rows = await store.listInteractions(WS, { accountId: "acc_1" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.captureMode, "agent_drafted");
  assert.equal(rows[0]!.channel, "meeting");
  assert.equal(rows[0]!.summary, "Key takeaway: budget approved for Phase 2");
  assert.equal(rows[0]!.subject, "Q4 planning review");
  assert.equal(rows[0]!.actorSub, "usr_me");
  const parts = await store.listParticipants(WS, rows[0]!.id);
  assert.equal(parts.length, 2);
});

test("record_interaction against a non-account is refused", async () => {
  fieldStore();
  const r = await carryOut(
    ctx(),
    action({
      actionType: "record_interaction",
      subjectType: "opportunity",
      subjectId: "opp_1",
      payload: {
        channel: "call",
        occurredAt: "2026-09-20T10:00:00Z",
        rawNote: "Follow-up call",
      },
    }),
  );
  assert.equal(r.ok === false && r.violations[0].code, "subject_mismatch");
});

test("record_interaction refuses invalid channel", async () => {
  fieldStore();
  const r = await carryOut(
    ctx(),
    action({
      actionType: "record_interaction",
      subjectType: "account",
      subjectId: "acc_1",
      payload: {
        channel: "telepathy",
        occurredAt: "2026-09-20T10:00:00Z",
        rawNote: "Notes",
      },
    }),
  );
  assert.equal(r.ok === false && r.violations[0].code, "payload_invalid");
});

test("record_interaction refuses missing rawNote", async () => {
  fieldStore();
  const r = await carryOut(
    ctx(),
    action({
      actionType: "record_interaction",
      subjectType: "account",
      subjectId: "acc_1",
      payload: {
        channel: "meeting",
        occurredAt: "2026-09-20T10:00:00Z",
        rawNote: "",
      },
    }),
  );
  assert.equal(r.ok === false && r.violations[0].code, "payload_invalid");
});

test("record_interaction refuses missing occurredAt", async () => {
  fieldStore();
  const r = await carryOut(
    ctx(),
    action({
      actionType: "record_interaction",
      subjectType: "account",
      subjectId: "acc_1",
      payload: {
        channel: "meeting",
        rawNote: "Some notes",
      },
    }),
  );
  assert.equal(r.ok === false && r.violations[0].code, "payload_invalid");
});

test("the accepter's own gate decides for record_interaction", async () => {
  fieldStore();
  // viewer has account.read but no account.record
  const r = await carryOut(
    ctx("viewer"),
    action({
      actionType: "record_interaction",
      subjectType: "account",
      subjectId: "acc_1",
      payload: {
        channel: "meeting",
        occurredAt: "2026-09-20T10:00:00Z",
        rawNote: "Meeting notes",
      },
    }),
  );
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
});

// --- Refusing what it should not guess at ------------------------------------

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

// --- 证据抽取: accepting writes a version (deal batch 4b) -----------------------

function noteOnDeal(id: string, opportunityId: string | null) {
  return {
    id,
    workspaceId: WS,
    accountId: "acc_1",
    opportunityId,
    projectId: null,
    channel: "call" as const,
    direction: "outbound" as const,
    occurredAt: CREATED,
    actorSub: "usr_rep",
    subject: null,
    rawNote: "王总说采购委员会三个人投票",
    summary: null,
    captureMode: "manual",
    correctsInteractionId: null,
  };
}

test("an accepted record_evidence appends a model_accepted version, signed by the accepter and naming the proposal", async () => {
  const pipeline = deals();
  const field = fieldStore();
  field.seed({ interactions: [noteOnDeal("int_1", "opp_1")] });
  const r = await carryOut(
    ctx("sales_rep", "free"),
    action({
      id: "act_ev",
      actionType: "record_evidence",
      capability: "deal.evidence",
      payload: { slot: "decision_process", statement: "采购委员会三人投票", quote: "采购委员会三个人投票", interactionId: "int_1" },
    }),
  );
  assert.equal(r.ok, true);
  const [v] = await pipeline.listEvidence(WS, "opp_1");
  assert.deepEqual(
    [v.slot, v.statement, v.interactionId, v.source, v.proposalId, v.authorSub],
    ["decision_process", "采购委员会三人投票", "int_1", "model_accepted", "act_ev", "usr_me"],
  );
});

test("record_evidence may not cite another deal's note, nor land on a customer", async () => {
  deals();
  const field = fieldStore();
  field.seed({ interactions: [noteOnDeal("int_other", "opp_2")] });
  const foreign = await carryOut(
    ctx(),
    action({ actionType: "record_evidence", payload: { slot: "pain", statement: "x", interactionId: "int_other" } }),
  );
  assert.equal(foreign.ok === false && foreign.violations[0].code, "evidence_citation_foreign");
  const onAccount = await carryOut(
    ctx(),
    action({ actionType: "record_evidence", subjectType: "account", subjectId: "acc_1", payload: { slot: "pain", statement: "x" } }),
  );
  assert.equal(onAccount.ok === false && onAccount.violations[0].code, "subject_mismatch");
});

// --- 4c: roles and promises -------------------------------------------------------

function accountWith() {
  const accounts = new InMemoryAccountStore();
  accounts.seed({
    accounts: [{ id: "acc_1", workspaceId: WS, accountNo: "ACC-1", name: "Acme", tier: "standard", ownerSub: "usr_rep" } as never],
    contacts: [{ id: "ct_liu", workspaceId: WS, accountId: "acc_1", name: "刘敏", status: "active" } as never],
  });
  setAccountStore(accounts);
  return accounts;
}

test("an accepted set_buying_role writes the stance and keeps the recorded influence", async () => {
  deals();
  const accounts = accountWith();
  await accounts.setOpportunityContact(WS, "opp_1", "ct_liu", { buyingRole: "user", influence: 60, stance: "supporter" });
  const r = await carryOut(
    ctx(),
    action({ actionType: "set_buying_role", payload: { personId: "ct_liu", buyingRole: "user", stance: "champion" } }),
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  const [held] = await accounts.listOpportunityContacts(WS, "opp_1");
  assert.deepEqual([held.buyingRole, held.stance, held.influence], ["user", "champion", 60]);
});

test("set_buying_role refuses someone who is not on the deal's customer", async () => {
  deals();
  accountWith();
  const r = await carryOut(ctx(), action({ actionType: "set_buying_role", payload: { personId: "ct_nobody", buyingRole: "coach" } }));
  assert.equal(r.ok === false && r.violations[0].code, "contact_not_on_account");
});

test("an accepted add_commitment becomes a promise on this deal, born in the note it came from", async () => {
  deals();
  const field = fieldStore();
  field.seed({ interactions: [noteOnDeal("int_1", "opp_1")] });
  const r = await carryOut(
    ctx(),
    action({
      actionType: "add_commitment",
      payload: { direction: "they_owe", statement: "发来试点门店名单", dueAt: "2026-09-26", interactionId: "int_1" },
    }),
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  const [c] = await field.listCommitments(WS, { opportunityId: "opp_1" });
  assert.deepEqual(
    [c.direction, c.statement, c.originInteractionId, c.accountId, c.dueAt.toISOString().slice(0, 10)],
    ["they_owe", "发来试点门店名单", "int_1", "acc_1", "2026-09-26"],
  );
});

test("add_commitment refuses a note from another deal and a missing date", async () => {
  deals();
  const field = fieldStore();
  field.seed({ interactions: [noteOnDeal("int_x", "opp_2")] });
  const foreign = await carryOut(
    ctx(),
    action({ actionType: "add_commitment", payload: { direction: "they_owe", statement: "x", dueAt: "2026-09-26", interactionId: "int_x" } }),
  );
  assert.equal(foreign.ok === false && foreign.violations[0].code, "evidence_citation_foreign");
  const undated = await carryOut(ctx(), action({ actionType: "add_commitment", payload: { direction: "they_owe", statement: "x" } }));
  assert.equal(undated.ok === false && undated.violations[0].code, "payload_invalid");
});

test("an accepted plan_step becomes a commitment on the deal, with no origin note (deal batch 5c)", async () => {
  deals();
  const field = fieldStore();
  const r = await carryOut(
    ctx(),
    action({
      actionType: "plan_step",
      capability: "deal.plan",
      payload: { direction: "we_owe", statement: "约王磊确认签约流程", dueAt: "2026-09-30", forCriterion: "签约流程已写明" },
    }),
  );
  assert.equal(r.ok, true, JSON.stringify(r));
  const [c] = await field.listCommitments(WS, { opportunityId: "opp_1" });
  assert.deepEqual([c.direction, c.statement, c.originInteractionId, c.ownerSub], ["we_owe", "约王磊确认签约流程", null, "usr_me"]);
});
