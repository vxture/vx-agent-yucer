import assert from "node:assert/strict";
import test from "node:test";
import { paginate, publicUrls, runProbe, safeReason } from "./xiaoyu-supply-probe.mjs";

const context = { tenantId: "tenant", workspaceId: "workspace" };
const env = { OIDC_CLIENT_ID: "yucer", OIDC_CLIENT_SECRET: "private-credential",
  RUNOS_BASE_URL: "https://runos.test", ATLAS_BASE_URL: "https://atlas.test" };
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
      assert.equal(form.get("act_sub"), "yucer");
      assert.equal(form.get("tenant_id"), context.tenantId);
      assert.equal(form.get("workspace_id"), context.workspaceId);
      assert.equal(form.get("mode"), "service");
      return json({ access_token: "private-access-token", expires_in: 300 });
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
