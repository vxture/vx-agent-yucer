import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryCopilotStore } from "./store";
import { InMemoryPipelineStore, type OpportunityRecord } from "../pipeline/store";
import { setPipelineStore } from "../shared/registry";
import {
  adjudicate,
  execute,
  expireStaleProposals,
  getAutonomy,
  setAutonomy,
  listPlaybooks,
  listProposals,
  recordProposals,
  type CopilotContext,
} from "./service";
import type { AgentAction } from "./lib/action";

const WS = "ws_1";
const CREATED = new Date("2026-08-14T00:00:00Z");

function proposal(id: string, over: Partial<AgentAction> = {}): AgentAction {
  return {
    id,
    status: "proposed",
    actionType: "advance_stage",
    capability: null,
    subjectType: "opportunity",
    subjectId: "opp_1",
    payload: { to: "validate" },
    rationale: "POC signed off",
    confidence: 80,
    decidedBySub: null,
    decidedAt: null,
    executedAt: null,
    createdAt: CREATED,
    ...over,
  };
}

/**
 * A pipeline the copilot can actually act on.
 *
 * EXECUTING IS NOW A REAL WRITE, so these tests need a deal to write to. Before
 * 2026-09-01 they did not: `execute` moved the proposal row and nothing else
 * happened, so a test could assert "executed" against an empty world and pass.
 * That is precisely the defect the owner ruled out ("不能是假的"), and it is
 * worth noting that the old tests could not have caught it - they asserted the
 * claim, not the effect.
 */
function pipelineWith(over: Partial<OpportunityRecord> = {}): InMemoryPipelineStore {
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

test.afterEach(() => setPipelineStore(null));

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemoryCopilotStore()): CopilotContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

// --- Both gates, in order ---------------------------------------------------

test("adjudicating needs the tier AND the permission", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a")]);

  // Right permission, tier too low: copilot.suggest starts at pro.
  const cheap = await adjudicate(ctx("sales_rep", "starter", store), ["a"], "accept");
  assert.equal(cheap.ok, false);
  assert.equal(cheap.ok === false && cheap.violations[0].code, "feature_not_in_tier");

  // Right tier, wrong role: presales has copilot.use but not copilot.decide.
  const unpermitted = await adjudicate(ctx("presales", "enterprise", store), ["a"], "accept");
  assert.equal(unpermitted.ok, false);
  assert.equal(unpermitted.ok === false && unpermitted.violations[0].code, "permission_denied");

  // Both satisfied.
  const okRes = await adjudicate(ctx("sales_rep", "pro", store), ["a"], "accept");
  assert.deepEqual(unwrap(okRes).decided, ["a"]);
});

test("a tier gap is reported before a permission gap, never the other way", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a")]);
  const r = await adjudicate(ctx("presales", "free", store), ["a"], "accept");
  assert.equal(r.ok === false && r.violations[0].code, "feature_not_in_tier");
});

// --- The decider is the session, not the request ---------------------------

test("every decided row is signed with the session subject", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a"), proposal("b")]);
  const c = ctx("sales_leader", "enterprise", store);

  await adjudicate(c, ["a", "b"], "accept");
  for (const id of ["a", "b"]) {
    const row = await store.getProposal(WS, id);
    assert.equal(row?.status, "accepted");
    assert.equal(row?.decidedBySub, "usr_me", "batching must not weaken accountability");
    assert.ok(row?.decidedAt instanceof Date);
  }
});

test("rejecting is signed too", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a")]);
  await adjudicate(ctx("sales_leader", "enterprise", store), ["a"], "reject");
  const row = await store.getProposal(WS, "a");
  assert.equal(row?.status, "rejected");
  assert.equal(row?.decidedBySub, "usr_me");
});

// --- Races and partial batches ---------------------------------------------

test("a proposal someone else already decided is skipped, not overwritten", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [
    proposal("fresh"),
    proposal("taken", { status: "accepted", decidedBySub: "usr_other", decidedAt: CREATED }),
  ]);

  const r = unwrap(await adjudicate(ctx("sales_leader", "enterprise", store), ["fresh", "taken"], "reject"));
  assert.deepEqual(r.decided, ["fresh"]);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].id, "taken");

  // Their decision and their name survive.
  const taken = await store.getProposal(WS, "taken");
  assert.equal(taken?.status, "accepted");
  assert.equal(taken?.decidedBySub, "usr_other");
});

