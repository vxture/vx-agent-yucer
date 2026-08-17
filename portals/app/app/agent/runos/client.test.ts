import { test } from "node:test";
import assert from "node:assert/strict";
import { RunosClient, type RunosConfig, type RunosContext } from "./client";
import { RunosError, parseToolError, transportError, shouldRetry } from "./errors";
import { TASK_ID_MAX_LENGTH } from "./types";

const CFG: RunosConfig = {
  baseUrl: "http://runos.test",
  mcpPath: "/v1/mcp",
  timeoutMs: 5_000,
  enabled: true,
  agentVersion: "yucer/0.2.0",
};

const CTX: RunosContext = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  tenantId: "22222222-2222-2222-2222-222222222222",
  taskId: "task_abc",
};

interface Sent {
  url: string;
  init: RequestInit;
  rpc: {
    method: string;
    params: { name: string; arguments: Record<string, unknown>; _meta?: { vxture?: Record<string, unknown> } };
  };
}

function harness(responses: Array<() => Response>) {
  const sent: Sent[] = [];
  let i = 0;
  const client = new RunosClient(CFG, {
    fetchImpl: async (url, init) => {
      sent.push({ url, init, rpc: JSON.parse(String(init.body)) });
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
  });
  return { client, sent };
}

const rpcOk = (result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const toolError = (body: Record<string, unknown>) =>
  rpcOk({ isError: true, content: [{ type: "text", text: JSON.stringify(body) }] });

// --- Call context -----------------------------------------------------------

test("every tool call carries task_id in _meta.vxture", async () => {
  const { client, sent } = harness([() => rpcOk({ structuredContent: { capabilities: [] } })]);
  await client.discover({ query: "invoice" }, CTX);
  assert.equal(sent[0].url, "http://runos.test/v1/mcp");
  assert.equal(sent[0].rpc.method, "tools/call");
  assert.equal(sent[0].rpc.params.name, "runos_discover");
  assert.equal(sent[0].rpc.params._meta?.vxture?.task_id, "task_abc");
  assert.equal(sent[0].rpc.params._meta?.vxture?.agent_version, "yucer/0.2.0");
});

test("a missing or over-long task_id is caught here, not after a round trip", async () => {
  const { client, sent } = harness([() => rpcOk({})]);
  for (const taskId of ["", "x".repeat(TASK_ID_MAX_LENGTH + 1)]) {
    await assert.rejects(
      () => client.discover({ query: "q" }, { ...CTX, taskId }),
      (e: unknown) => e instanceof RunosError && e.errorCode === "missing_metadata",
    );
  }
  assert.equal(sent.length, 0, "nothing should have left the process");
});

test("optional context fields are sent only when present", async () => {
  const a = harness([() => rpcOk({ structuredContent: { capabilities: [] } })]);
  await a.client.discover({ query: "q" }, CTX);
  const metaA = a.sent[0].rpc.params._meta!.vxture!;
  assert.equal("session_id" in metaA, false);
  assert.equal("delegation_token" in metaA, false);

  const b = harness([() => rpcOk({ structuredContent: { capabilities: [] } })]);
  await b.client.discover({ query: "q" }, { ...CTX, sessionId: "s1", delegationToken: "dt" });
  const metaB = b.sent[0].rpc.params._meta!.vxture!;
  assert.equal(metaB.session_id, "s1");
  assert.equal(metaB.delegation_token, "dt");
});

test("a member behind the call gets an OBO ticket; background work gets service", async () => {
  const a = harness([() => rpcOk({ structuredContent: { capabilities: [] } })]);
  await a.client.discover({ query: "q" }, { ...CTX, subjectToken: "member-token" });
  assert.match(String((a.sent[0].init.headers as Record<string, string>).authorization), /tok-obo-runos/);

  const b = harness([() => rpcOk({ structuredContent: { capabilities: [] } })]);
  await b.client.discover({ query: "q" }, CTX);
  assert.match(String((b.sent[0].init.headers as Record<string, string>).authorization), /tok-service-runos/);
});

test("an unconfigured base URL fails loudly", async () => {
  const client = new RunosClient({ ...CFG, baseUrl: "", enabled: false });
  await assert.rejects(() => client.discover({ query: "q" }, CTX), RunosError);
});

// --- The four tools ---------------------------------------------------------

test("discover returns the capability list and passes taxonomy filters through", async () => {
  const { client, sent } = harness([
    () =>
      rpcOk({
        structuredContent: {
          capabilities: [
            {
              capability_id: "acme.invoice-extract",
              title: "Invoice Extract",
              summary: "s",
              use_when: "u",
              avoid_when: "a",
              primitive_type: "connector",
              provider: "acme",
              admission_tier: "official",
              operations: [],
            },
          ],
        },
      }),
  ]);
  const caps = await client.discover({ query: "invoice", category: "finance", tags: ["ocr"], limit: 20 }, CTX);
  assert.equal(caps.length, 1);
  assert.equal(caps[0].capability_id, "acme.invoice-extract");
  assert.deepEqual(sent[0].rpc.params.arguments, {
    query: "invoice",
    category: "finance",
    tags: ["ocr"],
    limit: 20,
  });
});

test("discover returning nothing is an empty list, not an error", async () => {
  // The production catalog starts empty, and a dependency reachable only by
  // closure is resolvable but never searchable - so empty is a normal answer.
  const { client } = harness([() => rpcOk({ structuredContent: {} })]);
  assert.deepEqual(await client.discover({ query: "anything" }, CTX), []);
});

test("resolve defaults to the stable alias and returns the contract", async () => {
  const { client, sent } = harness([
    () =>
      rpcOk({
        structuredContent: {
          capability_id: "acme.invoice-extract",
          title: "Invoice Extract",
          primitive_type: "connector",
          provider: "acme",
          version: "1.2.0",
          state: "stable",
          contract: { summary: "s", useWhen: "u", avoidWhen: "a", operations: [] },
        },
      }),
  ]);
  const resolved = await client.resolve("acme.invoice-extract", CTX);
  assert.equal(sent[0].rpc.params.arguments.version, "stable");
  assert.equal(resolved.version, "1.2.0");
});

test("resolve forwards latest and bare semver unchanged", async () => {
  for (const v of ["latest", "1.2.0"]) {
    const { client, sent } = harness([
      () => rpcOk({ structuredContent: { capability_id: "c", contract: { operations: [] } } }),
    ]);
    await client.resolve("c", CTX, v);
    assert.equal(sent[0].rpc.params.arguments.version, v);
  }
});

test("a payload delivered as a JSON text block is read the same as structuredContent", async () => {
  const { client } = harness([
    () => rpcOk({ content: [{ type: "text", text: JSON.stringify({ capabilities: [{ capability_id: "x" }] }) }] }),
  ]);
  const caps = await client.discover({ query: "q" }, CTX);
  assert.equal(caps[0].capability_id, "x");
});

test("invoke reads the meta block from structuredContent, and keeps it out of the payload", async () => {
  // NOTE THE ASYMMETRY, which is the whole reason this was wrong: the REQUEST
  // carries its metadata at `_meta.vxture` (asserted above), while the RESPONSE
  // carries it as a flat `_meta_vxture` key INSIDE structuredContent, beside
  // the capability's own payload. The fixture used to build the request shape
  // for a response, so the suite was green against a body Runos never sends.
  const { client, sent } = harness([
    () =>
      rpcOk({
        content: [{ type: "text", text: "done" }],
        structuredContent: {
          rows: 3,
          _meta_vxture: { call_id: "call_9", version_resolved: "2.0.0" },
        },
      }),
  ]);
  const res = await client.invoke(
    { capability_id: "acme.x", operation: "extract", arguments: { file_url: "u" } },
    CTX,
  );
  assert.equal(res.meta.call_id, "call_9");
  assert.equal(res.meta.version_resolved, "2.0.0");
  // The payload the model sees has the gateway's plumbing stripped out. Leaving
  // it in feeds call_id and version_resolved to the LLM as though they were
  // part of the capability's answer.
  assert.deepEqual(res.structured, { rows: 3 });
  assert.equal(sent[0].rpc.params.name, "runos_invoke");
});

test("skill_context rides along when following a skill", async () => {
  const { client, sent } = harness([() => rpcOk({ content: [] })]);
  await client.invoke({ capability_id: "acme.x", operation: "run", arguments: {} }, CTX, {
    skill_capability_id: "acme.playbook",
    skill_call_id: "call_1",
  });
  assert.deepEqual(sent[0].rpc.params._meta?.vxture?.skill_context, {
    skill_capability_id: "acme.playbook",
    skill_call_id: "call_1",
  });
});

test("reportOutcome never throws - losing feedback must not fail the work", async () => {
  const bad = harness([() => new Response("nope", { status: 500 })]);
  assert.equal(await bad.client.reportOutcome({ task_id: "task_abc", outcome: "success" }, CTX), false);

  const good = harness([() => rpcOk({ structuredContent: { acknowledged: true } })]);
  assert.equal(await good.client.reportOutcome({ task_id: "task_abc", outcome: "partial" }, CTX), true);
});

// --- The two error layers ---------------------------------------------------

test("a protocol failure rides the HTTP status", async () => {
  const { client } = harness([() => new Response(JSON.stringify({ message: "bad scope" }), { status: 401 })]);
  await assert.rejects(
    () => client.discover({ query: "q" }, CTX),
    (e: unknown) => e instanceof RunosError && e.status === 401 && !e.retryable,
  );
});

test("an execution failure rides an isError tool result on an HTTP 200", async () => {
  const { client } = harness([
    () => toolError({ error_class: "authz_rejected", error_code: "not_entitled", retryable: false, call_id: "c1" }),
  ]);
  await assert.rejects(
    () => client.invoke({ capability_id: "acme.x", operation: "run", arguments: {} }, CTX),
    (e: unknown) =>
      e instanceof RunosError && e.errorCode === "not_entitled" && e.isAdjudication && e.callId === "c1",
  );
});

test("a jsonrpc-level error is distinguished from a tool error", async () => {
  const { client } = harness([
    () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "no such tool" } }), {
        status: 200,
      }),
  ]);
  await assert.rejects(
    () => client.discover({ query: "q" }, CTX),
    (e: unknown) => e instanceof RunosError && /jsonrpc error -32601/.test(e.message),
  );
});

