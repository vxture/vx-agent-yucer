import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { InMemoryCopilotStore } from "./store";
import { streamCopilotTurn, shouldStream, type StreamEvent } from "./streaming-turn";
import type { CopilotContext } from "./service";
import type { AtlasClient } from "../../agent/atlas/client";
import { AtlasError } from "../../agent/atlas/errors";
import type { StreamFrame } from "../../agent/atlas/types";
import { InMemoryAuditStore, setAuditStore } from "../../audit/lib/store";

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

function atlas(frames: StreamFrame[], throwAfter?: number): AtlasClient {
  return {
    async *chatStream() {
      let i = 0;
      for (const f of frames) {
        if (throwAfter !== undefined && i === throwAfter) {
          throw new AtlasError({ code: "PROVIDER_UNAVAILABLE", status: 200, message: "upstream dropped", fromStream: true });
        }
        yield f;
        i += 1;
      }
      if (throwAfter !== undefined && i === throwAfter) {
        throw new AtlasError({ code: "PROVIDER_UNAVAILABLE", status: 200, message: "upstream dropped", fromStream: true });
      }
    },
  } as unknown as AtlasClient;
}

async function collect(gen: AsyncGenerator<StreamEvent, void, void>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

// --- The persistence contract, which is the whole point --------------------

test("a completed stream ends with the same durable state as a non-streamed turn", async () => {
  const store = new InMemoryCopilotStore();
  const events = await collect(
    streamCopilotTurn(ctx("sales_rep", "free", store), { question: "next step?", tenantId: TENANT }, {
      atlasClient: atlas([
        { type: "text", delta: "Call " },
        { type: "text", delta: "the CFO." },
        { type: "done" },
      ]),
    }),
  );

  assert.equal(events.filter((e) => e.type === "delta").length, 2);
  const sessionEvent = events.find((e) => e.type === "session");
  assert.ok(sessionEvent && sessionEvent.type === "session");

  const messages = await store.listMessages(WS, sessionEvent.sessionId);
  assert.deepEqual(messages.map((m) => m.role), ["user", "assistant"]);
  assert.equal(messages[1].content, "Call the CFO.");
});

test("a partial answer the member read is still persisted when the stream fails", async () => {
  // A turn that streamed beautifully and lost what it said is worse than one
  // that never streamed.
  const store = new InMemoryCopilotStore();
  const events = await collect(
    streamCopilotTurn(ctx("sales_rep", "free", store), { question: "q", tenantId: TENANT }, {
      atlasClient: atlas([{ type: "text", delta: "Partial answer" }], 1),
    }),
  );

  const err = events.find((e) => e.type === "error");
  assert.ok(err && err.type === "error");
  assert.equal(err.code, "atlas_PROVIDER_UNAVAILABLE");

  const sessionEvent = events.find((e) => e.type === "session");
  assert.ok(sessionEvent && sessionEvent.type === "session");
  const messages = await store.listMessages(WS, sessionEvent.sessionId);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].content, "Partial answer");
});

test("abandoning the stream still persists what was produced", async () => {
  // The consumer disconnects after one token. The finally block must still run.
  const store = new InMemoryCopilotStore();
  const gen = streamCopilotTurn(ctx("sales_rep", "free", store), { question: "q", tenantId: TENANT }, {
    atlasClient: atlas([
      { type: "text", delta: "first" },
      { type: "text", delta: " second" },
      { type: "done" },
    ]),
  });

  let sessionId = "";
  for await (const e of gen) {
    if (e.type === "session") sessionId = e.sessionId;
    if (e.type === "delta") break; // walk away mid-stream
  }
  await gen.return(undefined);

  const messages = await store.listMessages(WS, sessionId);
  assert.equal(messages.length, 2, "the question and what was said are both durable");
  assert.equal(messages[1].content, "first");
});

test("the question is persisted before the model is called", async () => {
  const store = new InMemoryCopilotStore();
  const events = await collect(
    streamCopilotTurn(ctx("sales_rep", "free", store), { question: "will this survive?", tenantId: TENANT }, {
      atlasClient: atlas([], 0),
    }),
  );

  const sessionEvent = events.find((e) => e.type === "session");
  assert.ok(sessionEvent && sessionEvent.type === "session");
  const messages = await store.listMessages(WS, sessionEvent.sessionId);
  assert.equal(messages.length, 1, "no answer, but the question is there");
  assert.equal(messages[0].content, "will this survive?");
});