test("an unknown id is skipped and the rest of the batch still lands", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a")]);
  const r = unwrap(await adjudicate(ctx("sales_leader", "enterprise", store), ["a", "ghost"], "accept"));
  assert.deepEqual(r.decided, ["a"]);
  assert.deepEqual(r.skipped, [{ id: "ghost", reason: "not_found" }]);
});

test("an empty batch is a no-op, not an error", async () => {
  const r = unwrap(await adjudicate(ctx("sales_leader", "enterprise"), [], "accept"));
  assert.deepEqual(r, { decided: [], skipped: [] });
});

test("a proposal in another workspace is invisible", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals("ws_other", [proposal("a")]);
  const r = unwrap(await adjudicate(ctx("sales_leader", "enterprise", store), ["a"], "accept"));
  assert.deepEqual(r.decided, []);
  assert.equal(r.skipped[0].reason, "not_found");
});

// --- Execution and autopilot ------------------------------------------------

test("an accepted proposal executes - and the deal actually moves", async () => {
  const store = new InMemoryCopilotStore();
  const deals = pipelineWith();
  store.seedProposals(WS, [proposal("a", { status: "accepted", decidedBySub: "usr_me", decidedAt: CREATED })]);
  const r = unwrap(await execute(ctx("sales_leader", "enterprise", store), "a"));
  assert.equal(r.autonomous, false);
  assert.equal((await store.getProposal(WS, "a"))?.status, "executed");

  // THE POINT OF THE WHOLE BATCH. "executed" used to be the only assertion
  // available, and it was true of a product where nothing happened.
  assert.equal((await deals.getOpportunity(WS, "opp_1"))?.stage, "validate");

  // And the move is journalled with the model's own words, so the reason the
  // deal advanced survives past the proposal row.
  const events = await deals.listStageEvents(WS, "opp_1");
  assert.equal(events.at(-1)?.toStage, "validate");
  assert.equal(events.at(-1)?.reason, "POC signed off");
  // Signed by the ACCEPTER, per the owner's ruling: 人签了字，就用他的权限.
  assert.equal(events.at(-1)?.actorSub, "usr_me");
});

test("the accepter's own permissions decide, so signing does not lend authority", async () => {
  // delivery_manager is the real case: it holds `copilot.decide` and only
  // `pipeline.read`, so it may adjudicate a proposal and may not advance a
  // deal. The refusal comes from advanceStage's OWN gate, evaluated against
  // this member. The alternative - the copilot acting under the service role
  // because a proposal existed - would make "accept" a way to do things you
  // are not allowed to do.
  const store = new InMemoryCopilotStore();
  const deals = pipelineWith();
  store.seedProposals(WS, [proposal("a", { status: "accepted", decidedBySub: "usr_me", decidedAt: CREATED })]);

  const r = await execute(ctx("delivery_manager", "enterprise", store), "a");
  assert.equal(r.ok === false && r.violations[0].code, "permission_denied");
  assert.equal((await deals.getOpportunity(WS, "opp_1"))?.stage, "discover");

  // AND THE ATTEMPT IS RECORDED. `failed` is terminal, so the row does not sit
  // at `accepted` looking like it is still waiting for somebody.
  assert.equal((await store.getProposal(WS, "a"))?.status, "failed");
});

test("a proposal nothing can carry out fails instead of reporting success", async () => {
  // promote_signal is the live example: agent_action.subject_type has no
  // `signal`, so a proposal cannot name what to promote. It reaches the
  // executor's refusal rather than a handler.
  const store = new InMemoryCopilotStore();
  pipelineWith();
  store.seedProposals(WS, [
    proposal("a", {
      status: "accepted",
      decidedBySub: "usr_me",
      decidedAt: CREATED,
      actionType: "promote_signal",
      subjectType: "lead",
      subjectId: "lead_1",
    }),
  ]);
  const r = await execute(ctx("sales_leader", "enterprise", store), "a");
  assert.equal(r.ok === false && r.violations[0].code, "not_executable_type");
  assert.equal((await store.getProposal(WS, "a"))?.status, "failed");
});