test("the four adjudication refusals are all non-retryable", () => {
  for (const code of ["not_entitled", "policy_denied", "approval_required", "quota_exceeded"]) {
    const e = parseToolError(JSON.stringify({ error_class: "authz_rejected", error_code: code, retryable: false }));
    assert.equal(e.isAdjudication, true, code);
    assert.equal(shouldRetry(e), false, code);
  }
});

test("unknown_capability means 'does not exist' and must not be probed", () => {
  // It covers both absent and unauthorized on purpose: distinguishing them would
  // turn error-code enumeration into catalog enumeration.
  const e = parseToolError(
    JSON.stringify({ error_class: "capability_error", error_code: "unknown_capability", retryable: false }),
  );
  assert.equal(e.isUnknown, true);
  assert.equal(shouldRetry(e), false);
});

test("Runos's own retryable flag wins over the class default", () => {
  // capability_error is "sometimes" by design, so the flag is the authority.
  const yes = parseToolError(
    JSON.stringify({ error_class: "capability_error", error_code: "provider_unavailable", retryable: true }),
  );
  assert.equal(shouldRetry(yes), true);

  const no = parseToolError(
    JSON.stringify({ error_class: "capability_error", error_code: "contract_violation", retryable: false }),
  );
  assert.equal(shouldRetry(no), false);
});

