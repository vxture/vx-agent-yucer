import assert from "node:assert/strict";
import test from "node:test";
import { currentContext, paginate, publicUrls, runConsumerProbe, runProbe, safeReason, skillPrerequisites } from "./xiaoyu-supply-probe.mjs";

const context = { tenantId: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-8222-222222222222" };
const env = { OIDC_CLIENT_ID: "yucer", OIDC_CLIENT_SECRET: "private-credential",
  RUNOS_BASE_URL: "https://runos.test", ATLAS_BASE_URL: "https://atlas.test", PLATFORM_API_URL: "https://platform.test" };
const provision = (overrides = {}) => ({ tenant_id: context.tenantId, workspace_id: context.workspaceId,
  state: "provisioned", seq: 1, updated_at: "2026-11-21T12:00:00Z", ...overrides });
const row = (capability_id, primitive_type) => ({ capability_id, primitive_type, summary: "public research" });
const rows = { skill: Array.from({ length: 21 }, (_, n) => row(`public.research-${n}`, "skill")),
  connector: [row("exa.web-research", "connector")], executor: [], asset: [] };
const json = body => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const meta = (version, kind) => ({ _meta: { vxture: { call_id: "call-1", version_resolved: version,
  ...(kind ? { result_kind: kind } : {}) } } });
function fixture(change = () => undefined) {
  const requests = [];
  const request = async (url, init) => {
    requests.push({ url, init });
    assert.equal(init.redirect, "error");
    const body = init.body?.startsWith("{") ? JSON.parse(init.body) : null;
    const overridden = change(url, init, body);
    if (overridden) return overridden;
    if (url.endsWith("/oidc/token")) {
      const form = new URLSearchParams(init.body);
      if (form.get("audience") === "vxture") {
        assert.equal(form.get("scope"), "provisioning:read");
        for (const key of ["workspace_id", "tenant_id", "org_id", "act_sub", "subject_token"]) assert.equal(form.get(key), null);
        return json({ access_token: "private-reader-token", token_type: "Bearer", expires_in: 300 });
      }
      assert.equal(form.get("act_sub"), "yucer");
      assert.equal(form.get("tenant_id"), context.tenantId);
      assert.equal(form.get("workspace_id"), context.workspaceId);
      assert.equal(form.get("mode"), "service");
      return json({ access_token: "private-access-token", expires_in: 300 });
    }
    if (url.startsWith("https://platform.test/platform/provisioning?")) {
      assert.equal(init.method, "GET");
      assert.equal(init.headers.authorization, "Bearer private-reader-token");
      return json({ items: [provision()], nextCursor: null });
    }
    if (url.endsWith("/v1/model-routes")) return json({ endpoints: ["chat", "embedding", "rerank"].map(category => ({
      endpointCode: category === "chat" ? "chat/default" : `${category}/default`, category, state: "active",
      contextWindow: 8192, maxOutputTokens: 1024, thinkingModes: ["off"], toolSupport: { tools: true }, secret: "private-body",
    })) });
    if (url.endsWith("/v1/mcp")) {
      const { name, arguments: args } = body.params;
      assert.match(body.params._meta.vxture.task_id, /^xy00b:/);
      let result;
      if (name === "runos_discover") {
        const list = rows[args.filter.primitive_type], start = args.cursor ? 20 : 0;
        result = { capabilities: list.slice(start, start + 20), total: list.length,
          ...(list.length > start + 20 ? { next_cursor: "page2" } : {}) };
      } else if (name === "runos_resolve") result = { capability_id: args.capability_id, version: "1.0.0", state: "stable", contract: {
        operations: args.capability_id === "exa.web-research" ? ["web_search_exa", "web_fetch_exa"].map(operation => ({ operation,
          riskLevel: "read", interactionMode: "sync", inputSchema: { properties: { query: {} } } })) : [{ operation: "fetch" }],
        dependencies: [{ capabilityId: "exa.web-research", kind: "required" }], secret: "private-body" } };
      else {
        assert.equal(name, "runos_invoke");
        assert.ok(["fetch", "web_search_exa", "web_fetch_exa"].includes(args.operation));
        assert.equal(args.version, "1.0.0");
        const distributed = args.operation === "fetch";
        result = { content: [{ type: "text", text: distributed ? "public skill instructions" :
          "https://www.unitree.com/ Unitree robotics develops legged robots. This is a public research fixture with readable company information, not just a status." }],
          structuredContent: meta("1.0.0", distributed ? "distributed" : undefined) };
      }
      return json({ result: result.content ? result : { structuredContent: result } });
    }
    assert.equal(body.workspaceId, context.workspaceId);
    assert.equal(body.tenantId, context.tenantId);
    assert.match(body.taskId, /^xy00b:/);
    assert.equal(body.applicationType, undefined);
    assert.equal(body.applicationId, undefined);
    assert.equal(body.modelCode, undefined);
    if (url.endsWith("/v1/chat")) return json({ id: "response-1", modelCode: "public-model", message: { content: "Unitree develops robots." },
      usage: { promptTokens: 50, completionTokens: 8, totalTokens: 58 } });
    if (url.endsWith("/v1/embed")) return json({ modelCode: "embed-model", vectors: [[1, 0], [0, 1]] });
    if (url.endsWith("/v1/rerank")) return json({ modelCode: "rank-model", scores: [{ id: "market", score: 0.9 }, { id: "other", score: 0.1 }] });
    throw Error("unexpected URL");
  };
  return { request, requests };
}

test("pages beyond the first 20 and resolves a versioned manifest before bounded public calls", async () => {
  const { request, requests } = fixture();
  const report = await runProbe(context, env, request);
  assert.equal(report.status, "ok");
  assert.equal(report.data.runos.skill.data.total, 21);
  assert.equal(report.data.runos.skill.data.pages, 2);
  assert.equal(report.data.runos.skill.data.beyond_first_20, "public.research-20");
  assert.equal(report.data.runos.skill.data.resolved, 21);
  assert.equal(report.data.runos.skill_sample.data.execution_status, "not_executed");
  assert.equal(report.data.runos.public_research.data.declared_skill_dependency_used, true);
  assert.equal(report.data.runos.public_research.data.business_saved, false);
  assert.ok(report.data.calls.some(c => c.result_kind === "distributed"));
  assert.equal(report.data.calls.filter(c => c.plane === "atlas").length, 3);
  assert.equal(report.data.calls.find(c => c.plane === "atlas").usage.input_tokens, 50);
  assert.ok(!JSON.stringify(report).includes("private-"));
  assert.ok(!requests.some(r => /register|grant|deploy|customer|sql/.test(r.url)));
});

test("truncated, duplicate, changing or looping pages fail instead of claiming completeness", async () => {
  for (const reply of [
    { capabilities: [rows.skill[0]], total: 10 },
    { capabilities: [rows.skill[0]], next_cursor: "again" },
  ]) await assert.rejects(paginate(async () => reply, "skill"));
  let n = 0;
  await assert.rejects(paginate(async () => ++n === 1 ? { capabilities: [rows.skill[0]], total: 2, next_cursor: "next" }
    : { capabilities: [rows.skill[1]], total: 3 }, "skill"));
});

test("provider raw errors and identity credentials cannot enter output", async () => {
  const { request } = fixture(() => { throw new Error("private-access-token private-credential"); });
  const result = await runProbe(context, env, request);
  assert.equal(result.status, "partial");
  assert.ok(!JSON.stringify(result).includes("private-"));
  assert.equal(safeReason(Error("private-credential")), "probe_failed");
});

test("a distributed response or missing receipt cannot establish real search success", async () => {
  for (const v of [meta("1.0.0", "distributed"), {}, meta("9.0.0")]) {
    const { request } = fixture((url, init, body) => body?.params?.arguments?.operation === "web_search_exa" ? json({ result: {
      content: [{ type: "text", text: "https://www.unitree.com/ " + "robot ".repeat(30) }], structuredContent: v,
    } }) : undefined);
    const result = await runProbe(context, env, request);
    assert.equal(result.status, "partial");
    assert.equal(result.data.runos.public_research.status, "unavailable");
    assert.equal(result.data.atlas.chat_sample.status, "unavailable");
  }
});

test("write risk contract prevents invocation; unrelated model output is never taken as saving", async () => {
  const { request, requests } = fixture((url, init, body) => body?.params?.name === "runos_resolve" &&
    body.params.arguments.capability_id === "exa.web-research" ? json({ result: { structuredContent: {
      capability_id: "exa.web-research", version: "1.0.0", contract: {
        operations: [{ operation: "web_search_exa", riskLevel: "write" }],
      },
    } } }) : undefined);
  const result = await runProbe(context, env, request);
  assert.equal(result.data.runos.public_research.reason, "research_read_contract_missing");
  assert.ok(!requests.some(r => r.init.body?.includes('"operation":"web_search_exa"')));
});

test("public source URLs exclude credentials, query strings and unrelated hosts", () => {
  assert.deepEqual(publicUrls("https://unitree.com/ https://user:pass@unitree.com/ https://unitree.com/?token=x https://evil.test/ https://127.0.0.1/"),
    ["https://unitree.com/"]);
});

test("missing workspace or wrong product never mints a token", async () => {
  for (const [ctx, cfg] of [[{ ...context, workspaceId: "" }, env], [context, { ...env, PRODUCT_CODE: "operator" }]]) {
    let calls = 0;
    await assert.rejects(runProbe(ctx, cfg, () => { calls++; }));
    assert.equal(calls, 0);
  }
});

test("invalid fetched evidence prevents model use; a truncated model answer is incomplete", async () => {
  const { request, requests } = fixture((url, init, body) => body?.params?.arguments?.operation === "web_fetch_exa"
    ? json({ result: { content: [{ type: "text", text: "https://unitree.com/ status " + "pending ".repeat(30) }],
      structuredContent: meta("1.0.0") } }) : undefined);
  const report = await runProbe(context, env, request);
  assert.equal(report.data.runos.public_research.status, "unavailable");
  assert.ok(!requests.some(r => r.url.endsWith("/v1/chat")));
  const truncated = fixture(url => url.endsWith("/v1/chat") ? json({ id: "response-1", modelCode: "model",
    message: { content: "Truncated answer" }, finishReason: "length" }) : undefined);
  const result = await runProbe(context, env, truncated.request);
  assert.equal(result.data.atlas.chat_sample.reason, "model_receipt_invalid_or_incomplete");
});

test("production entry uses the current platform reader and then scoped plane identities", async () => {
  const { request, requests } = fixture();
  const result = await runConsumerProbe(env, request);
  assert.equal(result.status, "ok");
  assert.equal(result.data.context.source, "platform_provisioning_reader");
  assert.deepEqual(result.context_verification, { pages: 1, scanned: 1, provisioned: 1, selection: "latest_current_platform_relation" });
  assert.equal(requests.filter(r => r.url.startsWith("https://platform.test/")).length, 1);
  assert.ok(!requests.some(r => /ack|usage|webhook|sql/.test(r.url)));
  assert.ok(!JSON.stringify(result).includes("private-"));
});

test("all provisioning pages are validated before selecting a current tenant/workspace pair", async () => {
  const { request, requests } = fixture(url => {
    if (!url.startsWith("https://platform.test/")) return;
    const next = new URL(url).searchParams.get("cursor");
    assert.equal(new URL(url).searchParams.get("limit"), "200");
    return next ? json({ items: [provision()], nextCursor: null }) : json({
      items: [provision({ state: "deprovisioned", workspace_id: "33333333-3333-4333-8333-333333333333", updated_at: "2026-11-22T12:00:00Z" })], nextCursor: "next" });
  });
  const result = await currentContext(env, request);
  assert.equal(result.workspaceId, context.workspaceId);
  assert.equal(result.tenantId, context.tenantId);
  assert.equal(result.verification.pages, 2);
  assert.equal(requests.length, 3);
});

test("malformed, revoked, duplicate and incomplete provisioning cannot trigger plane calls", async () => {
  const samples = [
    { items: [], nextCursor: null },
    { items: [provision({ state: "deprovisioned" })], nextCursor: null },
    { items: [provision({ state: "pending" })], nextCursor: null },
    { items: [provision({ tenant_id: null })], nextCursor: null },
    { items: [provision({ tenant_id: [context.tenantId] })], nextCursor: null },
    { items: [provision({ tenant_id: "none" })], nextCursor: null },
    { items: [provision({ workspace_id: "'; SELECT secret; --" })], nextCursor: null },
    { items: [provision({ seq: -1 })], nextCursor: null },
    { items: [provision({ updated_at: "unknown" })], nextCursor: null },
    { items: [provision(), provision()], nextCursor: null },
    { items: [provision()] },
    { items: [], nextCursor: "loop" },
    { items: [provision(), provision({ tenant_id: "33333333-3333-4333-8333-333333333333" })], nextCursor: null },
  ];
  for (const raw of samples) {
    const { request, requests } = fixture(url => url.startsWith("https://platform.test/") ? json(raw) : undefined);
    const result = await runConsumerProbe(env, request);
    assert.equal(result.status, "unavailable");
    assert.equal(result.stage, "context_verification");
    assert.ok(!requests.some(r => /atlas.test|runos.test/.test(r.url)));
    assert.ok(!JSON.stringify(result).includes("private-"));
  }
});

test("platform token and transport failures use fixed safe codes without credential leakage", async () => {
  for (const raw of [{}, { access_token: "private-token", token_type: "wrong", expires_in: 300 },
    { access_token: "private-token", token_type: "Bearer", expires_in: 0 }]) {
    const f = fixture(url => url.endsWith("/oidc/token") ? json(raw) : undefined);
    const result = await runConsumerProbe(env, f.request);
    assert.equal(result.reason, "platform_reader_token_invalid");
    assert.equal(f.requests.length, 1);
  }
  for (const response of [() => new Response("private-secret", { status: 401 }),
    () => { throw Error("private-secret"); }, () => new Response("private-secret", { status: 200 })]) {
    const f = fixture(url => url.startsWith("https://platform.test/") ? response() : undefined);
    const result = await runConsumerProbe(env, f.request);
    assert.equal(result.status, "unavailable");
    assert.ok(!JSON.stringify(result).includes("private-"));
  }
  const missing = await runConsumerProbe({ ...env, PLATFORM_API_URL: "" }, () => { throw Error("must not fetch"); });
  assert.equal(missing.reason, "platform_reader_not_configured");
});

test("latest active platform relation is selected deterministically without audit history", async () => {
  const older = provision({ workspace_id: "33333333-3333-4333-8333-333333333333", updated_at: "2026-11-20T12:00:00Z" });
  for (const items of [[older, provision()], [provision(), older]]) {
    const f = fixture(url => url.startsWith("https://platform.test/") ? json({ items, nextCursor: null }) : undefined);
    assert.equal((await currentContext(env, f.request)).workspaceId, context.workspaceId);
  }
});

test("upstream Runos failures retain canonical code and call receipt without raw errors", async () => {
  for (const code of ["CALLER_INVALID_ARGUMENTS", "CAPABILITY_PROVIDER_UNAVAILABLE", "private-secret"]) {
    const f = fixture((url, init, body) => body?.params?.arguments?.operation === "web_search_exa" ? json({ result: {
      isError: true, structuredContent: { code, message: "private-secret", call_id: "failed-call-1" },
    } }) : undefined);
    const result = await runConsumerProbe(env, f.request);
    const reason = result.data.runos.public_research.reason;
    assert.equal(reason, code === "private-secret" ? "runos_rejected" : `runos_${code.toLowerCase()}`);
    assert.equal(result.data.calls.find(c => c.outcome === "failed").call_id, "failed-call-1");
    assert.ok(!JSON.stringify(result).includes("private-"));
  }
  const f = fixture();
  const result = await runConsumerProbe({ ...env, ATLAS_BASE_URL: "" }, f.request);
  assert.equal(result.stage, "consumer_probe");
  assert.equal(result.reason, "consumer_not_configured");
});

test("Atlas failure receipts retain canonical diagnostics and the caller request ID", async () => {
  const requestId = "33333333-3333-4333-8333-333333333333";
  const f = fixture(url => url.endsWith("/v1/embed") ? new Response(JSON.stringify({ code: "PROVIDER_UNAVAILABLE",
    retryable: true, requestId, message: "private-secret", provider: "private-secret" }), { status: 503 }) : undefined);
  const result = await runConsumerProbe(env, f.request);
  const receipt = result.data.calls.find(c => c.plane === "atlas" && c.outcome === "failed");
  assert.equal(receipt.route, "embedding/default");
  assert.equal(receipt.http_status, 503);
  assert.equal(receipt.error_code, "PROVIDER_UNAVAILABLE");
  assert.equal(receipt.retryable, true);
  assert.equal(receipt.server_request_id, requestId);
  assert.match(receipt.request_id, /^[a-f0-9-]{36}$/);
  assert.equal(result.data.atlas.embedding_sample.failure.error_code, "PROVIDER_UNAVAILABLE");
  assert.equal(result.data.atlas.chat_sample.status, "ok");
  assert.equal(result.data.atlas.rerank_sample.status, "ok");
  assert.ok(!JSON.stringify(result).includes("private-"));
});

test("unknown or unreadable Atlas errors stay redacted and still produce failed call receipts", async () => {
  for (const body of ["private-secret", JSON.stringify({ code: "private-secret", requestId: "private-secret",
    message: "private-secret", retryable: "private-secret" })]) {
    const f = fixture(url => url.endsWith("/v1/chat") ? new Response(body, { status: 400 }) : undefined);
    const result = await runConsumerProbe(env, f.request);
    const receipt = result.data.calls.find(c => c.plane === "atlas" && c.outcome === "failed");
    assert.equal(receipt.error_code, null);
    assert.equal(receipt.server_request_id, null);
    assert.equal(receipt.http_status, 400);
    assert.ok(!JSON.stringify(result).includes("private-"));
  }
});

test("Skill prerequisites are metadata flags, never a claim of executable connector supply", () => {
  assert.deepEqual(skillPrerequisites("sandbase_describe_tool sandbase_call_tool private-secret"), {
    references_sandbase_tools: true, references_direct_exa_sdk: false });
  assert.deepEqual(skillPrerequisites("exa-py EXA_API_KEY=private-secret"), {
    references_sandbase_tools: false, references_direct_exa_sdk: true });
  assert.ok(!JSON.stringify(skillPrerequisites("EXA_API_KEY=private-secret")).includes("private-"));
});

test("business Skill is preferred while undeclared tool dependencies are never attributed as executed", async () => {
  const businessId = "sandbaseai.research-company-enrichment";
  const f = fixture((url, init, body) => {
    const params = body?.params;
    if (params?.name === "runos_discover" && params.arguments.filter.primitive_type === "skill") {
      return json({ result: { structuredContent: { capabilities: [row(businessId, "skill")], total: 1 } } });
    }
    if (params?.name === "runos_resolve" && params.arguments.capability_id === businessId) {
      return json({ result: { structuredContent: { capability_id: businessId, version: "1.0.1", state: "stable",
        contract: { operations: [{ operation: "fetch" }], dependencies: [] } } } });
    }
    if (params?.name === "runos_invoke" && params.arguments.capability_id === businessId) {
      return json({ result: { content: [{ type: "text", text: "Call sandbase_describe_tool then sandbase_call_tool. private-secret" }],
        structuredContent: meta("1.0.1", "distributed") } });
    }
  });
  const result = await runConsumerProbe(env, f.request);
  const sample = result.data.runos.skill_sample.data;
  assert.equal(sample.capability_id, businessId);
  assert.equal(sample.version, "1.0.1");
  assert.equal(sample.prerequisites.references_sandbase_tools, true);
  assert.equal(sample.execution_status, "not_executed");
  assert.equal(result.data.runos.public_research.data.declared_skill_dependency_used, false);
  assert.ok(!f.requests.some(r => /sandbase/.test(r.url)));
  assert.ok(!JSON.stringify(result).includes("private-"));
});