test("a pending proposal will not execute while the workspace asks about everything", async () => {
  // No autonomy row at all: nobody authorised anything, which reads as
  // ask_always. The refusal is the product's default posture, not a missing
  // parameter.
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a")]);
  const r = await execute(ctx("sales_leader", "enterprise", store), "a");
  assert.equal(r.ok === false && r.violations[0].code, "human_decision_required");
});

test("running unasked needs the tier, the permission AND the workspace's own row", async () => {
  // THE POSTURE IS READ, NOT PASSED. It used to be `{ autopilot: true,
  // workspaceOptIn: true }` - two booleans the caller supplied, which is a
  // caller declaring it has authority rather than having it. Now the third yes
  // comes from agent_autonomy and the first two are unchanged.
  const mk = async (mode?: string) => {
    const s = new InMemoryCopilotStore();
    s.seedProposals(WS, [proposal("a")]);
    if (mode) await s.setAutonomy(WS, { mode: mode as never, decidedBySub: "usr_boss" });
    pipelineWith();
    return s;
  };

  // Never switched on.
  assert.equal((await execute(ctx("sales_leader", "enterprise", await mk()), "a")).ok, false);

  // Switched on, tier below enterprise.
  assert.equal(
    (await execute(ctx("sales_leader", "business", await mk("autonomous")), "a")).ok,
    false,
  );

  // Switched on, role without copilot.autopilot.
  assert.equal(
    (await execute(ctx("sales_ops", "enterprise", await mk("autonomous")), "a")).ok,
    false,
  );

  // All three.
  const r = unwrap(
    await execute(ctx("sales_leader", "enterprise", await mk("autonomous")), "a"),
  );
  assert.equal(r.autonomous, true);
});

test("ask_high_risk runs the reversible ones and still asks about the rest", async () => {
  // THE FOURTH YES, and the reason it is asked last: this workspace has the
  // tier, the permission and the switch, and a proposal the rule calls high
  // risk still does not run.
  const mk = async (actionType: string, confidence: number) => {
    const s = new InMemoryCopilotStore();
    s.seedProposals(WS, [proposal("a", { actionType, confidence })]);
    await s.setAutonomy(WS, { mode: "ask_high_risk", decidedBySub: "usr_boss" });
    pipelineWith();
    return s;
  };
  const c = (s: InMemoryCopilotStore) => ctx("sales_leader", "enterprise", s);

  assert.equal(unwrap(await execute(c(await mk("advance_stage", 86)), "a")).autonomous, true);

  // Reaches the customer - never, at this posture.
  const outreach = await execute(c(await mk("draft_outreach", 99)), "a");
  assert.equal(outreach.ok, false);
  assert.equal(outreach.ok ? "" : outreach.violations[0].code, "human_decision_required");

  // Reversible, but the model is not sure enough.
  const unsure = await execute(c(await mk("advance_stage", 41)), "a");
  assert.equal(unsure.ok, false);
});

test("an unasked execution leaves the decider null - that null is the marker", async () => {
  const store = new InMemoryCopilotStore();
  const deals = pipelineWith();
  store.seedProposals(WS, [proposal("a")]);
  await store.setAutonomy(WS, { mode: "autonomous", decidedBySub: "usr_boss" });
  await execute(ctx("sales_leader", "enterprise", store), "a");
  const row = await store.getProposal(WS, "a");
  assert.equal(row?.status, "executed");
  assert.equal((await deals.getOpportunity(WS, "opp_1"))?.stage, "validate");
  assert.equal(row?.decidedBySub, null, "no human signed for this, and the record says so");
  assert.ok(row?.executedAt instanceof Date);
});

// --- Creating proposals -----------------------------------------------------