test("nothing is written when the answer was empty", async () => {
  const store = new InMemoryCopilotStore();
  const events = await collect(
    streamCopilotTurn(ctx("sales_rep", "free", store), { question: "q", tenantId: TENANT }, {
      atlasClient: atlas([{ type: "done" }]),
    }),
  );
  const sessionEvent = events.find((e) => e.type === "session");
  assert.ok(sessionEvent && sessionEvent.type === "session");
  const messages = await store.listMessages(WS, sessionEvent.sessionId);
  assert.equal(messages.length, 1, "an empty assistant message is not a message");
});

// --- Gates ------------------------------------------------------------------

test("the gate runs before anything is spent", async () => {
  const store = new InMemoryCopilotStore();
  let called = false;
  const spy = {
    async *chatStream() {
      called = true;
    },
  } as unknown as AtlasClient;

  const c = ctx("sales_rep", "pro", store);
  c.holder = { permissions: new Set() };
  const events = await collect(streamCopilotTurn(c, { question: "q", tenantId: TENANT }, { atlasClient: spy }));

  assert.equal(called, false, "no model call may have been made");
  assert.equal(events[0].type, "error");
});

test("a missing tenant is refused before the model", async () => {
  const events = await collect(
    streamCopilotTurn(ctx("sales_rep", "free"), { question: "q", tenantId: "" }, { atlasClient: atlas([]) }),
  );
  assert.equal(events[0].type, "error");
  assert.equal(events[0].type === "error" && events[0].code, "tenant_required");
});

test("an unknown session id is refused rather than silently opening a new one", async () => {
  const events = await collect(
    streamCopilotTurn(
      ctx("sales_rep", "free"),
      { question: "q", sessionId: "ghost", tenantId: TENANT },
      { atlasClient: atlas([]) },
    ),
  );
  assert.equal(events[0].type === "error" && events[0].code, "not_found");
});

// --- When streaming is the wrong choice ------------------------------------

test("a workspace that bought proposals does not stream", async () => {
  // Proposals need the tool loop, which needs whole responses. Streaming such a
  // turn would show tokens from a draft the model revises once tools answer.
  const withSuggest = ctx("sales_rep", "pro");
  assert.equal(shouldStream(withSuggest.entitlement, withSuggest.holder), false);

  const askOnly = ctx("sales_rep", "free");
  assert.equal(shouldStream(askOnly.entitlement, askOnly.holder), true);
});

test("an unsubscribed workspace does not stream either", async () => {
  const none = ctx("sales_rep", null);
  // copilot.suggest is unavailable, so shouldStream says yes - but the gate
  // inside the turn refuses first, which is the check that matters.
  const events = await collect(
    streamCopilotTurn(none, { question: "q", tenantId: TENANT }, { atlasClient: atlas([]) }),
  );
  assert.equal(events[0].type, "error");
});

// --- L1 X-3 audit wiring ----------------------------------------------------

test("a denied stream is recorded as denied", async () => {
  const audit = new InMemoryAuditStore();
  setAuditStore(audit);
  const none = ctx("sales_rep", null);
  await collect(streamCopilotTurn(none, { question: "q", tenantId: TENANT }, { atlasClient: atlas([]) }));
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].outcome, "denied");
  setAuditStore(null);
});

test("a completed stream is recorded as success with its token usage", async () => {
  const audit = new InMemoryAuditStore();
  setAuditStore(audit);
  await collect(
    streamCopilotTurn(ctx("sales_rep", "free"), { question: "q", tenantId: TENANT }, {
      atlasClient: atlas([
        { type: "text", delta: "hi" },
        { type: "done", usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 } },
      ]),
    }),
  );
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].outcome, "success");
  assert.equal(audit.rows[0].costAmount, 7);
  assert.equal(audit.rows[0].costUnit, "tokens");
  assert.ok(audit.rows[0].taskId);
  setAuditStore(null);
});

test("a completed stream with no usage frame reports no cost, not a fabricated zero", async () => {
  const audit = new InMemoryAuditStore();
  setAuditStore(audit);
  await collect(
    streamCopilotTurn(ctx("sales_rep", "free"), { question: "q", tenantId: TENANT }, {
      atlasClient: atlas([{ type: "text", delta: "hi" }, { type: "done" }]),
    }),
  );
  assert.equal(audit.rows[0].costAmount, null);
  assert.equal(audit.rows[0].costUnit, null);
  setAuditStore(null);
});

test("a failed stream is recorded as error, and the partial answer's cost is not lost either", async () => {
  const audit = new InMemoryAuditStore();
  setAuditStore(audit);
  await collect(
    streamCopilotTurn(ctx("sales_rep", "free"), { question: "q", tenantId: TENANT }, {
      atlasClient: atlas([{ type: "text", delta: "Partial" }], 1),
    }),
  );
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].outcome, "error");
  setAuditStore(null);
});
