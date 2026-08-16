import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryCopilotStore } from "./store";
import {
  adjudicate,
  execute,
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

test("an accepted proposal executes", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a", { status: "accepted", decidedBySub: "usr_me", decidedAt: CREATED })]);
  const r = unwrap(await execute(ctx("sales_leader", "enterprise", store), "a"));
  assert.equal(r.autonomous, false);
  assert.equal((await store.getProposal(WS, "a"))?.status, "executed");
});

test("a pending proposal will not execute without autopilot", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a")]);
  const r = await execute(ctx("sales_leader", "enterprise", store), "a");
  assert.equal(r.ok === false && r.violations[0].code, "human_decision_required");
});

test("autopilot needs the tier, the permission AND the workspace opt-in", async () => {
  const mk = () => {
    const s = new InMemoryCopilotStore();
    s.seedProposals(WS, [proposal("a")]);
    return s;
  };

  // Switched off.
  const off = mk();
  assert.equal(
    (await execute(ctx("sales_leader", "enterprise", off), "a", { autopilot: true, workspaceOptIn: false })).ok,
    false,
  );

  // Tier below enterprise.
  const lowTier = mk();
  assert.equal(
    (await execute(ctx("sales_leader", "business", lowTier), "a", { autopilot: true, workspaceOptIn: true })).ok,
    false,
  );

  // Role without copilot.autopilot.
  const wrongRole = mk();
  assert.equal(
    (await execute(ctx("sales_ops", "enterprise", wrongRole), "a", { autopilot: true, workspaceOptIn: true })).ok,
    false,
  );

  // All three.
  const good = mk();
  const r = unwrap(
    await execute(ctx("sales_leader", "enterprise", good), "a", { autopilot: true, workspaceOptIn: true }),
  );
  assert.equal(r.autonomous, true);
});

test("an autopilot execution leaves the decider null - that null is the marker", async () => {
  const store = new InMemoryCopilotStore();
  store.seedProposals(WS, [proposal("a")]);
  await execute(ctx("sales_leader", "enterprise", store), "a", { autopilot: true, workspaceOptIn: true });
  const row = await store.getProposal(WS, "a");
  assert.equal(row?.status, "executed");
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