test("recorded proposals always start as proposed", async () => {
  const store = new InMemoryCopilotStore();
  const created = unwrap(
    await recordProposals(ctx("sales_leader", "enterprise", store), [
      {
        sessionId: null,
        actionType: "draft_email",
        subjectType: "account",
        subjectId: "acc_1",
        payload: {},
        rationale: "no contact in 40 days",
        confidence: 55,
      },
    ]),
  );
  assert.equal(created.length, 1);
  assert.equal(created[0].status, "proposed");
  assert.equal(created[0].decidedBySub, null);
});

test("recording proposals needs the suggest tier", async () => {
  const r = await recordProposals(ctx("sales_leader", "starter"), [
    { sessionId: null, actionType: "a", subjectType: "account", subjectId: "x", payload: {}, rationale: null, confidence: null },
  ]);
  assert.equal(r.ok === false && r.violations[0].code, "feature_not_in_tier");
});

test("listing proposals is gated on reading the copilot surface", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a")]);
  assert.equal(unwrap(await listProposals(ctx("viewer", "free", store))).length, 1);
  assert.equal((await listProposals(ctx("viewer", null, store))).ok, false);
});

test("reading the plays the agent is grounded on takes the same gate as using it", async () => {
  // Grounding injects workspace-authored text into every matching turn. If
  // reading the catalog needed a privilege that asking a question does not,
  // most of the people receiving those answers could never see what produced
  // them - which is how an assistant becomes unaccountable.
  const store = new InMemoryCopilotStore();
  store.seedPlaybooks(WS, [
    {
      id: "pb_1",
      playbookCode: "PB-Q",
      name: "Qualification",
      scopeDomain: "pipeline",
      content: "Budget, authority, need, timeline.",
      version: 1,
      status: "active",
    },
  ]);
  assert.equal(unwrap(await listPlaybooks(ctx("viewer", "free", store))).length, 1);
  assert.equal((await listPlaybooks(ctx("viewer", null, store))).ok, false, "no entitlement, no catalog");
});

test("the catalog never leaks another workspace's plays", async () => {
  const store = new InMemoryCopilotStore();
  store.seedPlaybooks("ws_other", [
    {
      id: "pb_x",
      playbookCode: "PB-X",
      name: "Someone else's",
      scopeDomain: "copilot",
      content: "OTHER",
      version: 1,
      status: "active",
    },
  ]);
  assert.deepEqual(unwrap(await listPlaybooks(ctx("viewer", "free", store))), []);
});

// --- Expiry: the outcome the spec required and nothing ever produced --------

const TTL = 7 * 24 * 60 * 60 * 1000;
const laterBy = (ms: number) => new Date(CREATED.getTime() + ms);

test("a proposal nobody decided becomes expired, not invisible", async () => {
  // THE DEFECT THIS CLOSES: planExpiry has existed since batch 1 and nothing
  // called it, so no proposal had ever expired. A recommendation from three
  // months ago sat in the queue looking as live as one from this morning.
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("old")]);
  const c = ctx("sales_leader", "pro", store);

  const swept = unwrap(await expireStaleProposals(c, { now: laterBy(TTL + 1) }));
  assert.deepEqual(swept.expired, ["old"]);

  const pending = unwrap(await listProposals(c, { status: "proposed" }));
  assert.deepEqual(pending, []);

  // Expired, not gone. It is still there to be found.
  const gone = unwrap(await listProposals(c, { status: "expired" }));
  assert.deepEqual(gone.map((p) => p.id), ["old"]);
  // And nobody decided it - that null is the whole point of the state.
  assert.equal(gone[0].decidedBySub, null);
});

test("a proposal still inside its window is left alone", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("fresh")]);
  const c = ctx("sales_leader", "pro", store);
  const swept = unwrap(await expireStaleProposals(c, { now: laterBy(TTL - 1) }));
  assert.deepEqual(swept.expired, []);
  assert.equal(unwrap(await listProposals(c, { status: "proposed" })).length, 1);
});

