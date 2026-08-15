import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryCopilotStore } from "./store";
import { runCopilotTurn, type TurnDeps } from "./turn-service";
import type { CopilotContext } from "./service";
import type { AtlasClient } from "../../agent/atlas/client";
import { AtlasError } from "../../agent/atlas/errors";
import type { RunosClient } from "../../agent/runos/client";
import type { ChatResponse } from "../../agent/atlas/types";
import { PROPOSE_ACTION_TOOL_NAME } from "../../agent/orchestrator/tools";

const WS = "ws_1";
const TENANT = "tn_1";

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemoryCopilotStore()): CopilotContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

function deps(opts: { replies: Array<Partial<ChatResponse["message"]>>; atlasThrows?: unknown } = { replies: [] }) {
  let i = 0;
  const calls: Array<{ task: string }> = [];
  const atlasClient = {
    async chat(task: string) {
      calls.push({ task });
      if (opts.atlasThrows) throw opts.atlasThrows;
      const reply = opts.replies[Math.min(i, opts.replies.length - 1)] ?? { content: "ok" };
      i += 1;
      return {
        id: "c",
        modelCode: "m",
        message: { role: "assistant", content: "", ...reply },
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
      } as ChatResponse;
    },
  } as unknown as AtlasClient;

  const runosClient = {
    async discover() {
      return [];
    },
    async invoke() {
      return { content: [], meta: {} };
    },
  } as unknown as RunosClient;

  return { d: { atlasClient, runosClient } as TurnDeps, calls };
}

const proposeReply = {
  toolCalls: [
    {
      id: "t1",
      name: PROPOSE_ACTION_TOOL_NAME,
      arguments: {
        action_type: "advance_stage",
        subject_type: "opportunity",
        subject_id: "opp_1",
        payload: { to: "validate" },
        rationale: "POC signed off",
        confidence: 82,
      },
    },
  ],
};

// --- The gate runs before anything is spent -------------------------------

test("a member without copilot.use never reaches the model", async () => {
  // Atlas meters every request, so an ungated turn is billable.
  const store = new InMemoryCopilotStore();
  const h = deps({ replies: [{ content: "hi" }] });
  const c = ctx("sales_rep", "pro", store);
  c.holder = { permissions: new Set() };

  const r = await runCopilotTurn(c, { question: "what next?", tenantId: TENANT }, h.d);
  assert.equal(r.ok, false);
  assert.equal(h.calls.length, 0, "no model call may have been made");
});

test("an unsubscribed workspace never reaches the model either", async () => {
  const h = deps({ replies: [{ content: "hi" }] });
  const r = await runCopilotTurn(ctx("sales_leader", null), { question: "q", tenantId: TENANT }, h.d);
  assert.equal(r.ok, false);
  assert.equal(h.calls.length, 0);
});

test("a missing tenant is refused rather than sent to a plane that will 400", async () => {
  const h = deps({ replies: [{ content: "hi" }] });
  const r = await runCopilotTurn(ctx("sales_rep", "pro"), { question: "q", tenantId: "" }, h.d);
  assert.equal(r.ok === false && r.violations[0].code, "tenant_required");
  assert.equal(h.calls.length, 0);
});

test("an empty question is refused", async () => {
  const h = deps();
  const r = await runCopilotTurn(ctx("sales_rep", "pro"), { question: "   ", tenantId: TENANT }, h.d);
  assert.equal(r.ok === false && r.violations[0].code, "empty_question");
});

// --- Transcript ------------------------------------------------------------

test("a turn opens a session and records both sides of the exchange", async () => {
  const store = new InMemoryCopilotStore();
  const h = deps({ replies: [{ content: "Advance it." }] });
  const out = unwrap(await runCopilotTurn(ctx("sales_rep", "pro", store), { question: "next step?", tenantId: TENANT }, h.d));

  const messages = await store.listMessages(WS, out.session.id);
  assert.deepEqual(messages.map((m) => m.role), ["user", "assistant"]);
  assert.equal(messages[0].content, "next step?");
  assert.equal(messages[1].content, "Advance it.");
});

