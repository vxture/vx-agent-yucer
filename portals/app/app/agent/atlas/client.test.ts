import { test } from "node:test";
import assert from "node:assert/strict";
import { AtlasClient, backoffMs, parseSse, type AtlasConfig, type AtlasContext } from "./client";
import { AtlasError } from "./errors";
import { endpointFor, endpointMap, COPILOT_TASKS } from "./endpoints";
import type { StreamFrame } from "./types";

const CFG: AtlasConfig = { baseUrl: "http://atlas.test", timeoutMs: 5_000, maxRetries: 2, enabled: true };

const CTX: AtlasContext = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  tenantId: "22222222-2222-2222-2222-222222222222", taskId: "task_1",
};

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

function harness(responses: Array<() => Response>) {
  const calls: Call[] = [];
  const slept: number[] = [];
  let i = 0;
  const client = new AtlasClient(CFG, {
    fetchImpl: async (url, init) => {
      calls.push({
        url,
        init,
        body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      });
      const make = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return make();
    },
    mintToken: async (req) => ({
      accessToken: `tok-${req.mode}-${req.audience}`,
      expiresAt: 0,
      audience: req.audience,
      mode: req.mode,
    }),
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
  return { client, calls, slept };
}

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ok = (over: Record<string, unknown> = {}) =>
  jsonRes(200, {
    id: "call_1",
    modelCode: "glm-4",
    message: { role: "assistant", content: "hi" },
    usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    latencyMs: 12,
    ...over,
  });

// --- Routing ----------------------------------------------------------------

test("chat routes by endpointCode and never sends a modelCode", () => {
  // Pinning a model forfeits the endpoint's fallback chain and blocks an
  // operator from re-pointing the capability.
  const { client, calls } = harness([() => ok()]);
  return client.chat("chat", { messages: [{ role: "user", content: "hi" }] }, CTX).then(() => {
    assert.equal(calls[0].url, "http://atlas.test/v1/chat");
    assert.equal(calls[0].body.endpointCode, "chat/default");
    assert.equal(calls[0].body.modelCode, undefined);
  });
});

test("each copilot task maps to its own endpoint, overridable by env", () => {
  assert.equal(endpointFor("chat", {}), "chat/default");
  assert.equal(endpointFor("propose", {}), "chat/reasoning");
  assert.equal(endpointFor("score", {}), "chat/fast");
  assert.equal(endpointFor("propose", { ATLAS_ENDPOINT_PROPOSE: "chat/opus" }), "chat/opus");
  // A blank override must not produce an empty endpoint code.
  assert.equal(endpointFor("chat", { ATLAS_ENDPOINT_CHAT: "  " }), "chat/default");

  const map = endpointMap({});
  for (const t of COPILOT_TASKS) assert.ok(map[t], `${t} has no endpoint`);
});

test("an explicit endpointCode on the request wins over the task default", () => {
  const { client, calls } = harness([() => ok()]);
  return client
    .chat("chat", { messages: [], endpointCode: "chat/special" }, CTX)
    .then(() => assert.equal(calls[0].body.endpointCode, "chat/special"));
});

test("the call is tagged as an agent application for metering", () => {
  const { client, calls } = harness([() => ok()]);
  return client
    .chat("chat", { messages: [] }, { ...CTX, applicationId: "sess_1", requestId: "req_9" })
    .then(() => {
      assert.equal(calls[0].body.applicationType, "agent");
      assert.equal(calls[0].body.applicationId, "sess_1");
      assert.equal(calls[0].body.requestId, "req_9");
      assert.equal(calls[0].body.tenantId, CTX.tenantId);
    });
});

// --- Token mode -------------------------------------------------------------

test("a member behind the call gets an OBO ticket; background work gets service", async () => {
  const a = harness([() => ok()]);
  await a.client.chat("chat", { messages: [] }, { ...CTX, subjectToken: "member-access-token" });
  assert.match(String((a.calls[0].init.headers as Record<string, string>).authorization), /tok-obo-atlas/);

  const b = harness([() => ok()]);
  await b.client.chat("score", { messages: [] }, CTX);
  assert.match(String((b.calls[0].init.headers as Record<string, string>).authorization), /tok-service-atlas/);
});

test("an unconfigured base URL fails loudly instead of silently doing nothing", async () => {
  const client = new AtlasClient({ ...CFG, baseUrl: "", enabled: false });
  await assert.rejects(
    () => client.chat("chat", { messages: [] }, CTX),
    (e: unknown) => e instanceof AtlasError && e.code === "ATLAS_NOT_CONFIGURED",
  );
});

// --- Retry ------------------------------------------------------------------

test("a rate limit is retried after the delay the body names", async () => {
  const { client, slept, calls } = harness([
    () => jsonRes(429, { code: "RATE_LIMITED", message: "slow", retryAfterMs: 900 }),
    () => ok(),
  ]);
  const res = await client.chat("chat", { messages: [] }, CTX);
  assert.equal(res.id, "call_1");
  assert.deepEqual(slept, [900]);
  assert.equal(calls.length, 2);
});

test("a provider outage is retried with exponential backoff", async () => {
  const { client, slept } = harness([
    () => jsonRes(503, { code: "PROVIDER_UNAVAILABLE", message: "down" }),
    () => jsonRes(503, { code: "PROVIDER_UNAVAILABLE", message: "down" }),
    () => ok(),
  ]);
  await client.chat("chat", { messages: [] }, CTX);
  assert.deepEqual(slept, [backoffMs(0), backoffMs(1)]);
});

test("a grant denial is surfaced immediately without a single retry", async () => {
  const { client, calls, slept } = harness([() => jsonRes(403, { code: "GRANT_DENIED", message: "no grant" })]);
  await assert.rejects(
    () => client.chat("chat", { messages: [] }, CTX),
    (e: unknown) => e instanceof AtlasError && e.code === "GRANT_DENIED",
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(slept, []);
});

test("retries stop at the configured ceiling and rethrow the last error", async () => {
  const { client, calls } = harness([() => jsonRes(503, { code: "PROVIDER_UNAVAILABLE", message: "down" })]);
  await assert.rejects(
    () => client.chat("chat", { messages: [] }, CTX),
    (e: unknown) => e instanceof AtlasError && e.code === "PROVIDER_UNAVAILABLE",
  );
  assert.equal(calls.length, CFG.maxRetries + 1);
});

test("backoff is bounded", () => {
  assert.equal(backoffMs(0), 250);
  assert.equal(backoffMs(1), 500);
  assert.ok(backoffMs(20) <= 8_000);
});

// --- Streaming --------------------------------------------------------------

function sse(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const s of chunks) c.enqueue(enc.encode(s));
      c.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<StreamFrame[]> {
  const out: StreamFrame[] = [];
  for await (const f of parseSse(stream)) out.push(f);
  return out;
}

test("frames parse with and without a space after data:", async () => {
  const frames = await collect(
    sse(['data:{"type":"text","delta":"a"}\n', 'data: {"type":"text","delta":"b"}\n']),
  );
  assert.deepEqual(frames, [
    { type: "text", delta: "a" },
    { type: "text", delta: "b" },
  ]);
});

test("frames split across chunk boundaries are reassembled", async () => {
  const frames = await collect(sse(['data:{"type":"te', 'xt","delta":"hel', 'lo"}\n']));
  assert.deepEqual(frames, [{ type: "text", delta: "hello" }]);
});

test("the [DONE] sentinel ends the stream", async () => {
  const frames = await collect(
    sse(['data:{"type":"text","delta":"a"}\n', "data: [DONE]\n", 'data:{"type":"text","delta":"never"}\n']),
  );
  assert.equal(frames.length, 1);
});

test("keepalives, comments and unparseable frames are skipped, not fatal", async () => {
  const frames = await collect(
    sse([": keepalive\n", "\n", "event: ping\n", "data:{not json}\n", 'data:{"type":"text","delta":"a"}\n']),
  );
  assert.deepEqual(frames, [{ type: "text", delta: "a" }]);
});

test("a final frame with no trailing newline is still emitted", async () => {
  const frames = await collect(sse(['data:{"type":"done","finishReason":"stop"}']));
  assert.deepEqual(frames, [{ type: "done", finishReason: "stop" }]);
});

test("chatStream yields text then done", async () => {
  const { client } = harness([
    () =>
      new Response(
        sse([
          'data:{"type":"text","delta":"he"}\n',
          'data:{"type":"text","delta":"llo"}\n',
          'data:{"type":"done","usage":{"promptTokens":1,"completionTokens":2,"totalTokens":3},"finishReason":"stop"}\n',
          "data: [DONE]\n",
        ]),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
  ]);
  const frames: StreamFrame[] = [];
  for await (const f of client.chatStream("chat", { messages: [] }, CTX)) frames.push(f);
  assert.equal(frames.length, 3);
  assert.equal(frames[2].type, "done");
});

test("a mid-stream error frame throws even though the response was 200", async () => {
  // The trap this exists for: HTTP status is already 200 and cannot change, so
  // a status-only consumer treats a truncated answer as a complete one.
  const { client } = harness([
    () =>
      new Response(
        sse([
          'data:{"type":"text","delta":"partial"}\n',
          'data:{"type":"error","code":"PROVIDER_UNAVAILABLE","message":"upstream dropped"}\n',
        ]),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
  ]);

  const seen: StreamFrame[] = [];
  await assert.rejects(
    async () => {
      for await (const f of client.chatStream("chat", { messages: [] }, CTX)) seen.push(f);
    },
    (e: unknown) =>
      e instanceof AtlasError && e.fromStream && e.code === "PROVIDER_UNAVAILABLE" && e.status === 200,
  );
  assert.deepEqual(seen, [{ type: "text", delta: "partial" }], "frames before the failure still reached the caller");
});

test("a stream request that fails before any frame throws the HTTP error", async () => {
  const { client } = harness([() => jsonRes(403, { code: "GRANT_DENIED", message: "no grant" })]);
  await assert.rejects(
    async () => {
      for await (const _ of client.chatStream("chat", { messages: [] }, CTX)) void _;
    },
    (e: unknown) => e instanceof AtlasError && e.code === "GRANT_DENIED" && !e.fromStream,
  );
});

test("the stream request sets stream:true and the non-stream one does not", async () => {
  const a = harness([() => new Response(sse(["data: [DONE]\n"]), { status: 200 })]);
  for await (const _ of a.client.chatStream("chat", { messages: [] }, CTX)) void _;
  assert.equal(a.calls[0].body.stream, true);

  const b = harness([() => ok()]);
  await b.client.chat("chat", { messages: [] }, CTX);
  assert.equal(b.calls[0].body.stream, false);
});