test("only pending proposals are swept - a decided one is never touched", async () => {
  // The compare-and-set on `from: ["proposed"]` is the guard, and planExpiry
  // refuses a non-proposed row before it. Both matter: an accepted proposal
  // expiring out from under the person who accepted it would erase a decision.
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [
    proposal("accepted", { status: "accepted", decidedBySub: "usr_boss", decidedAt: CREATED }),
    proposal("executed", { status: "executed", decidedBySub: "usr_boss", executedAt: CREATED }),
    proposal("stale"),
  ]);
  const c = ctx("sales_leader", "pro", store);
  const swept = unwrap(await expireStaleProposals(c, { now: laterBy(TTL * 10) }));
  assert.deepEqual(swept.expired, ["stale"]);
});

test("sweeping an empty queue writes nothing", async () => {
  const store = new InMemoryCopilotStore();
  const c = ctx("sales_leader", "pro", store);
  assert.deepEqual(unwrap(await expireStaleProposals(c, { now: laterBy(TTL * 10) })).expired, []);
});

test("the TTL is the rule's, not a second copy in the service", async () => {
  // Passing a shorter window must move the boundary, which it only can if the
  // service delegates the arithmetic to planExpiry rather than repeating it.
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a")]);
  const c = ctx("sales_leader", "pro", store);
  const swept = unwrap(await expireStaleProposals(c, { now: laterBy(1000), ttlMs: 500 }));
  assert.deepEqual(swept.expired, ["a"]);
});

test("sweeping is gated on READING the queue, not on deciding", async () => {
  // Expiring is not a decision - decidedBySub stays null. Gating it behind
  // `decide` would make what a viewer sees depend on whether somebody who can
  // decide had visited recently.
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a")]);
  const viewer = ctx("viewer", "pro", store);

  assert.equal((await expireStaleProposals(viewer, { now: laterBy(TTL + 1) })).ok, true);
  // And the same member still cannot decide one.
  store.seedProposals(WS, [proposal("b")]);
  assert.equal((await adjudicate(viewer, ["b"], "accept")).ok, false);
});

test("sweeping is refused to a workspace with no entitlement", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a")]);
  const r = await expireStaleProposals(ctx("sales_leader", null, store), { now: laterBy(TTL + 1) });
  assert.equal(r.ok, false);
});

// --- The workspace's posture toward its copilot ------------------------------

test("nobody has set it, and that is not the same as somebody choosing ask_always", () => {
  // The safe reading of "no authorisation" is that everything still waits for a
  // person - but the surface has to be able to say WHICH of the two it is, or a
  // workspace that never opened the setting looks like one that considered it.
  const store = new InMemoryCopilotStore();
  return getAutonomy(ctx("sales_leader", "enterprise", store)).then((r) => {
    const v = unwrap(r);
    assert.equal(v.mode, "ask_always");
    assert.equal(v.set, false);
    assert.equal(v.decidedBySub, null);
  });
});

test("setting it records the mode and signs it with the caller", async () => {
  const store = new InMemoryCopilotStore();
  const c = ctx("sales_leader", "enterprise", store);
  unwrap(await setAutonomy(c, "ask_high_risk"));

  const v = unwrap(await getAutonomy(c));
  assert.equal(v.mode, "ask_high_risk");
  assert.equal(v.set, true);
  // WHOSE NAME comes from the session, never from the caller's input - a
  // signature a caller could supply is not a signature.
  assert.equal(v.decidedBySub, "usr_me");
});

test("an invented mode is refused before it reaches the store", async () => {
  // The DDL has a CHECK, but a bad value that got that far would fail at the
  // driver as a constraint name, far from whoever sent it.
  const store = new InMemoryCopilotStore();
  const r = await setAutonomy(ctx("sales_leader", "enterprise", store), "autopilot");
  assert.equal(r.ok, false);
  assert.equal(r.ok ? "" : r.violations[0].code, "unknown_autonomy_mode");
});

test("deciding one proposal and deciding they need no deciding are different acts", async () => {
  // sales_rep holds copilot.decide and not copilot.autopilot. The catalogue
  // already drew this line; this is the first thing to use it.
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a")]);
  const rep = ctx("sales_rep", "enterprise", store);

  assert.equal((await setAutonomy(rep, "autonomous")).ok, false, "a rep must not widen the agent's authority");
  // ...and can still read what the posture is, because a member watching the
  // queue is entitled to know how much of it the agent skipped.
  assert.equal((await getAutonomy(rep)).ok, true);
});