test("a retryable failure is still not retried for a non-idempotent operation", () => {
  // The gateway will not retry one on our behalf either, and a retry is a new
  // call with a new audit row - a duplicated write, not a deduplicated replay.
  const e = parseToolError(
    JSON.stringify({ error_class: "capability_timeout", error_code: "provider_unavailable", retryable: true }),
  );
  assert.equal(shouldRetry(e, { idempotent: true }), true);
  assert.equal(shouldRetry(e, { idempotent: false }), false);
});

test("timeouts and gateway faults default to retryable when no flag is present", () => {
  for (const cls of ["capability_timeout", "gateway_error", "gateway_timeout"]) {
    assert.equal(parseToolError(JSON.stringify({ error_class: cls, error_code: "x" })).retryable, true, cls);
  }
  for (const cls of ["authz_rejected", "caller_error", "cancelled"]) {
    assert.equal(parseToolError(JSON.stringify({ error_class: cls, error_code: "x" })).retryable, false, cls);
  }
});

test("an unparseable error body still becomes an error, never a success", () => {
  const e = parseToolError("upstream exploded <html>");
  assert.equal(e.errorClass, "gateway_error");
  assert.equal(e.retryable, false);
  assert.match(e.message, /upstream exploded/);
});

test("transport 5xx is retryable and 4xx is not", () => {
  assert.equal(transportError(503, {}).retryable, true);
  assert.equal(transportError(403, {}).retryable, false);
  assert.equal(transportError(400, {}).retryable, false);
});