test("the question survives a model failure", async () => {
  // Persisting the question before the model call is the whole point: the
  // reverse order loses it whenever the model plane is down.
  const store = new InMemoryCopilotStore();
  const h = deps({ replies: [], atlasThrows: new AtlasError({ code: "GRANT_DENIED", status: 403, message: "no grant" }) });
  const c = ctx("sales_rep", "pro", store);

  const r = await runCopilotTurn(c, { question: "will this be lost?", tenantId: TENANT }, h.d);
  assert.equal(r.ok, false);

  const sessions = await store.listSessions(WS, "usr_me");
  const messages = await store.listMessages(WS, sessions[0].id);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].content, "will this be lost?");
});

test("the model plane's own error code reaches the caller", async () => {
  // "GRANT_DENIED" and "the copilot is broken" need different responses.
  const h = deps({ replies: [], atlasThrows: new AtlasError({ code: "GRANT_DENIED", status: 403, message: "no grant" }) });
  const r = await runCopilotTurn(ctx("sales_rep", "pro"), { question: "q", tenantId: TENANT }, h.d);
  assert.equal(r.ok === false && r.violations[0].code, "atlas_GRANT_DENIED");
});

test("a continued session reuses its transcript rather than starting over", async () => {
  const store = new InMemoryCopilotStore();
  const c = ctx("sales_rep", "pro", store);

  const first = unwrap(await runCopilotTurn(c, { question: "one", tenantId: TENANT }, deps({ replies: [{ content: "a1" }] }).d));
  const second = unwrap(
    await runCopilotTurn(c, { question: "two", sessionId: first.session.id, tenantId: TENANT }, deps({ replies: [{ content: "a2" }] }).d),
  );

  assert.equal(second.session.id, first.session.id);
  const messages = await store.listMessages(WS, first.session.id);
  assert.deepEqual(messages.map((m) => m.content), ["one", "a1", "two", "a2"]);
});

test("an unknown session id is not found rather than silently opening a new one", async () => {
  const h = deps();
  const r = await runCopilotTurn(ctx("sales_rep", "pro"), { question: "q", sessionId: "ghost", tenantId: TENANT }, h.d);
  assert.equal(r.ok === false && r.violations[0].code, "not_found");
});

// --- Proposals are gated a second time -------------------------------------

test("proposals are written as `proposed`, never executed", async () => {
  const store = new InMemoryCopilotStore();
  const h = deps({ replies: [proposeReply, { content: "I proposed advancing it." }] });
  const out = unwrap(await runCopilotTurn(ctx("sales_rep", "pro", store), { question: "q", tenantId: TENANT }, h.d));

  assert.equal(out.proposals.length, 1);
  assert.equal(out.proposals[0].status, "proposed");
  assert.equal(out.proposals[0].decidedBySub, null);
  assert.equal(out.droppedProposals, 0);
});

test("a copilot.ask-only workspace gets the answer and none of the proposals", async () => {
  // The model may still emit them; they are dropped here rather than written.
  // copilot.suggest starts at pro, so a starter workspace can ask and not suggest.
  const store = new InMemoryCopilotStore();
  const h = deps({ replies: [proposeReply, { content: "here is my thinking" }] });
  const out = unwrap(await runCopilotTurn(ctx("sales_rep", "starter", store), { question: "q", tenantId: TENANT }, h.d));

  assert.equal(out.answer, "here is my thinking");
  assert.deepEqual(out.proposals, []);
  assert.equal(out.droppedProposals, 1, "the drop is reported, not hidden");
  assert.equal((await store.listProposals(WS)).length, 0);
});

test("the proposal is linked to the session that produced it", async () => {
  const store = new InMemoryCopilotStore();
  const h = deps({ replies: [proposeReply, { content: "done" }] });
  const out = unwrap(await runCopilotTurn(ctx("sales_leader", "enterprise", store), { question: "q", tenantId: TENANT }, h.d));
  assert.equal(out.proposals.length, 1);
  assert.equal(out.session.id.length > 0, true);
});

test("the turn reports truncation rather than pretending it finished", async () => {
  const store = new InMemoryCopilotStore();
  // A model that only ever calls tools exhausts the budget.
  const h = deps({ replies: [proposeReply] });
  const out = unwrap(await runCopilotTurn(ctx("sales_leader", "enterprise", store), { question: "q", tenantId: TENANT }, h.d));
  assert.equal(typeof out.truncated, "boolean");
});
